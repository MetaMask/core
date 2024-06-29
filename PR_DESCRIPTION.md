# Pull Request Description

## Summary

This pull request merges changes from several branches into a single branch to address issues related to converting `*` exports to named exports in various `index.ts` files within the `core` repository. The branches merged are:

- `devin/fix-issues/193915/1`
- `devin/fix-issues/193915/4`
- `devin/fix-issues/193915/5`
- `devin/fix-issues/193915/2`
- `devin/fix-issues/193915/3`

## Changes

The following changes have been made:

- Converted `*` exports to named exports in the `index.ts` files of the following packages:
  - `profile-sync-controller`
  - `selected-network-controller`
  - `rate-limit-controller`
  - `signature-controller`
- Updated test snapshots to reflect the changes.
- Resolved all linting issues using `yarn lint --fix`.

## Tasks Completed

- [x] Set up the `core` repository and merged specified branches.
- [x] Resolved linting issues and updated test snapshots.
- [x] Ran `yarn lint --fix` to resolve all lint errors in the codebase.
- [x] Created a pull request for the `devin/fix-issues/193915/merge` branch.

## Notes

- The `core` repository is a monorepo managed by MetaMask.
- The `gh` CLI tool was used for authenticated GitHub actions.
- Corepack was enabled in the `core` repository.
- Dependencies were installed using Yarn, with warnings about incompatible peer dependencies and missing peer dependencies.
- The `yarn test --updateSnapshot` command was run, and one snapshot was updated in the `packages/signature-controller/src/index.test.ts` file.
- The `yarn lint --fix` command was run, and the output indicates that all matched files use the Prettier code style, with no linting issues remaining.

Please review the changes and provide feedback. Thank you!
