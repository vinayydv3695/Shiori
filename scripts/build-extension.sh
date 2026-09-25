#!/usr/bin/env bash
# build-extension.sh — author-side build for the Phase 5B reference WASM
# extension (extensions/torrents-csv-extension).
#
# Produces dist/torrents-csv-extension.wasm, then reminds you to sha256 it
# and add a RepoEntry so users can install it from the extension repository.
#
# Author-side tool only: this script is NOT invoked by the app build, the CI
# or tests (see PLAN.md §8.2 — CI hosts lack the wasm32 target on purpose).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

MANIFEST="${ROOT}/extensions/torrents-csv-extension/Cargo.toml"
TARGET="wasm32-unknown-unknown"
# cdylib artifact name: package "torrents-csv-extension" -> libtorrents_csv_extension.wasm
CRATE="torrents_csv_extension"
OUT_WASM="${ROOT}/dist/torrents-csv-extension.wasm"
# Pin cargo's build dir at the repo root so it never leaks into the crate dir.
export CARGO_TARGET_DIR="${ROOT}/target"

if ! rustup target list --installed 2>/dev/null | grep -q "^${TARGET}$"; then
  echo "Adding rust target ${TARGET} (one-time toolchain download)..."
  rustup target add "${TARGET}"
fi

echo "Building ${MANIFEST} for ${TARGET}..."
cargo build --release --target "${TARGET}" --manifest-path "${MANIFEST}"

mkdir -p "${ROOT}/dist"
cp "${CARGO_TARGET_DIR}/${TARGET}/release/lib${CRATE}.wasm" "${OUT_WASM}"

echo "Built ${OUT_WASM}"
echo
echo "Next steps (author-side, not automated):"
echo "  1. sha256sum ${OUT_WASM}"
echo "  2. Add a RepoEntry for 'torrents-csv-extension' to the extension"
echo "     repository index with that hash, and permissions:"
echo "         permissions.hosts = [\"https://torrents-csv.com\"]"
echo "         permissions.contentType = \"book\""
echo "         permissions.nsfw = false"