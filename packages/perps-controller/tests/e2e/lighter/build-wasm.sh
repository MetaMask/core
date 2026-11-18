#!/bin/bash
# Rebuild the official Lighter web signer for the Core E2E driver.
# Usage: build-wasm.sh [--out DIR]
# Output: DIR/main.wasm, DIR/wasm_exec.js, DIR/manifest.json
set -euo pipefail

LIGHTER_GO_SOURCE="https://github.com/elliottech/lighter-go"
LIGHTER_GO_RELEASE="v1.0.13"
LIGHTER_GO_COMMIT="e8687faa091ae78de3da78fc338a11c48b4de87e"
SOURCE_TREE_SHA256="32f6498f45820337f775438cc0694135b64088d17f1ac55edbc72400eb47a096"
GO_TOOLCHAIN="go1.26.8"
WASM_SHA256="6caf0765a6f993bff0bd25ff4553ba8ea5657d0a6b85c767aae44ac5dcf17de9"
RUNTIME_SHA256="0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14"

OUT_DIR="temp/lighter-wasm"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        echo "FAIL: --out requires a directory" >&2
        exit 2
      fi
      OUT_DIR="$2"
      shift 2
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

command -v go >/dev/null || { echo "FAIL: go toolchain not found" >&2; exit 1; }

mkdir -p -- "$OUT_DIR"
OUT_DIR="$(cd -- "$OUT_DIR" && pwd -P)"
STAGING_DIR="$(mktemp -d "$OUT_DIR/.lighter-wasm.XXXXXX")"
trap 'rm -rf -- "$STAGING_DIR"' EXIT
SOURCE_DIR="$STAGING_DIR/source"

git init -q "$SOURCE_DIR"
git -C "$SOURCE_DIR" fetch -q --depth 1 "$LIGHTER_GO_SOURCE.git" "$LIGHTER_GO_COMMIT"
git -C "$SOURCE_DIR" checkout -q --detach FETCH_HEAD
if [ "$(git -C "$SOURCE_DIR" rev-parse HEAD)" != "$LIGHTER_GO_COMMIT" ]; then
  echo "FAIL: fetched signer source does not match $LIGHTER_GO_COMMIT" >&2
  exit 1
fi

# Match the upstream web-wasm build and keep its checkout clean.
GO_ENV=(GOTOOLCHAIN="$GO_TOOLCHAIN" GOFLAGS= GOWORK=off)
echo "Building main.wasm from lighter-go $LIGHTER_GO_RELEASE ($LIGHTER_GO_COMMIT)..."
(
  cd "$SOURCE_DIR"
  env "${GO_ENV[@]}" GOOS=js GOARCH=wasm CGO_ENABLED=0 GOWASM= GOEXPERIMENT= \
    go build -mod=readonly -buildvcs=false -trimpath -ldflags="-s -w" \
    -o "$STAGING_DIR/main.wasm" ./web-wasm
)
GOROOT_DIR="$(env "${GO_ENV[@]}" go env GOROOT)"
cp "$GOROOT_DIR/lib/wasm/wasm_exec.js" "$STAGING_DIR/wasm_exec.js"

verify_sha256() {
  local file="$1" expected="$2" actual
  actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    printf 'FAIL: %s SHA-256 mismatch (expected %s, got %s)\n' "${file##*/}" "$expected" "$actual" >&2
    exit 1
  fi
}
verify_sha256 "$STAGING_DIR/main.wasm" "$WASM_SHA256"
verify_sha256 "$STAGING_DIR/wasm_exec.js" "$RUNTIME_SHA256"

SIZE_BYTES="$(wc -c < "$STAGING_DIR/main.wasm" | tr -d ' ')"
cat > "$STAGING_DIR/manifest.json" <<MANIFEST
{
  "source": "$LIGHTER_GO_SOURCE",
  "release": "$LIGHTER_GO_RELEASE",
  "commit": "$LIGHTER_GO_COMMIT",
  "sourceTreeSha256": "$SOURCE_TREE_SHA256",
  "goVersion": "$GO_TOOLCHAIN",
  "buildFlags": ["-mod=readonly", "-buildvcs=false", "-trimpath", "-ldflags=-s -w"],
  "builtSha256": "$WASM_SHA256",
  "runtimeSha256": "$RUNTIME_SHA256",
  "sizeBytes": $SIZE_BYTES
}
MANIFEST

mv -f "$STAGING_DIR/main.wasm" "$STAGING_DIR/wasm_exec.js" "$STAGING_DIR/manifest.json" "$OUT_DIR/"
echo "Built and verified $OUT_DIR/main.wasm ($SIZE_BYTES bytes)"
echo "BUILD_WASM_OK"
