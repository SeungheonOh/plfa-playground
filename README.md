# Agda Playground

A complete Agda 2.8 editing and interaction environment that runs locally in a
web browser. The compiler and language server are a 33 MB WASI executable (10
MB over the wire with gzip); code does not need to be sent to a server.

## What works

- Agda type checking, compiler highlighting, goals, errors, and warnings
- Language-server hover types plus buffer/import-aware name completion
- Agda/Emacs-style Unicode composition (`\\to` → `→`, `\\all` → `∀`, etc.)
- Goal type and context inspection
- Give, Refine, and case-split interactions that edit and re-check the source
- Top-level type inference and normalization
- Bundled Agda standard library 2.3
- Embedded PLFA book with each native `.lagda.md` chapter rendered beside its
  editable, type-checkable literate source and browser-local progress
- Autosave in browser storage, examples, keyboard checking, responsive layout,
  and a resizable goal inspector
- Persistent, versioned source and interface caches in IndexedDB
- The standard Emacs `agda2-mode` interaction chords (`C-c C-l`, `C-c C-f`,
  `C-c C-SPC`, `C-c C-r`, `C-c C-c`, `C-c C-t`, `C-c C-e`, `C-c C-d`, and
  `C-c C-n`)

## Run locally

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. Press Ctrl/Cmd+Enter to check the module. The
first visit downloads and initializes the compiler; subsequent visits can use
the browser cache.

Press Ctrl+Space for name completion. Agda's stock Emacs mode does not provide
semantic identifier completion itself; its completion-like experience is the
Unicode input method. This playground keeps that input method and supplements
it with names from the current buffer and known exports of imported builtin
modules.

The app requires `SharedArrayBuffer`. Production hosts must return these
headers for every route and asset:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`static/_headers` is ready for Cloudflare Pages. A service-worker fallback is
also included for static hosts that cannot configure response headers.

## Build and verify

```sh
npm run check
npm test
npm run build
```

The static site is written to `build/`. See [`compiler/README.md`](compiler/README.md)
to rebuild the Agda WASM executable from pinned sources.

With a local Chromium/Chrome executable available, run the browser regression
benchmark against every PLFA chapter with:

```sh
PLAYGROUND_URL=http://127.0.0.1:5173 npm run benchmark:plfa
```

Set `CHROME_EXECUTABLE` when Chrome is not on `PATH`. `CHAPTERS=Naturals,Lambda`
can narrow a diagnostic run; an unset `CHAPTERS` always covers the complete
book.

## Architecture

The main thread hosts CodeMirror and an LSP client. A dedicated worker runs the
Agda Language Server under WASI, while a second worker owns its in-memory
filesystem and the bundled standard library. Shared single-producer/single-
consumer buffers connect the workers without a remote backend. File contents
and metadata cross that bridge as binary data rather than JSON/Base64. Agda
interaction commands and raw JSON responses power the goal-oriented editor
actions.

The compiler is unmodified, stock Agda. Checks reuse Agda's own interfaces and
one long-lived interaction process. A single edit inside an existing goal uses
Agda's standard `Cmd_give` path; declaration, import, multi-goal, and ambiguous
edits always fall back to a complete `Cmd_load`, so changed code is never
silently accepted from a stale result.

## PLFA responsiveness

All 25 bundled PLFA chapters are compiled and exercised by the browser
benchmark, not just `Naturals`. On the reference development machine, a real
warm declaration edit averaged 3.01 s across the complete book (median 3.08 s,
95th percentile 4.35 s, maximum 4.59 s), down from a 9.37 s baseline. Editing
and checking an existing goal normally takes about 20–60 ms.

The browser archive includes position-compatible PLFA adapters for a small set
of broad standard-library imports. The displayed `.lagda.md` text remains the
book's original source, while each replacement module name occupies exactly the
same UTF-8 width so Agda ranges, highlighting, errors, goals, and document/code
scroll synchronization stay aligned. These adapters are ordinary checked Agda
modules, not compiler patches.

## Refresh the embedded PLFA edition

Clone [`plfa/plfa.github.io`](https://github.com/plfa/plfa.github.io), then run:

```sh
npm run sync:plfa -- /path/to/plfa.github.io
npm run precompile:plfa -- /path/to/agda-2.8.0
```

This rebuilds the chapter manifest, native literate Agda sources, browser
filesystem archive, and PLFA license copy under `static/plfa/`. The second
command refreshes the Agda 2.8 interface cache for every bundled chapter and
its standard-library dependencies, keeping browser checks fast without a
server. Interfaces are emitted as deduplicated per-chapter archives under
`static/plfa/interfaces/`. A generated dependency index makes the browser mount
only archives in the selected chapter's transitive import closure instead of
every earlier book chapter. The source-only standard-library archive therefore
stays small for users who never open PLFA.

## Bundling another local Agda library

The browser drive can mount any ZIP containing sources, Agda interfaces, or
both. Preserve the library's virtual paths in the archive: sources belong under
their library root and generated interfaces under that root's
`_build/2.8.0/agda/` directory. Use stored ZIP entries rather than deflate;
Agda interfaces compress only slightly and are much faster to mount this way.

Interfaces must be generated by Agda 2.8.0 with the same source files, include
paths, library versions, and relevant flags used in the browser. Agda checks
the hashes and safely ignores a stale or incompatible interface. The public
`mountDriveArchives()` controller method is the runtime hook for future local
library bundles. Browser-created source and newly generated interfaces are
persisted in a versioned IndexedDB cache, and changed sources receive newer
virtual modification times so Agda will reject stale interfaces normally.
