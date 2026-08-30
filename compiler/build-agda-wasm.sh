#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
work_dir=${AGDA_WASM_WORK_DIR:-"$project_root/.compiler-work"}
source_dir="$work_dir/agda-language-server"
output_path=${AGDA_WASM_OUTPUT:-"$project_root/static/als-2.8ext.wasm"}

als_revision=e65419f89e3152c2922e948b3e4d24580172bc6a
agda_revision=e2f8c69414fa115328280ecc4de1d2b7a23be7fa
entropy_version=0.4.1.11

wasm_cabal=${WASM_CABAL:-$(command -v wasm32-wasi-cabal || true)}
wasm_opt=${WASM_OPT:-$(command -v wasm-opt || true)}

if [[ -z "$wasm_cabal" ]]; then
  echo "wasm32-wasi-cabal was not found. Install ghc-wasm-meta or set WASM_CABAL." >&2
  exit 1
fi

for program in git curl tar autoreconf alex happy; do
  if ! command -v "$program" >/dev/null 2>&1; then
    echo "$program is required to build Agda for WASM." >&2
    exit 1
  fi
done

toolchain_root=$(cd "$(dirname "$wasm_cabal")/../.." && pwd)
wasm_ghc="$toolchain_root/wasm32-wasi-ghc/bin/wasm32-wasi-ghc"
if [[ ! -x "$wasm_ghc" ]]; then
  wasm_ghc=$(command -v wasm32-wasi-ghc || true)
fi
if [[ -z "$wasm_ghc" ]] || [[ $($wasm_ghc --numeric-version) != 9.10.* ]]; then
  echo "This build is pinned to the ghc-wasm-meta 9.10 toolchain." >&2
  echo "Install revision c3f44696d29aaeadd755d69c51735954bfcd59db with FLAVOUR=9.10." >&2
  exit 1
fi

mkdir -p "$work_dir" "$(dirname "$output_path")"

if [[ ! -d "$source_dir/.git" ]]; then
  git clone --filter=blob:none https://github.com/agda-web/agda-language-server.git "$source_dir"
fi

git -C "$source_dir" fetch --depth=1 origin "$als_revision"
git -C "$source_dir" checkout --detach FETCH_HEAD
git -C "$source_dir" submodule update --init --recursive --depth=1
git -C "$source_dir/wasm-submodules/agda" fetch --depth=1 origin "$agda_revision"
git -C "$source_dir/wasm-submodules/agda" checkout --detach FETCH_HEAD

entropy_dir="$source_dir/wasm-submodules/entropy"
mkdir -p "$entropy_dir"
curl -fL \
  "https://hackage.haskell.org/package/entropy-$entropy_version/entropy-$entropy_version.tar.gz" |
  tar -xz -C "$entropy_dir" --strip-components=1

entropy_patch="$project_root/compiler/patches/entropy-wasm-simple.patch"
if git -C "$source_dir" apply --check "$entropy_patch"; then
  git -C "$source_dir" apply "$entropy_patch"
elif ! git -C "$source_dir" apply --reverse --check "$entropy_patch"; then
  echo "The WASM entropy patch no longer applies to the pinned sources." >&2
  exit 1
fi

(
  cd "$source_dir/wasm-submodules/network"
  autoreconf -i
)

cp "$source_dir/cabal.project.wasm32" "$source_dir/cabal.project"

(
  cd "$source_dir"
  "$wasm_cabal" update
  "$wasm_cabal" configure --flag=Agda-2-8-0
  "$wasm_cabal" build lib:agda
  "$wasm_cabal" build --dependencies-only
  "$wasm_cabal" build exe:als

  unoptimized_path=$("$wasm_cabal" list-bin exe:als)
  if [[ -n "$wasm_opt" ]]; then
    "$wasm_opt" "$unoptimized_path" -Oz -o "$output_path"
  else
    cp "$unoptimized_path" "$output_path"
    echo "wasm-opt was not found; copied the unoptimized compiler." >&2
  fi
)

sha256sum "$output_path"
