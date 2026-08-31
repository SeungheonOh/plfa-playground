# Building the Agda compiler

The browser compiler is a WASI build of the Agda Language Server with Agda's
JSON interaction mode enabled. `build-agda-wasm.sh` pins both source revisions:

- Agda Language Server: `e65419f89e3152c2922e948b3e4d24580172bc6a`
- Agda 2.8 browser fork: `e2f8c69414fa115328280ecc4de1d2b7a23be7fa`
- ghc-wasm-meta: `c3f44696d29aaeadd755d69c51735954bfcd59db`
  with the `9.10` flavour

Install that pinned `ghc-wasm-meta` toolchain and the native build utilities
`autoreconf`, `alex`, and `happy`, then run:

```sh
./compiler/build-agda-wasm.sh
```

Set `WASM_CABAL`, `WASM_OPT`, or `AGDA_WASM_WORK_DIR` to override tool and
working paths. The final optimized binary is written to
`static/als-2.8ext.wasm`, with a gzip transport copy beside it.

The build also applies `agda-fast-import-reload.patch`. Agda normally resets
the transient imported signature on every interactive `Cmd_load`, even though
its decoded interfaces and local declaration cache survive. The patch retains
an import-only baseline, keys it by file/options/direct imports, and validates
dependency metadata plus source hashes before reuse. The web worker sets
`AGDA_IMMUTABLE_IMPORTS=1` because mounted dependency archives are immutable
for that worker; standalone builds keep dependency validation enabled.

The build applies a narrow patch to `entropy-0.4.1.11`: its custom `Setup.hs`
only probes host CPU and libc features and cannot run while cross-compiling.
For WASI those probes are intentionally omitted and its ordinary portable
fallback is built instead.

The checked-in binary was rebuilt from these pinned sources and has SHA-256:

```text
241da518343d2eb54b5774d9e65b4633ff04b9b8948f8be54c13a64357dac1b0
```
