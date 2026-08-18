#!/bin/bash
# Build the Lighter Go/WASM signer from source (elliottech/lighter-go@web-wasm)
#
# Pinned provenance: the signer builds from an exact reviewed commit of the
# web-wasm branch, never its moving HEAD. Override with LIGHTER_GO_REF only
# to intentionally evaluate a newer upstream.
# and stage it, with Go's wasm_exec.js runtime, into a cache directory.
#
# Also computes an informational reproducibility check: sha256 of the locally
# built blob vs the blob committed on the upstream branch. A mismatch is NOT
# a failure (upstream's Go toolchain version is unknown); byte-equality is
# reported in manifest.json for the record.
#
# Usage: build-wasm.sh [--out DIR]
# Output: DIR/main.wasm, DIR/wasm_exec.js, DIR/manifest.json
set -euo pipefail

LIGHTER_GO_REF="${LIGHTER_GO_REF:-05a2bbcbbc3db2de7941313fd6524e5744ee5336}"

OUT_DIR="temp/lighter-wasm"
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT_DIR="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

command -v go >/dev/null || { echo "FAIL: go toolchain not found" >&2; exit 1; }

mkdir -p "$OUT_DIR"
REPO_DIR="$OUT_DIR/lighter-go"

if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch --depth 1 origin "$LIGHTER_GO_REF"
  git -C "$REPO_DIR" checkout -q FETCH_HEAD
else
  git clone https://github.com/elliottech/lighter-go.git "$REPO_DIR"
  git -C "$REPO_DIR" checkout -q "$LIGHTER_GO_REF"
fi
UPSTREAM_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD)"

echo "Building main.wasm from source (commit $UPSTREAM_COMMIT)..."
# DETERMINISTIC build: GOTOOLCHAIN pins the compiler, -trimpath strips
# host paths — two clean builds of the same commit produce the same
# sha256 anywhere. (Upstream's committed blob is NOT reproducible: it
# was built without -trimpath and embeds the author's laptop paths, so
# the upstream compare below stays informational by nature.)
(cd "$REPO_DIR/web-wasm" && GOOS=js GOARCH=wasm GOTOOLCHAIN=go1.26.0 go build -trimpath -ldflags="-s -w" -o main.wasm)

# Upstream's committed blob, for the informational hash-compare.
UPSTREAM_SHA="$(shasum -a 256 "$REPO_DIR/web-wasm/main.wasm" | awk '{print $1}')"
# Rebuild over the committed blob: build again to a distinct path so both exist.
(cd "$REPO_DIR/web-wasm" && git checkout -q -- main.wasm 2>/dev/null || true)
COMMITTED_SHA=""
if git -C "$REPO_DIR" cat-file -e "HEAD:web-wasm/main.wasm" 2>/dev/null; then
  git -C "$REPO_DIR" show "HEAD:web-wasm/main.wasm" > "$OUT_DIR/upstream-main.wasm"
  COMMITTED_SHA="$(shasum -a 256 "$OUT_DIR/upstream-main.wasm" | awk '{print $1}')"
fi
# Re-run the build so the artifact we ship is unambiguously source-built,
# and prove SELF-reproducibility: a forced full recompile must produce
# the identical hash.
(cd "$REPO_DIR/web-wasm" && GOOS=js GOARCH=wasm GOTOOLCHAIN=go1.26.0 go build -trimpath -ldflags="-s -w" -o main.wasm)
FIRST_SHA="$(shasum -a 256 "$REPO_DIR/web-wasm/main.wasm" | awk '{print $1}')"
(cd "$REPO_DIR/web-wasm" && GOOS=js GOARCH=wasm GOTOOLCHAIN=go1.26.0 go build -a -trimpath -ldflags="-s -w" -o main.wasm)
BUILT_SHA="$(shasum -a 256 "$REPO_DIR/web-wasm/main.wasm" | awk '{print $1}')"
cp "$REPO_DIR/web-wasm/main.wasm" "$OUT_DIR/main.wasm"

# Stage Go's wasm_exec.js runtime (path moved from misc/ to lib/ in Go 1.24).
GOROOT_DIR="$(go env GOROOT)"
if [ -f "$GOROOT_DIR/lib/wasm/wasm_exec.js" ]; then
  cp "$GOROOT_DIR/lib/wasm/wasm_exec.js" "$OUT_DIR/wasm_exec.js"
elif [ -f "$GOROOT_DIR/misc/wasm/wasm_exec.js" ]; then
  cp "$GOROOT_DIR/misc/wasm/wasm_exec.js" "$OUT_DIR/wasm_exec.js"
else
  echo "FAIL: wasm_exec.js not found in GOROOT" >&2
  exit 1
fi

SIZE_BYTES="$(wc -c < "$OUT_DIR/main.wasm" | tr -d ' ')"
MATCH="false"
[ -n "$COMMITTED_SHA" ] && [ "$BUILT_SHA" = "$COMMITTED_SHA" ] && MATCH="true"
if [ "$BUILT_SHA" != "$FIRST_SHA" ]; then
  echo "FAIL: build is not self-reproducible ($FIRST_SHA vs $BUILT_SHA)" >&2
  exit 1
fi

cat > "$OUT_DIR/manifest.json" <<EOF
{
  "source": "https://github.com/elliottech/lighter-go",
  "branch": "web-wasm",
  "commit": "$UPSTREAM_COMMIT",
  "goVersion": "$(go version | awk '{print $3}')",
  "builtSha256": "$BUILT_SHA",
  "upstreamCommittedSha256": "$COMMITTED_SHA",
  "reproducibleMatch": $MATCH,
  "selfReproducible": true,
  "toolchain": "go1.26.0 (GOTOOLCHAIN-pinned) + -trimpath",
  "upstreamBlobNote": "upstream committed blob built without -trimpath; embeds author-machine paths, byte-match impossible by construction",
  "sizeBytes": $SIZE_BYTES
}
EOF

echo "Built $OUT_DIR/main.wasm ($SIZE_BYTES bytes)"
echo "builtSha256=$BUILT_SHA"
echo "upstreamCommittedSha256=$COMMITTED_SHA"
echo "reproducibleMatch=$MATCH"
echo "BUILD_WASM_OK"
