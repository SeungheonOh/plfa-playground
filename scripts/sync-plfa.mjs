import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  browserAgdaModules,
  browserAgdaSource,
} from "../src/lib/agda/browser-source.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoot = path.resolve(
  process.argv[2] ?? path.join(projectRoot, "..", "plfa.github.io"),
);
const bookRoot = path.join(sourceRoot, "src", "plfa");
const outputRoot = path.join(projectRoot, "static", "plfa");

const groups = [
  {
    id: "part1",
    title: "Part 1 · Logical foundations",
    chapters: [
      "Naturals",
      "Induction",
      "Relations",
      "Equality",
      "Isomorphism",
      "Connectives",
      "Negation",
      "Quantifiers",
      "Decidable",
      "Lists",
    ],
  },
  {
    id: "part2",
    title: "Part 2 · Programming language foundations",
    chapters: [
      "Lambda",
      "Properties",
      "DeBruijn",
      "More",
      "Bisimulation",
      "Inference",
      "Untyped",
      "Substitution",
      "BigStep",
      "Confluence",
    ],
  },
  {
    id: "part3",
    title: "Part 3 · Denotational semantics",
    chapters: [
      "Denotational",
      "Compositional",
      "Soundness",
      "Adequacy",
      "ContextualEquivalence",
    ],
  },
];

function extractFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  const body = match ? source.slice(match[0].length) : source;
  const title = match?.[1].match(/^title\s*:\s*["']?(.+?)["']?\s*$/m)?.[1];
  return { title, body };
}

function git(args) {
  return execFileSync("git", ["-C", sourceRoot, ...args], {
    encoding: "utf8",
  }).trim();
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, "content"), { recursive: true });

const zip = new JSZip();
const manifestGroups = [];

for (const group of groups) {
  const chapters = [];
  const groupOutput = path.join(outputRoot, "content", group.id);
  await mkdir(groupOutput, { recursive: true });

  for (const name of group.chapters) {
    const relativeSource = path.join(group.id, `${name}.lagda.md`);
    const source = await readFile(path.join(bookRoot, relativeSource), "utf8");
    const { title = name } = extractFrontmatter(source);
    const id = `${group.id}/${name}`;

    await writeFile(path.join(groupOutput, `${name}.lagda.md`), source);
    zip.file(
      `plfa/${group.id}/${name}.lagda.md`,
      browserAgdaSource(`/plfa/${group.id}/${name}.lagda.md`, source),
    );

    chapters.push({
      id,
      name,
      title,
      sourcePath: `/plfa/content/${id}.lagda.md`,
      modulePath: `/plfa/${id}.lagda.md`,
    });
  }

  manifestGroups.push({ ...group, chapters });
}

zip.file("plfa.agda-lib", "name: plfa\ndepend: standard-library\ninclude: .\n");

for (const [name, source] of Object.entries(browserAgdaModules)) {
  zip.file(name, source);
}

const commit = git(["rev-parse", "HEAD"]);
const revisionDate = git(["show", "-s", "--format=%cs", "HEAD"]);
const manifest = {
  title: "Programming Language Foundations in Agda",
  source: "https://github.com/plfa/plfa.github.io",
  license: "CC BY 4.0",
  commit,
  revisionDate,
  groups: manifestGroups,
};

await Promise.all([
  writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  ),
  writeFile(
    path.join(outputRoot, "project.zip"),
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  ),
  readFile(path.join(sourceRoot, "LICENSE")).then((license) =>
    writeFile(path.join(outputRoot, "LICENSE"), license),
  ),
]);

console.log(
  `Synced ${manifestGroups.reduce((count, group) => count + group.chapters.length, 0)} PLFA chapters at ${commit.slice(0, 12)}.`,
);
