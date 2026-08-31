import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const staticRoot = path.join(projectRoot, "static");
const plfaRoot = path.join(staticRoot, "plfa");
const interfaceRoot = path.join(plfaRoot, "interfaces");

const [stdlibZip, plfaZip, manifest] = await Promise.all([
  JSZip.loadAsync(await readFile(path.join(staticRoot, "agda-stdlib-2.3.zip"))),
  JSZip.loadAsync(await readFile(path.join(plfaRoot, "project.zip"))),
  readFile(path.join(plfaRoot, "manifest.json"), "utf8").then(JSON.parse),
]);

const sources = new Map();

function literateCode(source) {
  return [...source.matchAll(/```agda[^\n]*\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .join("\n");
}

function stripComments(source) {
  return source.replace(/\{-[\s\S]*?-\}/g, " ").replace(/--.*$/gm, "");
}

async function collectSources(zip) {
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\.(?:agda|lagda|lagda\.md)$/.test(entry.name)) continue;
    const raw = await entry.async("string");
    const code = entry.name.endsWith(".lagda.md") ? literateCode(raw) : raw;
    const moduleName = code.match(/^\s*module\s+([^\s{]+)\s+where\b/m)?.[1];
    if (moduleName) sources.set(moduleName, stripComments(code));
  }
}

await Promise.all([collectSources(stdlibZip), collectSources(plfaZip)]);

const chapters = manifest.groups.flatMap((group) => group.chapters);
const chapterOrder = new Map(
  chapters.map((chapter, index) => [chapter.id, index]),
);
const owners = new Map();
const archiveSizes = new Map();

function interfaceModule(entryPath) {
  let relative;
  if (entryPath.startsWith("stdlib/_build/2.8.0/agda/src/")) {
    relative = entryPath.slice("stdlib/_build/2.8.0/agda/src/".length);
  } else if (entryPath.startsWith("_build/2.8.0/agda/")) {
    relative = entryPath.slice("_build/2.8.0/agda/".length);
  }
  return relative?.replace(/\.agdai$/, "").replaceAll("/", ".");
}

for (const chapter of chapters) {
  const archiveBytes = await readFile(
    path.join(interfaceRoot, `${chapter.id}.zip`),
  );
  archiveSizes.set(chapter.id, archiveBytes.byteLength);
  const archive = await JSZip.loadAsync(archiveBytes);
  for (const entry of Object.values(archive.files)) {
    if (!entry.name.endsWith(".agdai")) continue;
    const moduleName = interfaceModule(entry.name);
    if (moduleName && !owners.has(moduleName)) {
      owners.set(moduleName, chapter.id);
    }
  }
}

function directImports(moduleName) {
  const source = sources.get(moduleName);
  if (!source) return [];
  return [...source.matchAll(/^\s*(?:open\s+)?import\s+([^\s;()]+)/gm)].map(
    (match) => match[1],
  );
}

function dependencyClosure(root) {
  const visited = new Set();
  const pending = [root];
  while (pending.length) {
    const moduleName = pending.pop();
    if (visited.has(moduleName)) continue;
    visited.add(moduleName);
    pending.push(...directImports(moduleName));
  }
  return visited;
}

const interfaceArchives = {};
let cumulativeBytes = 0;
let cumulativeArchiveBytes = 0;
let selectedBytes = 0;

for (const chapter of chapters) {
  const moduleName = chapter.modulePath
    .replace(/^\//, "")
    .replace(/\.(?:agda|lagda|lagda\.md)$/, "")
    .replaceAll("/", ".");
  if (!owners.has(moduleName)) {
    throw new Error(`No bundled interface found for ${moduleName}`);
  }
  const archives = [
    ...new Set(
      [...dependencyClosure(moduleName)]
        .map((dependency) => owners.get(dependency))
        .filter(Boolean),
    ),
  ].sort((left, right) => chapterOrder.get(left) - chapterOrder.get(right));
  interfaceArchives[chapter.id] = archives;
  cumulativeArchiveBytes += archiveSizes.get(chapter.id);
  cumulativeBytes += cumulativeArchiveBytes;
  selectedBytes += archives.reduce(
    (total, archive) => total + archiveSizes.get(archive),
    0,
  );
}

await writeFile(
  path.join(interfaceRoot, "manifest.json"),
  `${JSON.stringify({ version: 1, chapters: interfaceArchives }, null, 2)}\n`,
);

console.log(
  `Indexed ${chapters.length} PLFA interface closures (${(selectedBytes / 1048576).toFixed(1)} MiB selected instead of ${(cumulativeBytes / 1048576).toFixed(1)} MiB cumulative across direct chapter opens).`,
);
