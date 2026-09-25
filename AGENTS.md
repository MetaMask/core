# Guidance for AI agents

See @README.md for information about this monorepo and how to work with it.

## Cursor Cloud specific instructions

This repo is a **library and tool monorepo** — a collection of `@metamask/*` TypeScript packages published to npm and consumed by MetaMask clients (or used by MetaMask engineers). There is **no long-running server/app to start**; "running" the code means building packages, running their test suites, or invoking one of the CLI packages (e.g. `messenger-cli`). Do not look for a dev server.

Environment prerequisites (Node LTS + Yarn 4 via Corepack + `yarn install`) are handled by the startup update script, so you normally don't need to reinstall. If you do run it manually, use `corepack enable` before any `yarn` command — the base image's global `yarn` is Classic (1.x), and this repo requires Yarn 4 (pinned via `packageManager`).

Standard lint/test/build commands are documented in `docs/processes/`.

See @README.md for more.
