import { createReadStream, createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip, constants } from "node:zlib";

const wasmPath = new URL("../build/als-2.8ext.wasm", import.meta.url);
const compressedPath = new URL("../build/als-2.8ext.wasm.gz", import.meta.url);

await pipeline(
  createReadStream(wasmPath),
  createGzip({ level: constants.Z_BEST_COMPRESSION }),
  createWriteStream(compressedPath),
);

await unlink(wasmPath);

const compressed = await stat(compressedPath);
console.log(
  `Prepared Cloudflare compiler asset: ${(compressed.size / 1024 / 1024).toFixed(1)} MiB`,
);
