# Lighter signer provenance for Core E2E

The Core E2E runner builds the official lighter-go v1.0.13 web signer from
source. The release calls this artifact `lighter-signer-web.wasm`. The Core
build stages it as `main.wasm` beside Go's `wasm_exec.js` for the Node E2E bridge.

| Input                    | Pinned value                                                       |
| ------------------------ | ------------------------------------------------------------------ |
| Release                  | `v1.0.13`                                                          |
| Release commit           | `e8687faa091ae78de3da78fc338a11c48b4de87e`                         |
| Manifest’s source commit | `3e7bb39b70f990a2523137054ceb46e1751c384e`                         |
| Source-tree SHA-256      | `32f6498f45820337f775438cc0694135b64088d17f1ac55edbc72400eb47a096` |
| Go toolchain             | `go1.26.8`                                                         |
| WASM SHA-256             | `6caf0765a6f993bff0bd25ff4553ba8ea5657d0a6b85c767aae44ac5dcf17de9` |
| WASM size                | 7,714,986 bytes                                                    |
| `wasm_exec.js` SHA-256   | `0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14` |

The upstream [release manifest](https://github.com/elliottech/lighter-go/blob/e8687faa091ae78de3da78fc338a11c48b4de87e/web-wasm/main.manifest.json)
records the source-tree hash and maps it to the published artifacts. The
upstream [build script](https://github.com/elliottech/lighter-go/blob/e8687faa091ae78de3da78fc338a11c48b4de87e/web-wasm/build.py)
defines the digest inputs and compiler settings. Core uses `GOOS=js`,
`GOARCH=wasm`, `CGO_ENABLED=0`, clears `GOFLAGS`, `GOWASM` and
`GOEXPERIMENT`, and passes `-mod=readonly -buildvcs=false -trimpath '-ldflags=-s -w'`.

From the Core repo root, with Go available on your PATH, rebuild and verify:

```sh
out="$(mktemp -d)"
packages/perps-controller/tests/e2e/lighter/build-wasm.sh --out "$out"
cat "$out/manifest.json"
shasum -a 256 "$out/main.wasm" "$out/wasm_exec.js"
```

The build uses a fresh source checkout and stages output outside that checkout.
It compares both hashes before putting the files in the requested directory.
Compare the printed hashes with the table and the upstream manifest.

The E2E validation target is Lighter testnet. Mainnet remains unvalidated
pending a separate mainnet check.
