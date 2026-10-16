# Writing and running tests

[Jest](https://jestjs.io/) and [Vitest](https://vitest.dev/) are used to ensure that code is working as expected. Existing packages are migrating from Jest to Vitest; the remaining Jest packages are listed in `test-runner-package-map.cjs`. Ideally, all packages should have 100% test coverage.

Please follow the [MetaMask unit testing guidelines](https://github.com/MetaMask/contributor-docs/blob/main/docs/testing/unit-testing.md) when writing tests.

If you need to customize the test runner for a package, see its `jest.config.cjs` or `vitest.config.mjs`.

- Run `yarn workspace <workspaceName> run test` to run all tests for a package.
- Run `yarn workspace <workspaceName> run jest --no-coverage <file>` to run a test file within the context of a package.
- For a package on Vitest, run `yarn workspace <workspaceName> run vitest run --coverage=false <file>` instead.
- Run `yarn test` to run tests for all packages.
- Run `yarn test:packages` to run package tests without coverage. Jest packages use their existing test scripts, migrated packages run their type tests when present, and all migrated unit tests run in one Vitest invocation. The Vitest invocation is skipped when no packages have migrated.
- Run `yarn test:vitest` to run all migrated unit tests without coverage, or `yarn test:vitest --project <projectName>` to select a project, such as `base-controller`.

The root `vitest.config.mjs` discovers projects through `packages/*/vitest.config.mjs`. Each package configuration extends `vitest.config.packages.mjs` for shared setup and test settings. Running a package's own `test` script still collects coverage and enforces its thresholds; the root Vitest run disables coverage.

> **Note**
>
> `workspaceName` in these commands is the `name` field within a package's `package.json`, e.g., `@metamask/address-book-controller`, not the directory where it is located, e.g., `packages/address-book-controller`.
