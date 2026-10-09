# Architecture

### Stack

- **Yarn 4** for managing the monorepo
- **TypeScript 7** for writing type-safe code
- **Jest** for writing tests
- **ESLint 9** and **Oxfmt** for linting and formatting code
- **`@metamask/auto-changelog`** for writing and validating changelogs
- **`@metamask/create-release-branch`**, **`MetaMask/action-publish-release`**, and **`MetaMask/action-npm-publish`** for creating and publishing releases

### Package structure

[Yarn workspaces](https://yarnpkg.com/features/workspaces) are used to define and manage multiple packages.

Package in this monorepo are represented by subdirectories in `packages/`. Each directory follows this structure:

- `src/` — Files that get built and published when the package is released. May also contain tests (which do not get published).
- `tests/` — Optional directory that defines helpers or setup for tests.
- `package.json` — Defines the name of the package, current version, dependencies, etc.
- `CHANGELOG.md` — Each package has a changelog that lists historical changes.
- `README.md` — Introduces the package to engineers and provides instructions on how to install and use it.
- `LICENSE` — Each package has a license that describes how engineers can use it in projects.
- Configuration files — See below.

Note that the package template in `scripts/create-package/package-template` also uses this same structure.

### Configuration files

The monorepo uses a hierarchical configuration approach for different tools. For most tools, root-level config files define shared settings, while package-level files extend or customize them.

### Contributing teams and codeowners

- `CODEOWNERS` defines which GitHub teams own which packages in the monorepo.
- `teams.json` instructs the `create-update-issues` GitHub workflow which labels to assign issues that are created when there are new major version releases of packages.

### Yarn

- `.yarnrc.yml` configures Yarn.
- `yarn.config.cjs` defines Yarn constraints for monorepo packages, run via `yarn constraints`.

#### TypeScript

- `tsconfig.base.json` defines shared development-specific TypeScript settings for all other config files.
- `tsconfig.build.json` defines shared build-specific TypeScript settings for all other config files.
- `tsconfig.packages.json` defines shared development-specific TypeScript settings for all directories in `packages/`.
- `tsconfig.packages.build.json` defines shared build-specific TypeScript settings for all directories in `packages/`.
- `tsconfig.scripts.json` defines shared TypeScript settings for directories in `scripts/`.
- `packages/**/tsconfig.json` (and `scripts/create-package/package-template/tsconfig.json`) defines TypeScript settings for each package that are meant to be used by code editors and lint tasks.
- `packages/**/tsconfig.build.json` (and `scripts/create-package/package-template/tsconfig.build.json`) defines TypeScript settings for each package that are used to produce a build.
- `scripts/create-package/tsconfig.json` customizes TypeScript settings for the `create-package` tool.

#### Jest

- `jest.config.packages.js` defines shared Jest settings for all directories in `packages/`.
- `jest.config.scripts.js` defines shared Jest settings for all directories in `scripts/`.
- `packages/**/jest.config.js` (and `scripts/create-package/package-template/jest.config.js`) customizes Jest settings for each package.

#### Oxlint

- `oxlint.config.ts` configures Oxlint for the entire monorepo.
- `oxlint-suppressions.json` isn't a config file per se, but defines Oxlint errors that are being ignored (temporarily).

#### Oxfmt

- `.oxfmtrc.json` configures Oxlint for the entire repo.

#### TypeDoc

- `packages/**/typedoc.json` (and `scripts/create-package/package-template/typedoc.js`) defines TypeDoc settings for each package.

#### Other files

- `babel.config.js` configures Babel, which is used for tests within `scripts/create-package`.
- `release.config.js` configures the `@metamask/create-release-branch` tool.
