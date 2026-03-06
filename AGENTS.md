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

1. **Update tests first:** Before modifying implementation, update or write tests that describe the desired behavior. Aim for 100% test coverage.
2. **Watch tests fail:** Run tests to verify they fail with the current implementation (or fail appropriately if adding new functionality).
3. **Make tests pass:** Implement changes to make the tests pass.
4. **Run tests after changes:** Always run tests after making code changes to ensure nothing is broken.

Additionally, make sure the following checks pass after completing a request:

- There should be no lint violations or type errors.
- All tests should pass.
- All changelogs should pass validation.

### Performing operations across the monorepo

- Run `yarn workspace <package-name> run <script>` to run a package script within a package.
- Run `yarn workspace <package-name> exec <command>` to run an executable within a package.
- Run `yarn workspace <package-name> add <dependency>` to add a dependency to a package.
- Run `yarn workspace <package-name> add -D <dependency>` to add a development dependency to a package.
- Run `yarn workspaces foreach --all run <script>` to run a package script across all packages.
- Run `yarn workspaces foreach --all exec <command>` to run an executable across all packages.
- Run `yarn workspaces foreach --all add <dependency>` to add a dependency to all packages.
- Run `yarn workspaces foreach --all add -D <dependency>` to add a development dependency to all packages.
- Run `yarn run <script>` to run a package script defined in the root `package.json`.
- Run `yarn exec <command>` to run an executable from the root of the project.
- Run `yarn add <dependency>` to add a dependency to the root `package.json`.
- Run `yarn add -D <dependency>` to add a dependency to the root `package.json`.
- Run `yarn up -R <dependency>` to upgrade a dependency across the monorepo.

For more on these commands, see:

- [`yarn workspace`](https://yarnpkg.com/cli/workspace)
- [`yarn workspaces foreach`](https://yarnpkg.com/cli/workspaces/foreach)

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

## Code guidelines

### TypeScript

- **Strict mode** is enabled (`strict: true`). Never use `any`; the ESLint rule `@typescript-eslint/no-explicit-any` is set to `error`.
- Target **ES2020**, module system **Node16** (`"module": "Node16"`, `"moduleResolution": "Node16"`).
- Prefer `type` imports for type-only symbols:

  ```typescript
  import type { Foo } from './foo';
  import { bar } from './bar';
  ```

- Use `satisfies` to validate objects against a type without widening:

  ```typescript
  const metadata = { ... } satisfies StateMetadata<FooControllerState>;
  ```

- Use private class fields (`#field`) instead of the `private` keyword for runtime privacy.
- Avoid type assertions (`as Foo`) unless unavoidable; prefer type guards.

### Formatting (enforced by Prettier)

- Single quotes for strings.
- 2-space indentation.
- Trailing commas everywhere (`"trailingComma": "all"`).
- Semicolons are not enforced, but follow the existing file's style.

### Naming conventions

- **Files:** `kebab-case` (e.g., `foo-controller.ts`, `sample-gas-prices-service.ts`).
- **Classes/Types/Interfaces:** `PascalCase` (e.g., `FooController`, `FooControllerState`).
- **Functions/variables:** `camelCase`.
- **Constants:** `SCREAMING_SNAKE_CASE` for module-level compile-time constants.
- **Controller names:** exported as a `const controllerName = 'FooController'` string used for messenger namespacing.
- **State types:** `<Name>State`; **Messenger types:** `<Name>Messenger`; **Action/Event types:** `<Name>Actions` / `<Name>Events`.

### Imports

- Group imports: external packages first, then internal (`./` / `../`) imports.
- Separate `import type` from value imports for the same module when needed, but ESLint rule `import-x/no-duplicates` is off for TS files — separate type/value imports from the same module are acceptable.
- Do not use path aliases; use relative paths for intra-package imports.

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

### Testing

- Test files live alongside source files as `*.test.ts` (or in `tests/` for helpers).
- Use `describe` blocks that mirror the module's structure (one top-level `describe` per class/function, nested `describe` per method).
- Prefer `toStrictEqual` over `toEqual`; use `toMatchInlineSnapshot` for complex objects.
- Use `jest.useFakeTimers()` / `jest.useRealTimers()` in `beforeEach`/`afterEach` when time-dependent.
- Use `@ts-expect-error` (never `@ts-ignore`) with a brief comment when intentionally passing wrong types in tests.
- Aim for 100% coverage; mock external dependencies via messenger action handlers rather than monkey-patching modules.

### Controllers

When adding or updating controllers in packages, follow these guidelines:

- Controller classes should extend `BaseController`.
- Controllers should not be stateless; if a controller does not have state, it should be a service.
- The controller should define a public messenger type.
- All messenger actions and events should be publicly defined. The default set should include the `:getState` action and `:stateChange` event.
- All actions and events the messenger uses from other controllers and services should also be declared in the messenger type.
- Controllers should initialize state by combining default and provided state. Provided state should be optional.
- The constructor should take `messenger` and `state` options at a minimum.
- Export a `getDefault<Name>State()` function that returns a fresh default state object.
- Make sure to write comprehensive tests for the controller class.

Full guidelines: `docs/code-guidelines/controller-guidelines.md`.

Use `SampleGasPricesController` and `SamplePetnamesController` in the `sample-controllers` package as examples for implementation and tests.

### Data services

When adding or updating data services in packages, follow these guidelines:

- Data services should define a public messenger type.
- All methods defined on the service class should be exposed through the messenger.
- All messenger actions and events should be publicly defined.
- All actions and events the messenger uses from other services should also be declared in the messenger type.
- The constructor should take `messenger` and `fetch` options at a minimum.
- The constructor should construct a policy using the `createServicePolicy` function.
- Each method in a service class should represent a single endpoint of an API.
- Use the policy to wrap each request to the endpoint.
- If a request has a non-2xx response, throw an error.
- Validate each request's response (throwing an error if invalid) before returning its data.
- Service classes should also define `onRetry`, `onBreak`, and `onDegraded` methods.
- Make sure to write comprehensive tests for the service class.

Full guidelines: `docs/code-guidelines/data-services.md`.

Use the `sample-gas-prices-service/` directory in the `sample-controllers` package as examples for implementation and tests.
