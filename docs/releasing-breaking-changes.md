# Releasing Breaking Changes

When developing packages, it is always important to be intentional about the impact that changes have on projects which use those packages, but special consideration must be given to breaking changes.

This guide provides best practices for working with and adapting to breaking changes in other projects.

## What is a breaking change?

A change to a package is "breaking" if upgrading a project to a version that includes the change would require modifications to source code or configuration in order to avoid user- or developer-facing problems (an inability to use or build the project, a loss of functionality, etc.).

For example:

- Changing a function or method to throw an error
- Adding a required argument to a function or method
- Adding a required property to a TypeScript type
- Narrowing the type of a property in a TypeScript type
- Narrowing the type of an argument in a function
- Adding or removing a parameter to a TypeScript type
- Upgrading a dependency used in production code to a version which causes any of the above
- Adding external actions or events to a messenger type
- Removing a method from a class
- Removing a required argument from a function or method
- Removing an export from a package
- Bumping the minimum supported Node.js version of a package

## Introducing breaking changes safely

Before merging a PR that introduces a breaking change, a process must be followed to ensure that the change is accounted for and does not cause the problems mentioned above.

### 1. Document breaking changes

To inform other maintainers now and in the future, you must note breaking changes in the changelog as you introduce them:

1. Prefix the changelog entry with `**BREAKING:**`.
2. If relevant, provide details on how consuming code can adapt to the changes safely.
3. Move entries for breaking changes above all other kinds of changes within the same section.

For example:

```markdown
### Changed

- **BREAKING:** Add a required `source` argument to `getTransactions` ([#1111](https://github.com/MetaMask/core/pull/1111))
- **BREAKING:** Rename `Prices` to `PricesResponse` ([#2222](https://github.com/MetaMask/core/pull/2222))
- **BREAKING:** `destroy` is now async ([#3333](https://github.com/MetaMask/core/pull/3333))
- Widen the type of `getNetworkClientId` to return `string` ([#4444](https://github.com/MetaMask/core/pull/4444))

### Removed

- **BREAKING:** Remove `fetchGasPrices` from `GasPricesController` ([#5555](https://github.com/MetaMask/core/pull/5555))
  - Please use `GasPriceService` instead.
```

### 2. Audit dependent projects

Take an inventory of all of the places that use your package (especially projects in other repos). When you release your change, how will they be affected?

### 3. Prepare upgrade PRs

If you've determined that your change may require modifications to other projects, follow these steps:

1. Create a [preview build](./contributing.md#testing-changes-to-packages-with-preview-builds) for your package.
2. Open draft PRs in the dependent projects.
3. In each draft PR, upgrade to the preview build.
4. Test the project, particularly the functionality that makes use of your library.
5. If you see compile-time or runtime errors, make changes to the project as necessary.
6. If you discover new breaking changes that you haven't listed in the changelog for your library, go back and [document them](#document-breaking-changes).
7. Once you've done this for all projects, check off the "I've introduced breaking changes" item in the checklist at the bottom of your PR.

This process serves as a check to help you understand the full impact of your changes. It will also save you time after you make a new release, because you can reuse the draft PRs later to complete upgrades.
