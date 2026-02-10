# Preparing and releasing breaking changes

When developing packages, it is always important to be intentional about the impact that changes have on projects which use those packages. However, special consideration must be given to breaking changes.

This guide provides best practices for documenting, preparing, releasing, and adapting to breaking changes within `core` and in other projects.

## What is a breaking change?

A change to a package is "breaking" if upgrading a project to a version containing the change would require modifications to source code or configuration in order to avoid user- or developer-facing problems (an inability to use or build the project, a loss of functionality, etc.).

There are many kinds of breaking changes. Here are some examples:

- Removals
  - Removing a method from a class
  - Removing an export from a package (including a type export)
- Functional changes that require code changes or change expectations
  - Changing the number of required arguments for a function or method
  - Throwing a new error in a function or method
  - Changing a function or method so that it no longer fires an event
- Breaking changes to types
  - Adding external actions or events to a messenger type
  - Narrowing the type of an argument in a function or method
  - Changing the number of required properties in an object type
  - Narrowing the type of a property in an object type
  - Changing the number of type parameters for a type
  - Making any other change listed [here](https://www.semver-ts.org/formal-spec/2-breaking-changes.html)
- Bumping the minimum supported Node.js version of a package
- Upgrading a dependency referenced in published code to a version that causes any of the above

## Introducing breaking changes safely

Before merging a PR that introduces breaking changes, it is important to ensure that they are accounted for among projects.

### 1. Document breaking changes

To inform other maintainers now and in the future, make sure that breaking changes are documented in the changelog:

1. Be explicit in your changelog entries about which classes, functions, types, etc. are affected.
2. Prefix entries with `**BREAKING:**`.
3. If relevant, provide details on how consuming code can adapt to the changes safely.
4. Move entries for breaking changes above all other kinds of changes within the same section.

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

### 2. Audit dependents

When you release your changes, which codebases will be affected?

Using the changelog as a guide, locate all of the places across MetaMask that use the affected classes, functions, types, etc.:

- To find dependents of your package within `core`, look in the package's `package.json`, or simply search across the repo.
- To find dependents of your package across MetaMask, do a search on GitHub for import statements or, better, usages of the affected symbols.

### 3. Prepare upgrade PRs for dependents

Finally, how will dependent projects need to adapt to your breaking changes?

For dependent packages located in `core`, you may get type errors immediately that you will have to fix in the same PR that introduces the breaking changes. Otherwise, create new PRs to migrate existing code.

For other projects that live outside of `core`, you can use the following process to verify the effects:

1. Create a [preview build](./preview-builds.md) for your package.
2. Open draft PRs in the dependent projects.
3. In each draft PR, upgrade your package to the preview build.
4. Test the project, particularly the functionality that makes use of your package.
5. If you see compile-time or runtime errors, make changes to the project as necessary.
6. If you discover new breaking changes in your package that you haven't yet listed in the changelog, go back and [document them](#1-document-breaking-changes).
7. Once you've done this for all projects, check off the "I've followed the process for releasing breaking changes" item in the checklist at the bottom of your PR.

This process serves as a check to help you understand the full impact of your changes. It will also save you time after you make a new release, because you can reuse the draft PRs later to complete upgrades.
