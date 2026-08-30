import * as Runno from '@runno/wasi'
import wrapPollOneoff from './wrap-poll-oneoff'

const { Result } = Runno.WASISnapshotPreview1

type IovsDesc = { lenTotal: number; ptrlens: [number, number][]}

/**
 * @param {DataView} view
 * @param {number} iovs_ptr
 * @param {number} iovs_len
 * @returns {IovsDesc}
 */
function collectIOVectors(view: DataView, iovs_ptr: number, iovs_len: number): IovsDesc {
  const ptrlens: [number, number][] = []
  let lenTotal = 0

  for (let i = 0; i < iovs_len; i++) {
    const bufferPtr = view.getUint32(iovs_ptr, true)
    iovs_ptr += 4

    const bufferLen = view.getUint32(iovs_ptr, true)
    iovs_ptr += 4
    lenTotal += bufferLen

    ptrlens.push([bufferPtr, bufferLen])
  }

  return { lenTotal, ptrlens }
}

/**
 * @param {DataView} view
 * @param {IovsDesc} iovsDesc
 * @returns {Uint8Array}
 */
function readIOVectorsMerged(view: DataView, iovsDesc: IovsDesc): Uint8Array {
  const source = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)

  const result = new Uint8Array(iovsDesc.lenTotal)
  let written = 0
  for (const [ptr, len] of iovsDesc.ptrlens) {
    // XXX: is there a cleaner way?
    result.set(source.subarray(ptr, ptr + len), written)
    written += len
  }

  return result
}

/**
 * @param {Uint8Array} buf
 * @param {IovsDesc} iovsDesc
 * @param {Uint8Array} input
 */
function writeIntoIOVectors(buf: Uint8Array, iovsDesc: IovsDesc, input: Uint8Array) {
  const { ptrlens } = iovsDesc
  let written = 0
  for (const [ptr, len] of ptrlens) {
    const extent = Math.min(written + len, input.byteLength)
    buf.set(input.slice(written, extent), ptr)
    written = extent
    if (written === input.byteLength) break
  }
}

/**
 * @this {Runno.WASI}
 * @param {Runno.WASI['fd_read']} origFdRead
 * @returns {Runno.WASI['fd_read']}
 */
function wrapFdRead(
  this: Runno.WASI,
  origFdRead: Runno.WASI['fd_read']): Runno.WASI['fd_read'] {

  return (...args) => {
    const [fd, iovs_ptr, iovs_len, retptr0] = args
    if (fd !== 0) return origFdRead(...args)

    const view = new DataView(this.memory.buffer)
    const iovDescs = collectIOVectors(view, iovs_ptr, iovs_len)

    // not knowing a good reason why the original impl. requests
    // one read per iov

    const input = this.context.stdin(iovDescs.lenTotal) as Uint8Array | null

    if (input == null) {
      return Result.EAGAIN
    }

    const bytes = Math.min(iovDescs.lenTotal, input.byteLength)
    writeIntoIOVectors(new Uint8Array(this.memory.buffer), iovDescs, input)

    // FIXME: missing pushDebugData
    view.setUint32(retptr0, bytes, true)
    return Result.SUCCESS
  }
}

/**
 * @this {Runno.WASI}
 * @param {Runno.WASI['fd_write']} origFdWrite
 * @returns {Runno.WASI['fd_write']}
 */
function wrapFdWrite(
  this: Runno.WASI,
  origFdWrite: Runno.WASI['fd_write']): Runno.WASI['fd_write'] {
  return (...args) => {
    const [fd, ciovs_ptr, ciovs_len, retptr0] = args
    if (fd !== 1 && fd !== 2) return origFdWrite(...args)

    const view = new DataView(this.memory.buffer)
    const iovDescs = collectIOVectors(view, ciovs_ptr, ciovs_len)
    const iov = readIOVectorsMerged(view, iovDescs)

    if (iov.byteLength === 0) {
      return Result.SUCCESS
    }

    const stdfn = fd === 1 ? this.context.stdout : this.context.stderr
    stdfn(iov as any)

    // FIXME: missing pushDebugData
    view.setUint32(retptr0, iov.byteLength, true)
    return Result.SUCCESS
  }
}

/** @param {Runno.WASI} wasi
 * @param {{ pollStdin: (timeout: number) => boolean }} options */
export function patchImportObject(wasi: Runno.WASI, options: { pollStdin: (timeout: number) => boolean }) {
  const { wasi_snapshot_preview1, ...impObjRest } = wasi.getImportObject()

  const origFdRead = wasi_snapshot_preview1.fd_read
  const origFdWrite = wasi_snapshot_preview1.fd_write
  const origPollOneoff = wasi_snapshot_preview1.poll_oneoff
  return {
    ...impObjRest,
    wasi_snapshot_preview1: {
      ...wasi_snapshot_preview1,
      fd_read: wrapFdRead.bind(wasi)(origFdRead),
      fd_write: wrapFdWrite.bind(wasi)(origFdWrite),
      poll_oneoff: wrapPollOneoff.bind(wasi)(origPollOneoff, options.pollStdin)
    }
  }
}
