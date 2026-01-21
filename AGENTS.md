# Guidelines for AI agents

This document provides guidance for AI agents working within this repo.

## Architecture

### Stack

- **Yarn 4** for managing the monorepo
- **TypeScript 5** for writing type-safe code
- **Jest** for writing tests
- **ESLint 9** and **Prettier** for linting and formatting code
- **Babel** for compiling ESM code so that Jest can run it
- **`@metamask/auto-changelog`** for writing and validating changelogs
- **`@metamask/create-release-branch`**, **`MetaMask/action-publish-release`**, and **`MetaMask/action-npm-publish`** for creating and publishing releases
- **TypeDoc** for generating API documentation

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

The monorepo uses a hierarchical configuration approach for different tools:

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

#### ESLint

- `eslint.config.mjs` configures ESLint for the entire monorepo.
- `eslint-suppressions.json` isn't a config file per se, but defines ESLint errors that are being ignored (temporarily).

#### Prettier

- `.prettierrc.js` configures Prettier for the entire repo.

#### TypeDoc

- `packages/**/typedoc.json` (and `scripts/create-package/package-template/typedoc.js`) defines TypeDoc settings for each package.

#### Other files

- `babel.config.js` configures Babel, which is used for tests within `scripts/create-package`.
- `release.config.js` configures the `@metamask/create-release-branch` tool.

## Processes

### General development workflow

Follow test-driven development when making changes:

1. **Update tests first:** Before modifying implementation, update or write tests that describe the desired behavior. Aim for 100% test coverage.
2. **Watch tests fail:** Run tests to verify they fail with the current implementation (or fail appropriately if adding new functionality).
3. **Make tests pass:** Implement changes to make the tests pass.
4. **Run tests after changes:** Always run tests after making code changes to ensure nothing is broken.

### Performing operations across the monorepo

- Run `yarn workspace <package-name> run <script>` to run a package script within a package.
- Run `yarn workspace <package-name> exec <command>` to run a command within a package.
- Run `yarn workspace foreach --all run <script>` to run a package script across all repos.
- Run `yarn workspace foreach --all exec <command>` to run a command across all repos.
- Run `yarn run <script>` to run a package script defined in the root `package.json`.
- Run `yarn exec <command>` to run a command available at the root of the project.

For more on these commands, see:

- [`yarn workspace`](https://yarnpkg.com/cli/workspace)
- [`yarn workspaces foreach`](https://yarnpkg.com/cli/workspaces/foreach)

### Running tests

- Run `yarn workspace <package-name> run test` to run all tests for a package.
- Run `yarn workspace <package-name> run jest --no-coverage <file>` to run a specific test file.
- Prefer the above two commands, but if you must, run `yarn test` to run tests for all packages in the monorepo.

### Linting and formatting

- Run `yarn lint` to check for code quality issues across the monorepo.
- Run `yarn lint:fix` to automatically fix fixable violations.

### Building packages

- Run `yarn build` to build all packages.
- Run `yarn workspace <workspaceName> run build` to build a single package.
- Built files appear in `dist/` directories and are what gets published to NPM. Test files, secrets, or other things that should not be public should not show up in this directory.

### Updating changelogs

Each consumer-facing change to a package should be accompanied by one or more entries in the changelog for that package. Use the following guidelines when updating changelogs:

- When updating changelogs, follow the ["Keep a Changelog"](https://keepachangelog.com/) specification:
  - When releasing a new version, ensure that there is a header for the version linked to the corresponding tag on GitHub.
  - Always ensure there is an Unreleased section above any version section. It may be empty.
  - Within each version section or within Unreleased, place changelog entries into one of the following categories (note: categories must be listed in this order):
    - Added
    - Changed
    - Deprecated
    - Removed
    - Fixed
    - Security
- Within a category section, follow these guidelines:
  - Highlight breaking changes by prefixing them with `**BREAKING:**`. List breaking changes above non-breaking changes in the same category section.
  - Omit non-consumer facing changes and reverted changes from the changelog.
  - Use a nested list to add more details about the change if it would help engineers. For breaking changes in particular, highlight steps engineers need to take to adapt to the changes.
  - Each changelog entry should be followed by links to the pull request(s) that introduced the change.
  - Do not simply reuse the PR title in the entry, but describe exact changes to the API or usable surface area of the project.
  - When there are multiple upgrades to a package in the same release, combine them into a single entry.
  - Each changelog entry should describe one kind of change; if an entry describes too many things, split it up.

## Creating releases

- Use `create-release-branch` to create a release branch. Read `docs/processes/releasing.md` for more.

## Adding new packages

Use `yarn create-package --name <name> --description <description>` to add a new package to the monorepo.

## Code guidelines

### General package guidelines

- Each package should have an `index.ts` file in `src/` that explicitly lists all exports.
- Avoid barrel exports (`export * from './file'`). Instead, explicitly name each export:
  ```typescript
  export { FooController } from './foo-controller';
  export type { FooControllerMessenger } from './foo-controller';
  ```

### Controllers

When adding or updating controllers in packages, make sure to abide by the guidelines in `docs/controller-guidelines.md`. Use `SampleGasPricesController` and `SamplePetnamesController` in the `sample-controllers` package as examples for implementation and tests.

### Services

When adding or updating services in packages, use the `sample-gas-prices-service/` directory in the `sample-controllers` package as examples for implementation and tests.
