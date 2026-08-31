import * as Runno from "@runno/wasi";
import { SPSCReader } from "spsc/reader";
import { SPSCWriter } from "spsc/writer";
import JSZip from "jszip";
import { fread, bufGetUint32LE, writeLenPrefixed, fwrite } from "$lib/stdlib";

import { base64ToUint8Array } from "./util-base64";
import type { DriveWorkerInitObject } from "./types";

let lastTimestamp = Date.now();

function nextTimestamp() {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return new Date(lastTimestamp);
}

function createFileEntry(path: string, content: string | Uint8Array) {
  const now = nextTimestamp();
  const obj = {
    path,
    timestamps: {
      access: now,
      change: now,
      modification: now,
    },
    mode: typeof content === "string" ? "string" : ("binary" as any),
    content,
  } as Runno.WASIFile;
  return [path, obj] as const;
}

function equalContent(left: string | Uint8Array, right: string | Uint8Array) {
  if (typeof left === "string" || typeof right === "string") {
    return (
      typeof left === "string" && typeof right === "string" && left === right
    );
  }
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function replaceFileContent(file: Runno.WASIFile, content: Uint8Array) {
  if (file.mode === "binary" && equalContent(file.content, content))
    return false;
  const changed = nextTimestamp();
  file.mode = "binary";
  file.content = content;
  file.timestamps.change = changed;
  file.timestamps.modification = changed;
  return true;
}

function fsAssign(
  path: string,
  content: string | Uint8Array,
  target: Record<string, Runno.WASIFile> = fs,
) {
  const [key, obj] = createFileEntry(path, content);
  target[key] = obj;
  return obj;
}

const {
  stdin,
  stdout,
  agdaDataZip,
  agdaStdlibZip,
  plfaProjectZip,
  cacheNamespace,
} = await new Promise<DriveWorkerInitObject>((r) => {
  addEventListener(
    "message",
    (event) => {
      r(event.data);
    },
    { once: true },
  );
});

async function extractZip(
  data: ArrayBuffer | Uint8Array,
  prefix = "",
  pathResolver?: (path: string) => string | null,
  target?: Record<string, Runno.WASIFile>,
) {
  const zip = await JSZip.loadAsync(data);
  const filePromises: Promise<void>[] = [];

  if (prefix === "/") prefix = "";

  zip.forEach((_path, file) => {
    if (file.dir) return;
    const path = pathResolver ? pathResolver(_path) : _path;
    if (path == null) return;
    filePromises.push(
      file.async("uint8array").then((content) => {
        fsAssign(`${prefix}/${path}`, content, target);
      }),
    );
  });

  return Promise.all(filePromises);
}

// TODO: make this changable dynamically
const userSourceFilePath = "/Main.agda";

const fs: Record<string, Runno.WASIFile> = Object.fromEntries([
  createFileEntry(userSourceFilePath, ""),
]);

interface CachedFile {
  path: string;
  mode: "string" | "binary";
  content: string | Uint8Array;
  timestamps: { access: number; change: number; modification: number };
}

const dirtyCachePaths = new Set<string>();
const cacheDatabaseName = `agda-playground-drive-${cacheNamespace}`;

function openCacheDatabase() {
  return new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open(cacheDatabaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("files")) {
        request.result.createObjectStore("files", { keyPath: "path" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("Persistent Agda cache is unavailable", request.error);
      resolve(null);
    };
  });
}

function cacheTransaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void) => void,
) {
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction("files", mode);
    transaction.onerror = () => reject(transaction.error);
    run(transaction.objectStore("files"), resolve);
  });
}

async function restoreCachedFiles(database: IDBDatabase | null) {
  if (!database) return;
  const records = await cacheTransaction<CachedFile[]>(
    database,
    "readonly",
    (store, resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as CachedFile[]);
    },
  );
  for (const record of records) {
    fs[record.path] = {
      path: record.path,
      mode: record.mode,
      content:
        record.mode === "binary"
          ? new Uint8Array(record.content as Uint8Array)
          : (record.content as string),
      timestamps: {
        access: new Date(record.timestamps.access),
        change: new Date(record.timestamps.change),
        modification: new Date(record.timestamps.modification),
      },
    } as Runno.WASIFile;
    lastTimestamp = Math.max(
      lastTimestamp,
      record.timestamps.change,
      record.timestamps.modification,
    );
  }
}

async function persistCachedFiles(database: IDBDatabase | null) {
  if (!database || dirtyCachePaths.size === 0) return;
  const records: CachedFile[] = [...dirtyCachePaths].flatMap((path) => {
    const file = fs[path];
    if (!file) return [];
    return [
      {
        path,
        mode: file.mode,
        content:
          file.mode === "binary"
            ? new Uint8Array(file.content as Uint8Array)
            : file.content,
        timestamps: {
          access: file.timestamps.access.getTime(),
          change: file.timestamps.change.getTime(),
          modification: file.timestamps.modification.getTime(),
        },
      } as CachedFile,
    ];
  });
  await cacheTransaction<void>(database, "readwrite", (store, resolve) => {
    for (const record of records) store.put(record);
    store.transaction.oncomplete = () => resolve();
  });
  for (const record of records) dirtyCachePaths.delete(record.path);
}

if (agdaDataZip) {
  await extractZip(agdaDataZip, "/", (path) => {
    // agda-wasm-dist still ships primitive interfaces beside their sources,
    // but Agda 2.8 removed local interfaces and only looks in _build. Mount
    // the bundled interfaces where Agda 2.8 expects them so every browser
    // session does not recompile the primitive library from source.
    if (path.startsWith("lib/prim/") && path.endsWith(".agdai")) {
      return path.replace("lib/prim/", "lib/prim/_build/2.8.0/agda/");
    }
    return path;
  });
}

if (agdaStdlibZip) {
  await extractZip(agdaStdlibZip, "/stdlib", (p) => {
    if (
      !p.match(/^agda-stdlib-[\.\d]+\/(?:src|_build\/)/) &&
      !p.match(/^agda-stdlib-[\.\d]+\/standard-library\.agda-lib$/)
    ) {
      return null;
    }
    return p.replace(/^agda-stdlib-[\.\d]+\//, "");
  });
  fsAssign(
    "/home/root/.config/agda/libraries",
    "/stdlib/standard-library.agda-lib\n",
  );
  fsAssign("/home/root/.config/agda/defaults", "standard-library\n");
}

if (plfaProjectZip) {
  await extractZip(plfaProjectZip, "/");
  fsAssign(
    "/home/root/.config/agda/libraries",
    "/stdlib/standard-library.agda-lib\n/plfa.agda-lib\n",
  );
  fsAssign("/home/root/.config/agda/defaults", "standard-library\nplfa\n");
}

const cacheDatabase = await openCacheDatabase();
await restoreCachedFiles(cacheDatabase).catch((error) => {
  console.warn("Could not restore the persistent Agda cache", error);
});

postMessage("fs-ready");

const wasi = new Runno.WASI({ fs });
const drive = wasi.drive;

// do the normalization the dirty way
function removeTrailingDotDots(path: string) {
  let dotdotCount = 0;
  while (path.endsWith("/..")) {
    path = path.slice(0, -3);
    dotdotCount++;
  }

  if (path === "..") {
    return ".";
  }

  for (let i = 0; i < dotdotCount; i++) {
    const lastSlash = path.lastIndexOf("/", path.length - 4);
    if (lastSlash < 0) {
      return ".";
    }
    path = path.slice(0, lastSlash);
  }

  return path;
}

const origPathStat = drive.pathStat.bind(drive);
drive.pathStat = (fdDir: number, path: string) =>
  origPathStat(fdDir, removeTrailingDotDots(path));

const origDriveOpen = drive.open.bind(drive);
drive.open = (fdDir: number, path: string, oflags: number, fdflags: number) =>
  origDriveOpen(fdDir, removeTrailingDotDots(path), oflags, fdflags);

function cacheWrittenInterface(fd: number) {
  const openFile = drive.openMap.get(fd) as
    { file?: Runno.WASIFile } | undefined;
  const file = openFile?.file;
  if (file?.path.endsWith(".agdai")) {
    const changed = nextTimestamp();
    file.timestamps.change = changed;
    file.timestamps.modification = changed;
    dirtyCachePaths.add(file.path);
  }
}

const origDriveWrite = drive.write.bind(drive);
drive.write = (fd: number, data: Uint8Array) => {
  const result = origDriveWrite(fd, data);
  if (result === 0) cacheWrittenInterface(fd);
  return result;
};

const origDrivePwrite = drive.pwrite.bind(drive);
drive.pwrite = (fd: number, data: Uint8Array, offset: number) => {
  const result = origDrivePwrite(fd, data, offset);
  if (result === 0) cacheWrittenInterface(fd);
  return result;
};

const reader = new SPSCReader(stdin);
const writer = new SPSCWriter(stdout);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function mainLoop() {
  const driveProxy = drive as unknown as {
    [k: string]: (...args: any[]) => any;
  };
  while (true) {
    const typeBuf = fread(reader, 4);
    const msgType = bufGetUint32LE(typeBuf);

    if (msgType === 1) {
      const lenBuf = fread(reader, 4);
      const data = fread(reader, bufGetUint32LE(lenBuf));
      if (replaceFileContent(drive.fs[userSourceFilePath], data)) {
        dirtyCachePaths.add(userSourceFilePath);
      }
      fwrite(writer, new Uint8Array([0]));
      continue;
    } else if (msgType === 3) {
      const pathLenBuf = fread(reader, 4);
      const pathData = fread(reader, bufGetUint32LE(pathLenBuf));
      const contentLenBuf = fread(reader, 4);
      const content = fread(reader, bufGetUint32LE(contentLenBuf));
      const path = decoder.decode(pathData);
      const existing = drive.fs[path];
      if (existing) {
        if (replaceFileContent(existing, content)) dirtyCachePaths.add(path);
      } else {
        const [, entry] = createFileEntry(path, content);
        drive.fs[path] = entry;
        dirtyCachePaths.add(path);
      }
      fwrite(writer, new Uint8Array([0]));
      continue;
    } else if (msgType === 4) {
      const lenBuf = fread(reader, 4);
      const data = fread(reader, bufGetUint32LE(lenBuf));
      await extractZip(data, "/", undefined, drive.fs);
      fwrite(writer, new Uint8Array([0]));
      continue;
    } else if (msgType === 5) {
      await persistCachedFiles(cacheDatabase).catch((error) => {
        console.warn("Could not persist the Agda cache", error);
      });
      fwrite(writer, new Uint8Array([0]));
      continue;
    } else if (msgType === 2) {
      console.warn("DUMP FS", drive.fs);
      fwrite(writer, new Uint8Array([0]));
      continue;
    } else if (msgType !== 0) {
      throw new Error("Invalid msg type " + msgType);
    }

    const lenBuf = fread(reader, 4);
    const data = fread(reader, bufGetUint32LE(lenBuf));
    const req: { method: string; args: any[] } = JSON.parse(
      decoder.decode(data),
    );

    if (req.method === "write" || req.method === "pwrite") {
      req.args[1] = base64ToUint8Array(req.args[1]);
    }
    // console.warn('DRIVE <--', req)
    let res = driveProxy[req.method](...req.args);
    // console.warn('DRIVE -->', res)
    if (req.method === "read" || req.method === "pread") {
      const payload = new Uint8Array(4 + (res[1]?.byteLength ?? 0));
      new DataView(payload.buffer).setUint32(0, res[0], true);
      if (res[1] != null) payload.set(res[1], 4);
      writeLenPrefixed(writer, payload);
      continue;
    }
    if (req.method === "stat" || req.method === "pathStat") {
      const path =
        res[1] == null ? new Uint8Array() : encoder.encode(res[1].path);
      const payload = new Uint8Array(40 + path.byteLength);
      const view = new DataView(payload.buffer);
      view.setUint32(0, res[0], true);
      if (res[1] != null) {
        view.setFloat64(4, res[1].byteLength, true);
        view.setUint32(12, res[1].type, true);
        view.setFloat64(16, res[1].timestamps.access.getTime(), true);
        view.setFloat64(24, res[1].timestamps.modification.getTime(), true);
        view.setFloat64(32, res[1].timestamps.change.getTime(), true);
        payload.set(path, 40);
      }
      writeLenPrefixed(writer, payload);
      continue;
    }
    writeLenPrefixed(writer, encoder.encode(JSON.stringify(res)));
  }
}

mainLoop();
