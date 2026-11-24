# Writing and running tests

[Vitest](https://vitest.dev/) is used to ensure that code is working as expected. Ideally, all packages should have 100% test coverage.

Please follow the [MetaMask unit testing guidelines](https://github.com/MetaMask/contributor-docs/blob/main/docs/testing/unit-testing.md) when writing tests.

If you need to customize the behavior of the test runner for a package, see `vitest.config.ts` within that package.

- Run `yarn workspace <workspaceName> run test` to run all tests for a package.
- Run `yarn workspace <workspaceName> run test run <file>` to run a single test file.
- Run `yarn workspace <workspaceName> run test:coverage` to run all tests for a package with coverage and enforce its coverage thresholds.
- Run `yarn test` to run tests for all packages.
- Run `yarn test:packages --project <directory-name>` from the root to run a single package through the root Vitest projects config.

> **Note**
>
> `workspaceName` in these commands is the `name` field within a package's `package.json`, e.g., `@metamask/address-book-controller`, not the directory where it is located, e.g., `packages/address-book-controller`.
