import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const buildRoot = path.join(projectRoot, ".build-tmp");
const stdlibArchive = path.join(projectRoot, "static", "agda-stdlib-2.3.zip");
const plfaArchive = path.join(projectRoot, "static", "plfa", "project.zip");
const plfaManifest = path.join(projectRoot, "static", "plfa", "manifest.json");
const interfaceRoot = path.join(projectRoot, "static", "plfa", "interfaces");
const agdaBinary = process.argv[2] ?? process.env.AGDA ?? "agda";

async function extract(zip, destination) {
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const target = path.resolve(destination, name);
    if (!target.startsWith(`${path.resolve(destination)}${path.sep}`)) {
      throw new Error(`Refusing unsafe archive path: ${name}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await entry.async("nodebuffer"));
  }
}

async function findInterfaces(root) {
  const interfaces = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name.endsWith(".agdai"))
        interfaces.push(file);
    }
  }
  await visit(root);
  return interfaces;
}

function removeInterfaces(zip) {
  for (const name of Object.keys(zip.files)) {
    if (name.endsWith(".agdai")) zip.remove(name);
  }
}

function archivePath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

async function collectRuntimeInterfaces(
  workingDirectory,
  stdlibRoot,
  stdlibBuild,
  plfaBuild,
) {
  const [stdlibFiles, plfaFiles] = await Promise.all([
    findInterfaces(stdlibBuild),
    findInterfaces(plfaBuild),
  ]);
  return [
    ...stdlibFiles.map((file) => ({
      file,
      path: `stdlib/${archivePath(stdlibRoot, file)}`,
      library: "standard-library",
    })),
    ...plfaFiles.map((file) => ({
      file,
      path: archivePath(workingDirectory, file),
      library: "PLFA",
    })),
  ];
}

async function writeInterfaceBundle(chapter, entries) {
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.path, await readFile(entry.file));
  const output = path.join(interfaceRoot, `${chapter.id}.zip`);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    await zip.generateAsync({
      type: "nodebuffer",
      compression: "STORE",
    }),
  );
}

const version = spawnSync(agdaBinary, ["--version"], { encoding: "utf8" });
if (version.error) throw version.error;
if (version.status !== 0 || !version.stdout.startsWith("Agda version 2.8.0")) {
  throw new Error(
    `PLFA interfaces require Agda 2.8.0; received ${version.stdout.trim() || "an unknown version"}`,
  );
}

await mkdir(buildRoot, { recursive: true });
const workingDirectory = await mkdtemp(
  path.join(buildRoot, "plfa-interface-cache-"),
);

try {
  const [stdlibZip, plfaZip] = await Promise.all([
    JSZip.loadAsync(await readFile(stdlibArchive)),
    JSZip.loadAsync(await readFile(plfaArchive)),
  ]);
  await Promise.all([
    extract(stdlibZip, workingDirectory),
    extract(plfaZip, workingDirectory),
  ]);

  const stdlibRoot = path.join(workingDirectory, "agda-stdlib-2.3");
  const stdlibBuild = path.join(stdlibRoot, "_build");
  const plfaBuild = path.join(workingDirectory, "_build");
  await Promise.all([
    rm(stdlibBuild, { recursive: true, force: true }),
    rm(plfaBuild, { recursive: true, force: true }),
    rm(interfaceRoot, { recursive: true, force: true }),
  ]);

  const manifest = JSON.parse(await readFile(plfaManifest, "utf8"));
  const chapters = manifest.groups.flatMap((group) => group.chapters);
  const bundledPaths = new Set();
  for (const [index, chapter] of chapters.entries()) {
    console.log(`[${index + 1}/${chapters.length}] ${chapter.id}`);
    const source = path.join(
      workingDirectory,
      chapter.modulePath.replace(/^\//, ""),
    );
    const result = spawnSync(
      agdaBinary,
      [
        "--warning=noUnsupportedIndexedMatch",
        "--no-libraries",
        "-i",
        workingDirectory,
        "-i",
        path.join(stdlibRoot, "src"),
        source,
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(
        `Agda exited with status ${result.status} while checking ${chapter.id}`,
      );
    }

    const currentInterfaces = await collectRuntimeInterfaces(
      workingDirectory,
      stdlibRoot,
      stdlibBuild,
      plfaBuild,
    );
    const newInterfaces = currentInterfaces.filter(
      (entry) => !bundledPaths.has(entry.path),
    );
    await writeInterfaceBundle(chapter, newInterfaces);
    for (const entry of newInterfaces) bundledPaths.add(entry.path);
  }

  const [stdlibInterfaces, plfaInterfaces] = await Promise.all([
    findInterfaces(stdlibBuild),
    findInterfaces(plfaBuild),
  ]);
  removeInterfaces(stdlibZip);
  removeInterfaces(plfaZip);

  const options = {
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  };
  const [stdlibOutput, plfaOutput] = await Promise.all([
    stdlibZip.generateAsync(options),
    plfaZip.generateAsync(options),
  ]);
  const stdlibNext = `${stdlibArchive}.next`;
  const plfaNext = `${plfaArchive}.next`;
  await Promise.all([
    writeFile(stdlibNext, stdlibOutput),
    writeFile(plfaNext, plfaOutput),
  ]);
  await Promise.all([
    rename(stdlibNext, stdlibArchive),
    rename(plfaNext, plfaArchive),
  ]);

  console.log(
    `Bundled ${stdlibInterfaces.length} standard-library interfaces and ${plfaInterfaces.length} PLFA interfaces across ${chapters.length} lazy archives.`,
  );
} finally {
  await rm(workingDirectory, { recursive: true, force: true });
}
