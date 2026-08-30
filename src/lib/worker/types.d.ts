export type WASMSource =
  | { type: 'stream', stream: ReadableStream<Uint8Array> }
  | { type: 'url', url: string }

export interface WASMLoadingProgress {
  source: WASMSource
  bytesLoaded: number
  bytesTotal: number
  finished: Promise<void>
  cancel?: () => void
}

export interface ALSWorkerInitObject {
  wasmSource: WASMSource
  args?: string[]
  stdinWaker: MessagePort
  stdin: SharedArrayBuffer
  stdout: SharedArrayBuffer

  driveBuffers: DriveBuffers
}

export interface DriveBuffers {
  lock: SharedArrayBuffer
  stdin: SharedArrayBuffer
  stdout: SharedArrayBuffer
}

interface _WASISpawnOptions {
  ignoreExitCode?: boolean
  drive?: DriveBuffers
  env: Record<string, string>
}

export interface WASISpawnOptions extends Partial<_WASISpawnOptions> {}

export interface ALSWorkerInitResultProxied {
  getALSVersion: () => Promise<string>
  start: () => Promise<number>
  spawn: (args: string[], options?: WASISpawnOptions) =>
    Promise<{exitCode: number, stdout: string, stderr: string}>
}

export interface DriveWorkerInitObject {
  stdin: SharedArrayBuffer
  stdout: SharedArrayBuffer
  agdaDataZip: ArrayBuffer | null
  agdaStdlibZip: ArrayBuffer | null
  plfaProjectZip: ArrayBuffer | null
}
