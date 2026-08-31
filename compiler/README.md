# Building the Agda compiler

The browser compiler is a WASI build of the Agda Language Server with Agda's
JSON interaction mode enabled. `build-agda-wasm.sh` pins both source revisions:

- Agda Language Server: `e65419f89e3152c2922e948b3e4d24580172bc6a`
- Agda 2.8: `e2f8c69414fa115328280ecc4de1d2b7a23be7fa`
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
The Cabal build uses `-O2`; `wasm-opt` then performs the final WASM-specific
optimization pass.

The Agda checkout is built without local source patches. The build aborts if
the pinned Agda tree contains tracked modifications, preventing a custom Agda
compiler from being shipped accidentally. Browser performance comes from
Agda's standard interaction and interface-cache mechanisms.

The build applies a narrow patch to `entropy-0.4.1.11`: its custom `Setup.hs`
only probes host CPU and libc features and cannot run while cross-compiling.
For WASI those probes are intentionally omitted and its ordinary portable
fallback is built instead.

The checked-in binary was rebuilt from these pinned sources and has SHA-256:

```text
53c62b0ad569a9d123f744b192c13780c494ade0cddef4daaa00db41ecd7f7a1
```
