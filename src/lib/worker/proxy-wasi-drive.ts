import { SPSCReader } from "spsc/reader";
import { SPSCWriter } from "spsc/writer";
import { bufGetUint32LE, fread, writeLenPrefixed } from "$lib/stdlib";
import { uint8ArrayToBase64 } from "./util-base64";

interface RunnoDriveProps {
  nextFD: number;
  openMap: Map<number, unknown>;
}

export type RunnoDrive = RunnoDriveProps & {
  [k in (typeof driveMethods)[number]]: (...args: any[]) => any;
};

// NOTE: non-JSON-serializable input/outputs are marked by asterisks (*)
// R<T> = [number - SUCCESS] | [SUCCESS, T]
// WASITimestamps = { a, m, c: Date }  <-- ***
// DE = { name: string; type: number }
// DS = {
//   path: string;
//   byteLength: number;
//   timestamps: WASITimestamps;  <-- ***
//   type: FileType = number;
// }

export const driveMethods = [
  "open", // (number, string, number, number) -> R<number>
  "close", // (number) -> number
  "read", // *O* (number, number) -> R<Uint8Array>
  "pread", // *O* (number, number, number) -> R<Uint8Array>
  "write", // *I* (number, Uint8Array) -> number
  "pwrite", // *I* (number, Uint8Array, number) -> number
  "sync", // (number) -> number
  "seek", // *I/O* (number, bigint, number) -> R<bigint>
  "tell", // *I/O* (number, bigint, number) -> R<bigint>
  "renumber", // (number, number) -> number
  "unlink", // (number, string) -> number
  "rename", // (number, string, number, string) -> number
  "list", // (number) -> R<DE[]>
  "stat", // *O* (number) -> R<DS>
  "pathStat", // *O* (number, string) -> R<DS>
  "setFlags", // (number, number) -> number
  "setSize", // *I* (number, bigint) -> number
  "setAccessTime", // *I* (number, Date) -> number
  "setModificationTime", // *I* (number, Date) -> number
  "pathSetAccessTime", // *I* (number, string, Date) -> number
  "pathSetModificationTime", // *I* (number, string, Date) -> number
  "pathCreateDir", // (number, string) -> number
  "exists", // (number) -> boolean
  "fileType", // (number) -> number
  "fileFdflags", // (number) -> number
] as const;

// TODO: properly ser/deser all methods
export function proxyWASIDrive(
  drive: RunnoDrive,
  lock: SharedArrayBuffer,
  stdin: SharedArrayBuffer,
  stdout: SharedArrayBuffer,
) {
  const driveMutex = new Int32Array(lock, 0, 1);
  const reader = new SPSCReader(stdin);
  const writer = new SPSCWriter(stdout);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  for (const method of driveMethods) {
    drive[method] = (...args) => {
      if (method === "setSize") {
        args[1] = args[1].toString();
      } else if (method === "write" || method === "pwrite") {
        if (args[1] != null) {
          args[1] = uint8ArrayToBase64(args[1]);
        }
      }

      while (true) {
        const oldFlag = Atomics.compareExchange(driveMutex, 0, 0, 1);
        if (oldFlag === 0) break;
        Atomics.wait(driveMutex, 0, oldFlag);
      }

      writer.write(new Uint8Array(new Uint32Array([0]).buffer));
      writeLenPrefixed(
        writer,
        encoder.encode(JSON.stringify({ method, args })),
      );
      Atomics.notify(driveMutex, 0, 1);

      const buf = fread(reader, 4);
      const payloadLength = bufGetUint32LE(buf);
      const recved = fread(reader, payloadLength);

      const oldFlag = Atomics.compareExchange(driveMutex, 0, 1, 0);
      if (oldFlag !== 1) {
        throw new Error("mutex content is corrupted");
      }
      Atomics.notify(driveMutex, 0, 1);

      // Interface files dominate an incremental Agda check. Keep read results
      // binary across the shared-memory bridge instead of expanding every
      // byte through JSON + Base64 in both workers.
      if (method === "read" || method === "pread") {
        if (recved.byteLength < 4) {
          throw new Error(`Invalid binary ${method} response`);
        }
        const errno = new DataView(
          recved.buffer,
          recved.byteOffset,
          4,
        ).getUint32(0, true);
        return errno === 0 ? [errno, recved.subarray(4)] : [errno];
      }

      if (method === "pathStat" || method === "stat") {
        if (recved.byteLength < 4) {
          throw new Error(`Invalid binary ${method} response`);
        }
        const view = new DataView(recved.buffer, recved.byteOffset);
        const errno = view.getUint32(0, true);
        if (errno !== 0) return [errno];
        if (recved.byteLength < 40) {
          throw new Error(`Invalid successful binary ${method} response`);
        }
        return [
          errno,
          {
            path: decoder.decode(recved.subarray(40)),
            byteLength: view.getFloat64(4, true),
            type: view.getUint32(12, true),
            timestamps: {
              access: new Date(view.getFloat64(16, true)),
              modification: new Date(view.getFloat64(24, true)),
              change: new Date(view.getFloat64(32, true)),
            },
          },
        ];
      }

      let data = JSON.parse(decoder.decode(recved));

      return data;
    };
  }
}
