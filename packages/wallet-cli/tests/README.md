# wallet-cli end-to-end tests

These suites spawn the **built** `mm` CLI (and the native `better-sqlite3`
addon) as real child processes, so they live outside the fast unit `test` run
and its 100%-coverage gate. Run them with:

```sh
yarn workspace @metamask/wallet-cli run test:e2e
```

`test:e2e` first runs `test:prepare` (builds the `better-sqlite3` addon), then
runs jest with `jest.config.e2e.js` (which points jest at this `tests/`
directory).

## Suites

### `lifecycle.e2e.test.ts` — offline

Drives the `mm daemon` lifecycle (`start → call → status → stop → purge`) and
`mm wallet unlock` against a temp data directory. It never touches the network:
daemon startup does not fetch feature flags or reach a chain, so it runs
anywhere with no extra setup.

### `wallet-send.e2e.test.ts` — real chain (requires `anvil`)

The true end-to-end test for `mm wallet send`: it boots a local
[anvil](https://book.getfoundry.sh/anvil/) node, points the daemon at it with a
custom network, sends a transaction, and asserts it was signed, broadcast, and
mined (receipt `status: 0x1`, recipient balance increased). anvil is started
with the same mnemonic the wallet imports, so the wallet's account is
pre-funded on the local chain.

**This suite is skip-if-absent.** When the `anvil` binary cannot be found the
whole suite is skipped (not failed), so it never blocks a machine without
Foundry. Set `MM_E2E_REQUIRE_ANVIL=true` to turn that skip into a hard failure
— use it wherever anvil is expected (CI does, whenever it installed it) so a
broken install surfaces loudly instead of passing as a green no-op.

#### Running it locally

Install Foundry's `anvil`. Either use the repo's helper (installs it into this
package's `node_modules/.bin`):

```sh
yarn workspace @metamask/wallet-cli run test:e2e:install-anvil
```

…or install Foundry the usual way (`curl -L https://foundry.paradigm.xyz | bash
&& foundryup`) so `anvil` is on your `PATH`. You can also point at a specific
binary with `MM_E2E_ANVIL_PATH=/path/to/anvil`.

Then:

```sh
yarn workspace @metamask/wallet-cli run test:e2e
```

#### Notes for maintainers

- **Net-connect allowlist.** The shared test setup
  (`tests/setupAfterEnv/nock.ts`) disables all real network connections before
  every test as a safety net. This suite re-enables **only** `127.0.0.1:<the
anvil port>` in its `beforeEach` and restores the block in `afterEach`, so
  the safety net stays in place everywhere else. HTTP calls to anvil go through
  `node:http` because the shared `tests/setup.ts` deletes `globalThis.fetch`
  (so nock/undici can intercept), leaving no global `fetch` to use.
- **Gas.** The send passes explicit gas overrides so it never depends on the
  external gas-estimation API (which has no data for a local chain id).

## CI

The `test-wallet-cli-e2e` job runs `test:e2e` on every push/PR. To avoid paying
the Foundry download on unrelated PRs, it installs `anvil` **only when files
under `packages/wallet-cli/` changed** (detected via the PR file list). On PRs
that don't touch wallet-cli, `anvil` is absent and the real-chain suite skips
itself; the offline lifecycle suite always runs.

When it does install `anvil`, the job also sets `MM_E2E_REQUIRE_ANVIL=true`, so
the real-chain suite fails loudly if the binary is nonetheless missing rather
than skipping green — that would otherwise hide the loss of the only test that
exercises a real broadcast.
