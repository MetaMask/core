# Lighter validation recipes (temporary — do not merge)

Recipe v1 definitions proving the Lighter integration. This folder is a
temporary holding area so the recipes survive the POC branch review; they
graduate into the harness recipe library before this PR can merge. **The PR
carrying this folder stays DO-NOT-MERGE.** Not published to npm (`files`
only ships `dist/`).

- `lighter-e2e.recipe.json` — headless core proof against live Lighter
  testnet: signer build, sign-only, venue key registration, order
  lifecycle, and the controller abstraction path (51 nodes, includes a
  revert-check). Runner: `mm-harness run` from the core repo root with the
  e2e env described in `tests/e2e/lighter/`.

The on-device mobile counterparts (composable `lighter.*` units + the
composed capability suite that drives the real UI) live in the mobile PR
under `recipes/` — see MetaMask/metamask-mobile#34865.
