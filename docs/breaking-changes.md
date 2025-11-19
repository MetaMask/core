# Preparing & Releasing Breaking Changes

When developing packages, it is always important to be intentional about the impact that changes have on projects which use those packages. However, special consideration must be given to breaking changes.

This guide provides best practices for working with and adapting to breaking changes in other projects.

## What is a breaking change?

A change to a package is "breaking" if upgrading a project to a version containing the change requires modifications to source code or configuration in order to avoid user- or developer-facing problems (an inability to use or build the project, a loss of functionality, etc.).

There are many ways that this can happen. Here is a non-exhaustive list of examples:

- Changing the number of required arguments for a function or method
- Narrowing the type of an argument in a function or method
- Changing the number of required properties in an object type
- Narrowing the type of a property in an object type
- Changing the number of type parameters for a type
- Throwing a new error in a function or method
- Adding external actions or events to a messenger type
- Removing a method from a class
- Removing an export from a package
- Changing a function or method so that it no longer fires an event
- Bumping the minimum supported Node.js version of a package
- Making any other [TypeScript-level breaking change](https://www.semver-ts.org/formal-spec/2-breaking-changes.html) not listed here
- Upgrading a dependency used in production code to a version that causes any of the above

## Introducing breaking changes safely

Before merging a PR that introduces breaking changes, it is important to ensure that changes are accounted for and handled correctly:

### 1. Document breaking changes

To inform other maintainers now and in the future, note breaking changes in the changelog as you introduce them:

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

Now that you've documented the affected symbols and exports in your package, locate all of the projects across MetaMask that use them. When you release your changes, how will those projects be affected?

### 3. Prepare upgrade PRs

To verify what sorts of modifications are required to dependent projects following your breaking changes:

1. Create a [preview build](./contributing.md#testing-changes-to-packages-with-preview-builds) for your package.
2. Open draft PRs in the dependent projects.
3. In each draft PR, upgrade to the preview build.
4. Test the project, particularly the functionality that makes use of your package.
5. If you see compile-time or runtime errors, make changes to the project as necessary.
6. If you discover new breaking changes that you haven't listed in the changelog for your library, go back and [document them](#document-breaking-changes).
7. Once you've done this for all projects, check off the "I've followed the process for releasing breaking changes" item in the checklist at the bottom of your PR.

This process serves as a check to help you understand the full impact of your changes. It will also save you time after you make a new release, because you can reuse the draft PRs later to complete upgrades.
