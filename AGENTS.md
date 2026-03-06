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

### Repo structure

Configuration follows a hierarchical pattern: root-level files define shared settings and per-package files extend or override them.

```
.depcheckrc.yml                                  # depcheck config (used by `yarn lint:dependencies`)
.github/
├── actions/                                     # Reusable GitHub actions (preferred over workflows/)
├── workflows/                                   # Reusable GitHub workflows
│   ├── changelog-check.yml                      # Enforces changelog entries on PRs
│   ├── create-update-issues.yaml                # Opens issues on major releases
│   ├── ensure-blocking-pr-labels-absent.yml     # Prevents PRs from being merged with blocking labels
│   ├── lint-build-test.yml                      # Ensures code is linted, buildable, and tested
│   ├── main.yml                                 # Orchestrates other workflows
│   ├── publish-preview.yml                      # Publishes preview builds
│   └── publish-release.yml                      # Publishes releases to NPM
├── CODEOWNERS                                   # Maps packages to owning GitHub teams
├── dependabot.yml                               # Config for Dependabot
└── pull_request_template.md                     # Default PR description template
.nvmrc                                           # Pins the Node.js version
.prettierrc.js                                   # Prettier config for the entire repo
.yarnrc.yml                                      # Yarn configuration
docs/                                            # Documentation for contributors/maintainers
├── code-guidelines/                             # Code style, etc.
├── getting-started/                             # Start here if you're new
└── processes/                                   # How to make new releases, update changelogs, etc.
packages/                                        # Publishable packages (see "Package structure" below)
└── <package-name>/
scripts/                                         # Repo maintenance scripts and tools
└── create-package/
    └── package-template/                        # Template used when scaffolding a new package
tests/                                           # Shared test helpers (fake providers, mock networks, etc.)
types/                                           # Global ambient type declarations
AGENTS.md                                        # Guidelines for AI agents (this file)
babel.config.js                                  # Babel config (used for scripts/create-package tests)
eslint.config.mjs                                # ESLint config for the entire monorepo
eslint-suppressions.json                         # Temporarily suppressed ESLint violations
jest.config.packages.js                          # Shared Jest settings for packages/
jest.config.scripts.js                           # Shared Jest settings for scripts/
release.config.json                              # Config for @metamask/create-release-branch
teams.json                                       # Maps teams to issue labels for major-release workflows 
tsconfig.json                                    # Project references root (used by linter and editors)
tsconfig.base.json                               # Shared TS compiler options (base for all configs)
tsconfig.build.json                              # Shared build-only TS settings
tsconfig.packages.json                           # Shared dev-only TS settings for packages/
tsconfig.packages.build.json                     # Shared build-only TS settings for packages/
tsconfig.scripts.json                            # TS settings for scripts/
yarn.config.cjs                                  # Yarn constraints (run via `yarn constraints` to apply)
```

### Package structure

[Yarn workspaces](https://yarnpkg.com/features/workspaces) are used to define and manage multiple packages. The template in `scripts/create-package/package-template` matches this layout.

```
packages/<package-name>/
├── src/                             # Source files; built and published on release
│   ├── <sub-module>/                # (Optional) Subdirectories for services etc.
│   ├── index.ts                     # Public API (all exports listed explicitly here)
│   ├── <name>-controller.ts         # Controller or service implementation
│   └── <name>-controller.test.ts    # Tests live alongside source files
├── tests/                           # (Optional) Shared test helpers/setup for this package
├── CHANGELOG.md                     # Keep-a-Changelog formatted history
├── LICENSE                          # How consumers may (or may not) use the package
├── README.md                        # Installation and usage docs
├── jest.config.js                   # Extends jest.config.packages.js
├── package.json                     # Package name, version, dependencies
├── tsconfig.json                    # Extends tsconfig.packages.json (editor + lint)
├── tsconfig.build.json              # Extends tsconfig.packages.build.json (build)
└── typedoc.json                     # TypeDoc settings for API doc generation
```

## Processes

### General development workflow

Follow test-driven development when making changes:

- Write or update tests that describe the user's desired behavior before touching the implementation. Aim for 100% coverage.
- Confirm the tests fail against the current implementation.
- Do the simplest thing (within reason) to make the tests pass.

Before marking a task complete, double-check that:

- all tests pass (`yarn workspace <package-name> run test`)
- there are no lint violations or type errors (`yarn lint`)
- changelogs are updated and valid (`yarn validate:changelog`)

### Running tests

- Run `yarn workspace <package-name> run test` to run all tests for a package.
- Run `yarn workspace <package-name> run jest --no-coverage <file>` to run a specific test file.
- Prefer the above two commands, but if you must, run `yarn test` to run tests for all packages in the monorepo.

### Linting and formatting

- Run `yarn lint` to check for code quality issues across the monorepo.
- Run `yarn validate:changelog` to check for formatting issues in changelogs.
- Run `yarn lint:fix` to automatically fix fixable violations.

### Building packages

- Run `yarn build` to build all packages.
- Run `yarn workspace <package-name> run build` to build a single package.
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
  - Highlight breaking changes by prefixing them with `**BREAKING:**`. List breaking changes above non-breaking changes in the same category section. A change is breaking if it removes, renames, or changes the signature of any public export (function, type, class, constant), or changes default behavior that consumers rely on.
  - Omit non-consumer facing changes and reverted changes from the changelog.
  - Use a nested list to add more details about the change if it would help engineers. For breaking changes in particular, highlight steps engineers need to take to adapt to the changes.
  - Each changelog entry should be followed by links to the pull request(s) that introduced the change.
  - Do not simply reuse the PR title in the entry, but describe exact changes to the API or usable surface area of the project.
  - When there are multiple upgrades to a package in the same release, combine them into a single entry.
  - Each changelog entry should describe one kind of change; if an entry describes too many things, split it up.
- After updating a changelog, run `yarn validate:changelog` and fix any errors reported.

## Creating releases

- Use `create-release-branch` to create a release branch. Read `docs/processes/releasing.md` for more.

## Adding new packages

Use `yarn create-package --name <name> --description <description>` to add a new package to the monorepo.

## Adding controllers or services to existing packages

Use the controllers and services in `packages/sample-controllers` as models for creating new controllers and services.

## Code guidelines

### General instructions

- Always check to see if there a simpler solution that satisfies the user's requirements.

### General TypeScript guidelines

- Don't use type assertions (`as TYPE`) if there is a way to avoid it (and there almost always is). This effectively lies to TypeScript about what a value actually is, and points to a poor design.
  - Use type guards if you need to "force" TypeScript to choose a code path.
- Don't use `any` if there is a way to avoid it (and there almost always is). This tells TypeScript to disable type checking, and there are **very few** cases in which we want to do this.
- Don't use type annotations except for defining return types for functions and variables.
- Use `satisfies` when defining constants to validate that objects follow a type without widening:
  ```typescript
  // Bad
  const metadata: StateMetadata<FooControllerState> = { ... };

  // Good
  const metadata = { ... } satisfies StateMetadata<FooControllerState>;
  ```
- Use private class fields (`#field`) instead of the `private` keyword for runtime privacy.

### General testing guidelines

- Test files live alongside source files as `*.test.ts`.
- Use `packages/<package-name>/tests/` for test helpers (make sure to add it to the package's `tsconfig.json`).
- Use `describe` blocks that mirror the module's structure (one top-level `describe` per class/function, nested `describe` per method).
- When creating new test files, don't prefix test descriptions with "should". If existing test files use "should", follow the same convention.
- When intentionally passing invalid data to functions or methods in tests, don't use a type assertion or `@ts-ignore`; instead, use `@ts-expect-error` with an explanatory comment.
- If the function or method under test calls under functions or methods, prefer not to mock them, but try to call them for real.
- Don't set variables outside of test blocks and don't use `beforeEach` to share data between tests. Instead, create factory functions to create real or mock objects and call them directly in tests.
- Tests should follow the arrange/act/assert pattern, using line breaks to highlight the phases.
- If a piece of data is referred to in a test's assertion, it should be named in the setup phase (it should not arrive "magically" via a variable set at the top of the file).
- Aim for 100% test coverage.

### Error handling

- Throw typed errors; do not swallow errors silently.
- In controllers, when catching errors from fire-and-forget async calls, pass them to `this.messenger.captureException?.()`:

  ```typescript
  someAsyncCall().catch((error) => {
    this.messenger.captureException?.(error);
  });
  ```
- In data services, throw an `HttpError` for non-2xx responses and validate responses before returning data.

### General package guidelines

- Each package should have an `index.ts` file in `src/` that explicitly lists all exports.
- Avoid barrel exports (`export * from './file'`). Instead, explicitly name each export:
  ```typescript
  // Bad
  export * from './foo-controller';

  // Good
  export { FooController } from './foo-controller';
  export type { FooControllerMessenger } from './foo-controller';
  ```

### Controllers

Controller files have a class with a `*Controller` suffix that extends `BaseController`.

When adding or updating controllers in packages, follow these guidelines:

- Use snake case for the filename (e.g. `tokens-controller.ts`).
- Controller classes should extend `BaseController`.
- Controllers should not be stateless; if a controller does not have state, it should be a service.
- The controller should define a public messenger type (`<ControllerName>Messenger`).
- All messenger actions and events should be publicly defined. The default set should include the `:getState` action and `:stateChange` event.
- All actions and events the messenger uses from other controllers and services should also be declared in the messenger type.
- Controllers should initialize state by combining default and provided state. Provided state should be optional.
- The constructor should take `messenger` and `state` options at a minimum.
- Export a `getDefault<ControllerName>State()` function that returns a fresh default state object.
- Controllers should not directly make HTTP requests, but should use data services to do so.
- Data services should not be initialized in the controller constructor; it should be assumed that they are already initialized. Controllers should call services through the messenger.
- The controller, messenger type, messenger action and event types, and `getDefault<ControllerName>State` function should be exported through the package's `index.ts` file.

When testing controllers:

- Use snake case for the filename (e.g. `tokens-controller.test.ts`).
- Abide by the "General testing guidelines" above.
- Don't set up and pass the controller a mock messenger (don't stub `subscribe`, `call`, etc.). Create a real messenger and register action handlers as needed.
- Use the `withController` pattern to encapsulate setup and teardown steps for controllers.

Full guidelines: `docs/code-guidelines/controller-guidelines.md`.

Use `SampleGasPricesController` and `SamplePetnamesController` in the `sample-controllers` package as examples for implementation and tests.

### Data services

When adding or updating data services in packages, follow these guidelines:

- Data services should define a public messenger type (`<ServiceName>Messenger`).
- All methods defined on the service class should be exposed through the messenger.
- All messenger actions and events should be publicly defined.
- All actions and events the messenger uses from other services should also be declared in the messenger type.
- The constructor should take `messenger` and `fetch` options at a minimum.
- The constructor should construct a policy using the `createServicePolicy` function.
- Each method in a service class should represent a single endpoint of an API.
- Use the policy to wrap each request to the endpoint.
- If a request has a non-2xx response, throw an error inside of the policy function (to allow for retries).
- Validate each request's response, throwing an error if invalid, before returning its data (but do this outside of the policy function). Use `@metamask/superstruct` for validation if necessary.
- Service classes should also define `onRetry`, `onBreak`, and `onDegraded` methods.

When testing services:

- Use snake case for the filename (e.g. `tokens-controller.test.ts`).
- Abide by the "General testing guidelines" above.
- Use `nock` to mock requests.

Full guidelines: `docs/code-guidelines/data-services.md`.

Use the `sample-gas-prices-service/` directory in the `sample-controllers` package as examples for implementation and tests.
