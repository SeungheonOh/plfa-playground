/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import * as Comlink from 'comlink'
import * as Runno from '@runno/wasi'

import { SPSCError } from 'spsc'
import { SPSCReader } from 'spsc/reader'
import { SPSCWriter } from 'spsc/writer'
import { patchImportObject } from './patch-wasi'
import { proxyWASIDrive } from './proxy-wasi-drive'
import type { ALSWorkerInitObject, WASISpawnOptions } from './types'

type MyStdioDef = {
  stdin: (len: number) => Uint8Array | null
  stdout: (out: Uint8Array) => void
  stderr: (err: Uint8Array) => void
}

type PatchedRunnoWASIContextOptions = Partial<
  Omit<Runno.WASIContextOptions, 'stdin' | 'stdout' | 'stderr'> & MyStdioDef
>

export {}

if (!crossOriginIsolated) {
  throw new Error('The worker should be run in a COI context.')
}

const { WASI } = Runno

async function compileWasm(wasmSource: ALSWorkerInitObject['wasmSource']) {
  if (wasmSource.type === 'url') {
    return WebAssembly.compile(await fetch(wasmSource.url).then(x => x.arrayBuffer()))
  }
  return WebAssembly.compileStreaming(new Response(wasmSource.stream, {
    headers: { 'Content-Type': 'application/wasm' },
  }))
}

type RunnoDebugFnExt = Runno.DebugFn & { wasi: Runno.WASI }

const runnoInterceptor: Runno.DebugFn = (name, args_, ret, _data) => {
  const args = args_ as unknown as number[]

  // hide the warn failing to set stdin to nonblocking mode
  if (name === 'fd_fdstat_set_flags' && args[0] === 0 && args[1] === 4) {
    return 0  // success
  }
  // fake that readlink always finds something that is not a symlink
  if (name === 'path_readlink') {
    // const path = memReadString((runnoInterceptor as RunnoDebugFnExt).wasi.memory, args[1], args[2])
    return 28  // EINVAL
  }

  // stat-ing a non-existent path
  if (name === 'path_filestat_get' && ret === 76) {
    return 44  // ENOENT
  }
  // workaround a bug where mkdir's error code is wrong
  if (name === 'path_create_directory' && ret === 76) {
    return 20  // EEXIST
  }
  return ret
}

/** spin up a one-off instance and collect its output. */
async function wasiSpawn(
  module: WebAssembly.Module,
  args: string[] = [],
  options: WASISpawnOptions = {}) {

  const stdout: string[] = []
  const stderr: string[] = []

  const wasi = new WASI({
    args: ['als', ...args],
    env: options.env,
    debug: runnoInterceptor,
    stdout: str => stdout.push(str),
    stderr: str => stderr.push(str),
  })
  ;(runnoInterceptor as RunnoDebugFnExt).wasi = wasi

  if (options.drive) {
    const { lock: driveLock, stdin: driveStdin, stdout: driveStdout } = options.drive
    proxyWASIDrive(wasi.drive, driveLock, driveStdin, driveStdout)
  }

  const instance = await WebAssembly.instantiate(module, wasi.getImportObject())
  const { exitCode } = wasi.start({ module, instance })

  if (!options.ignoreExitCode && exitCode !== 0) {
    throw new Error(`Program exited with non-zero status ${exitCode}`)
  }

  return {
    exitCode,
    stdout: stdout.join(''),
    stderr: stderr.join(''),
  }
}

let stderrBuf = ''
const stderrDecoder = new TextDecoder()

/**
 * @param {PatchedRunnoWASIContextOptions} opt
 * @returns {Runno.WASIContextOptions} */
function definePatchedRunnoWASIContextOptions(
  opt: PatchedRunnoWASIContextOptions): Runno.WASIContextOptions {
  return opt as any
}

async function init({
  wasmSource,
  stdinWaker,
  stdin,
  stdout,
  args = [],
  driveBuffers,
}: ALSWorkerInitObject) {

  const stdinReader = new SPSCReader(stdin)
  const stdoutWriter = new SPSCWriter(stdout, stdinWaker)

  const module = await compileWasm(wasmSource)
  let alsVersion: string | null = null

  const env = {
    'HOME': '/home/root',
    'Agda_datadir': '/',
  }

  async function start() {
    const wasi = new WASI(definePatchedRunnoWASIContextOptions({
      args: ['als', ...args],
      env,
      debug: runnoInterceptor,
      stdin(len) {
        const result = stdinReader.read(len, { nonblock: true })
        if (!result.ok) {
          if (result.error == SPSCError.Again) {
            return null
          }
          throw new Error(`WASM failed to read from stdin: ${result.error}`)
        }
        return result.data
      },
      stdout(buf) {
        const result = stdoutWriter.write(buf)
        if (!result.ok) {
          throw new Error(`WASM failed to write to stdout: ${result.error}`)
        }
        if (result.bytesWritten !== buf.byteLength) {
          throw new Error(`WASM did not write exact number of bytes to stdout: ${result.bytesWritten} != ${buf.byteLength}`)
        }
      },
      stderr(buf) {
        // FIXME: the output will not be consumed by the main thread
        let str = stderrDecoder.decode(buf, { stream: true })
        let nl
        while (nl = str.indexOf('\n'), nl >= 0) {
          console.warn('>>> ' + stderrBuf + str.slice(0, nl))
          stderrBuf = ''
          str = str.slice(nl + 1)
        }
        stderrBuf += str
      },
    }))
    ;(runnoInterceptor as RunnoDebugFnExt).wasi = wasi

    const importObject = patchImportObject(wasi, {
      pollStdin(timeout) {
        let waitDuration = timeout < 0 ? Infinity : Math.max(timeout - Date.now(), 0)
        return stdinReader.pollRead(waitDuration)
      }
    })

    const instance = await WebAssembly.instantiate(module, importObject)
    const { lock: driveLock, stdin: driveStdin, stdout: driveStdout } = driveBuffers
    proxyWASIDrive(wasi.drive, driveLock, driveStdin, driveStdout)
    return wasi.start({ module, instance }).exitCode
  }

  return Comlink.proxy({
    getALSVersion: async () => alsVersion ?? (alsVersion = await wasiSpawn(module, ['--version']).then(x => x.stdout)),
    start,
    spawn: (args: string[], options: WASISpawnOptions) => wasiSpawn(module, args, { drive: driveBuffers, env, ...options }),
    // TODO: make a specialized spawn to run "--setup" but strips unnecessary files
  })
}

Comlink.expose({
  init,
})
