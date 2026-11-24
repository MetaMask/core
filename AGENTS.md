# Guidance for AI agents

Before making changes to code:

- Always read the following:
  - [Recommended development workflow](./docs/getting-started/general-development-workflow.md)
  - [General guidelines for all packages](./docs/code-guidelines/package-guidelines.md)
  - [Updating changelogs](./docs/processes/updating-changelogs.md)
- Read the following if it makes sense for your task:
  - [Guidelines for writing controllers](./docs/code-guidelines/controller-guidelines.md)
  - [Guidelines for writing data services](./docs/code-guidelines/data-services.md)
- Lastly, look through `./docs/README.md` to look for other topics that are relevant to your task, and read them too.

## Cursor Cloud specific instructions

This repo is a **library and tool monorepo** — a collection of `@metamask/*` TypeScript packages published to npm and consumed by MetaMask clients (or used by MetaMask engineers). There is **no long-running server/app to start**; "running" the code means building packages, running their test suites, or invoking one of the CLI packages (e.g. `messenger-cli`). Do not look for a dev server.

Environment prerequisites (Node LTS + Yarn 4 via Corepack + `yarn install`) are handled by the startup update script, so you normally don't need to reinstall. If you do run it manually, use `corepack enable` before any `yarn` command — the base image's global `yarn` is Classic (1.x), and this repo requires Yarn 4 (pinned via `packageManager`).

Standard lint/test/build commands are documented in `docs/processes/`.

See @README.md for more.
