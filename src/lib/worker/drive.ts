import * as Runno from '@runno/wasi'
import { SPSCReader } from 'spsc/reader'
import { SPSCWriter } from 'spsc/writer'
import JSZip from 'jszip'
import { fread, bufGetUint32LE, writeLenPrefixed, fwrite } from '$lib/stdlib'

import { uint8ArrayToBase64, base64ToUint8Array } from './util-base64'
import type { DriveWorkerInitObject } from './types'

const now = new Date()

function createFileEntry(path: string, content: string | Uint8Array) {
  const obj = {
    path,
    timestamps: {
      access: now,
      change: now,
      modification: now,
    },
    mode: typeof content === 'string' ? 'string' : 'binary' as any,
    content,
  } as Runno.WASIFile
  return [path, obj] as const
}

function fsAssign(
  path: string,
  content: string | Uint8Array,
  target: Record<string, Runno.WASIFile> = fs,
) {
  const [key, obj] = createFileEntry(path, content)
  target[key] = obj
  return obj
}

const { stdin, stdout, agdaDataZip, agdaStdlibZip, plfaProjectZip } = await new Promise<DriveWorkerInitObject>(r => {
  addEventListener('message', event => {
    r(event.data)
  }, { once: true })
})

async function extractZip(
  data: ArrayBuffer | Uint8Array,
  prefix = '',
  pathResolver?: (path: string) => string | null,
  target?: Record<string, Runno.WASIFile>,
) {
  const zip = await JSZip.loadAsync(data)
  const filePromises: Promise<void>[] = []

  if (prefix === '/') prefix = ''

  zip.forEach((_path, file) => {
    if (file.dir) return
    const path = pathResolver ? pathResolver(_path) : _path
    if (path == null) return
    filePromises.push(file.async('uint8array').then(content => {
      fsAssign(`${prefix}/${path}`, content, target)
    }))
  })

  return Promise.all(filePromises)
}

// TODO: make this changable dynamically
const userSourceFilePath = '/Main.agda'

const fs: Record<string, Runno.WASIFile> = Object.fromEntries([
  createFileEntry(userSourceFilePath, ''),
])

if (agdaDataZip) {
  await extractZip(agdaDataZip, '/')
}

if (agdaStdlibZip) {
  await extractZip(agdaStdlibZip, '/stdlib', p => {
    if (!p.match(/^agda-stdlib-[\.\d]+\/(?:src|_build\/)/) &&
        !p.match(/^agda-stdlib-[\.\d]+\/standard-library\.agda-lib$/)) {
      return null
    }
    return p.replace(/^agda-stdlib-[\.\d]+\//, '')
  })
  fsAssign('/home/root/.config/agda/libraries', '/stdlib/standard-library.agda-lib\n')
  fsAssign('/home/root/.config/agda/defaults', 'standard-library\n')
}

if (plfaProjectZip) {
  await extractZip(plfaProjectZip, '/')
  fsAssign(
    '/home/root/.config/agda/libraries',
    '/stdlib/standard-library.agda-lib\n/plfa.agda-lib\n',
  )
  fsAssign('/home/root/.config/agda/defaults', 'standard-library\nplfa\n')
}

postMessage('fs-ready')

const wasi = new Runno.WASI({ fs })
const drive = wasi.drive

// do the normalization the dirty way
function removeTrailingDotDots(path: string) {
  let dotdotCount = 0
  while (path.endsWith('/..')) {
    path = path.slice(0, -3)
    dotdotCount++
  }

  if (path === '..') {
    return '.'
  }

  for (let i = 0; i < dotdotCount; i++) {
    const lastSlash = path.lastIndexOf('/', path.length - 4)
    if (lastSlash < 0) {
      return '.'
    }
    path = path.slice(0, lastSlash)
  }

  return path
}

const origPathStat = drive.pathStat.bind(drive)
drive.pathStat = (fdDir: number, path: string) =>
  origPathStat(fdDir, removeTrailingDotDots(path))

const origDriveOpen = drive.open.bind(drive)
drive.open = (fdDir: number, path: string, oflags: number, fdflags: number) =>
  origDriveOpen(fdDir, removeTrailingDotDots(path), oflags, fdflags)

const reader = new SPSCReader(stdin)
const writer = new SPSCWriter(stdout)

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function mainLoop() {
  const driveProxy = drive as unknown as {[k: string]: (...args: any[]) => any}
  while (true) {
    const typeBuf = fread(reader, 4)
    const msgType = bufGetUint32LE(typeBuf)

    if (msgType === 1) {
      const lenBuf = fread(reader, 4)
      const data = fread(reader, bufGetUint32LE(lenBuf))
      drive.fs[userSourceFilePath].mode = 'binary'
      drive.fs[userSourceFilePath].content = data
      fwrite(writer, new Uint8Array([0]))
      continue
    } else if (msgType === 3) {
      const pathLenBuf = fread(reader, 4)
      const pathData = fread(reader, bufGetUint32LE(pathLenBuf))
      const contentLenBuf = fread(reader, 4)
      const content = fread(reader, bufGetUint32LE(contentLenBuf))
      const path = decoder.decode(pathData)
      const existing = drive.fs[path]
      if (existing) {
        existing.mode = 'binary'
        existing.content = content
      } else {
        const [, entry] = createFileEntry(path, content)
        drive.fs[path] = entry
      }
      fwrite(writer, new Uint8Array([0]))
      continue
    } else if (msgType === 4) {
      const lenBuf = fread(reader, 4)
      const data = fread(reader, bufGetUint32LE(lenBuf))
      await extractZip(data, '/', undefined, drive.fs)
      fwrite(writer, new Uint8Array([0]))
      continue
    } else if (msgType === 2) {
      console.warn('DUMP FS', drive.fs)
      fwrite(writer, new Uint8Array([0]))
      continue
    } else if (msgType !== 0) {
      throw new Error('Invalid msg type ' + msgType)
    }

    const lenBuf = fread(reader, 4)
    const data = fread(reader, bufGetUint32LE(lenBuf))
    const req: { method: string; args: any[] } = JSON.parse(decoder.decode(data))

    if (req.method === 'write') {
      req.args[1] = base64ToUint8Array(req.args[1])
    }
    // console.warn('DRIVE <--', req)
    let res = driveProxy[req.method](...req.args)
    // console.warn('DRIVE -->', res)
    if (req.method === 'read') {
      res[1] = uint8ArrayToBase64(res[1])
    }
    writeLenPrefixed(writer, encoder.encode(JSON.stringify(res)))
  }
}

mainLoop()
