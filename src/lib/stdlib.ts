import { SPSCError } from 'spsc'
import type { SPSCReader } from 'spsc/reader'
import type { SPSCWriter } from 'spsc/writer'

export function fread(reader: SPSCReader, len: number): Uint8Array {
  let nread = 0
  let buf: undefined | Uint8Array

  if (len <= 0) return new Uint8Array()
  while (nread < len) {
    const rr = reader.read(len - nread)
    if (!rr.ok) {
      throw new Error('read failed')
    }
    if (buf === undefined) {
      if (rr.bytesRead === len) {
        // fast path: the buffer is fulfilled at once
        return rr.data
      }
      buf = new Uint8Array(len)
    }
    buf.set(rr.data, nread)
    nread += rr.bytesRead
  }
  return buf!
}

export function fwrite(writer: SPSCWriter, data: Uint8Array) {
  let nwritten = 0
  while (data.length) {
    const wr = writer.write(data)
    if (!wr.ok) {
      throw new Error('write failed')
    }
    nwritten += wr.bytesWritten
    data = data.subarray(wr.bytesWritten)
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function fwriteAsync(writer: SPSCWriter, data: Uint8Array, waitDur = 50) {
  let nwritten = 0
  while (data.length) {
    const wr = writer.write(data, { nonblock: true })
    if (!wr.ok) {
      if (wr.error === SPSCError.Again) {
        await sleep(waitDur)
        continue
      }
      throw new Error('write failed')
    }
    nwritten += wr.bytesWritten
    data = data.subarray(wr.bytesWritten)
  }
}

export async function freadAsync(reader: SPSCReader, n: number, waitDur = 50) {
  while (true) {
    await sleep(waitDur)
    const rr = reader.read(n, { nonblock: true })
    if (rr.ok) break
    if (rr.error !== SPSCError.Again) {
      throw new Error('read failed')
    }
  }
}

export function bufReadString(buffer: ArrayBufferLike, pos: number, len?: number) {
  if (len === undefined) {
    len = new Uint8Array(buffer).indexOf(0, pos)
    if (len < 0) throw new Error('buffer overflow')
    len -= pos
  }
  return new TextDecoder().decode(new Uint8Array(buffer, pos, len))
}

export function bufGetUint32LE(buf: Uint8Array) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  return view.getUint32(0, true)
}

export function makeBufUint32LE(n: number) {
  const buf = new Uint32Array([n])
  return new Uint8Array(buf.buffer)
}

export function writeLenPrefixed(writer: SPSCWriter, payload: Uint8Array) {
  fwrite(writer, makeBufUint32LE(payload.byteLength))
  fwrite(writer, payload)
}

export async function writeLenPrefixedAsync(writer: SPSCWriter, payload: Uint8Array, waitDur = 50) {
  await fwriteAsync(writer, makeBufUint32LE(payload.byteLength), waitDur)
  await fwriteAsync(writer, payload, waitDur)
}
