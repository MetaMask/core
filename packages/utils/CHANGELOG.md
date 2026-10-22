# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: use TypeScript for Vitest configs ([#10921](https://github.com/MetaMask/core/pull/10921))
- test: run utils on Vitest ([#10871](https://github.com/MetaMask/core/pull/10871))
- chore: opt into Jest types per package instead of in tsconfig.base.json ([#10862](https://github.com/MetaMask/core/pull/10862))
- chore(dev-deps): bump `oxfmt` from `^0.44.0` to `^0.72.0` ([#10785](https://github.com/MetaMask/core/pull/10785))
- chore(deps): update dependency typedoc-plugin-missing-exports to v4 ([#10762](https://github.com/MetaMask/core/pull/10762))
- chore(deps): update dependency typedoc-plugin-missing-exports to ^2.3.0 ([#10710](https://github.com/MetaMask/core/pull/10710))
- chore(deps): update dependency typedoc to ^0.28.20 ([#10731](https://github.com/MetaMask/core/pull/10731))
- chore: replace `tsx` with plain Node ([#10564](https://github.com/MetaMask/core/pull/10564))
- refactor: rewrite `.js` imports in `scripts` folder to `.ts` ([#10537](https://github.com/MetaMask/core/pull/10537))
- chore(deps): update jestjs-jest to ^30.5.2 ([#10514](https://github.com/MetaMask/core/pull/10514))
- chore(deps): update dependency ts-jest to ^29.4.14 ([#10509](https://github.com/MetaMask/core/pull/10509))
- chore(lint): apply automatic lint fixes ([#10346](https://github.com/MetaMask/core/pull/10346))
- fix(deps): update dependency deepmerge to ^4.3.1 ([#10437](https://github.com/MetaMask/core/pull/10437))
- chore(deps): update dependency tsx to ^4.23.15 ([#10434](https://github.com/MetaMask/core/pull/10434))
- chore(dev-deps): drop `@types/jest-when` ([#10388](https://github.com/MetaMask/core/pull/10388))
- chore(deps): update dependency jest-when to v4 ([#10376](https://github.com/MetaMask/core/pull/10376))
- chore(deps): update dependency tsx to ^4.23.13 ([#10369](https://github.com/MetaMask/core/pull/10369))
- chore(deps): update dependency rimraf to v6 ([#10379](https://github.com/MetaMask/core/pull/10379))
- chore(deps): update dependency @metamask/auto-changelog to ^6.2.1 ([#10364](https://github.com/MetaMask/core/pull/10364))
- chore(deps): update dependency @types/jest-when to ^3.5.5 ([#10359](https://github.com/MetaMask/core/pull/10359))
- chore(deps): update dependency ts-jest to ^29.4.12 ([#10328](https://github.com/MetaMask/core/pull/10328))
- chore(deps): update dependency rimraf to ^5.0.10 ([#10327](https://github.com/MetaMask/core/pull/10327))
- chore(deps): update dependency tstyche to ^7.2.5 ([#10329](https://github.com/MetaMask/core/pull/10329))
- chore(utils): resolve jsdoc lint suppressions ([#10246](https://github.com/MetaMask/core/pull/10246))
- chore: run `lint:fix` ([#10285](https://github.com/MetaMask/core/pull/10285))
- chore: integrate `@metamask/utils` into `packages/` ([#10185](https://github.com/MetaMask/core/pull/10185))

### Changed

- This package was migrated from `MetaMask/utils` to the `MetaMask/core` monorepo ([#10175](https://github.com/MetaMask/core/pull/10175))
  - See [MetaMask/utils](https://github.com/MetaMask/utils/blob/main/CHANGELOG.md) for the original changelog, which covers every release up to and including `12.0.0`.
- Move `Json`, `Mutable`, `NonEmptyArray`, `PartialOrAbsent`, `RuntimeObject`, `getKnownPropertyNames`, `hasProperty`, `isNullOrUndefined`, `isObject`, and `isPlainObject` to `@metamask/type-utils` ([#10908](https://github.com/MetaMask/core/pull/10908))
  - These are still re-exported from `@metamask/utils`, so the public API is unchanged.
  - It's recommended to import these types and functions from `@metamask/type-utils` instead of `@metamask/utils` going forward.
- Move `AssertionError`, `AssertionErrorConstructor`, `assert`, and `assertExhaustive` to `@metamask/type-utils` ([#10983](https://github.com/MetaMask/core/pull/10983))
  - These are still re-exported from `@metamask/utils`, so the public API is unchanged.
  - It's recommended to import these types and functions from `@metamask/type-utils` instead of `@metamask/utils` going forward.
- Move `ensureError`, `getErrorMessage`, `isErrorWithCode`, `isErrorWithMessage`, `isErrorWithStack`, and `wrapError` to `@metamask/error-utils` ([#10917](https://github.com/MetaMask/core/pull/10917))
  - These are still re-exported from `@metamask/utils`, so the public API is unchanged.
  - It's recommended to import these functions from `@metamask/error-utils` instead of `@metamask/utils` going forward.
- Move `FileSandbox`, `createSandbox`, `directoryExists`, `ensureDirectoryStructureExists`, `fileExists`, `forceRemove`, `readFile`, `readJsonFile`, `writeFile`, and `writeJsonFile` to `@metamask/node-utils` ([#10926](https://github.com/MetaMask/core/pull/10926))
  - These are still re-exported from `@metamask/utils/node`, so the public API is unchanged.
  - It's recommended to import these types and functions from `@metamask/node-utils` instead of `@metamask/utils/node` going forward.
- Bump `uuid` from `^9.0.1` to `^11.1.1` ([#10243](https://github.com/MetaMask/core/pull/10243))
- Bump `semver` from `^7.6.3` to `^7.8.5` ([#10443](https://github.com/MetaMask/core/pull/10443))
- Bump `pony-cause` from `^2.1.10` to `^2.1.11` ([#10440](https://github.com/MetaMask/core/pull/10440))
- Bump `@types/lodash` from `^4.17.20` to `^4.17.26` ([#10435](https://github.com/MetaMask/core/pull/10435), [#10832](https://github.com/MetaMask/core/pull/10832))
- Bump `lodash` from `^4.17.21` to `^4.18.1` ([#10447](https://github.com/MetaMask/core/pull/10447))
- Bump `debug` from `^4.3.4` to `^4.4.3` ([#10523](https://github.com/MetaMask/core/pull/10523))

### Fixed

- Narrow byte helper return types to `Uint8Array<ArrayBuffer>` ([#10617](https://github.com/MetaMask/core/pull/10617))
  - These functions already returned a `Uint8Array` backed by an `ArrayBuffer`, but were typed as returning `Uint8Array<ArrayBufferLike>`.

[Unreleased]: https://github.com/MetaMask/core/
