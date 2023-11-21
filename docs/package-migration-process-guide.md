# Package Migration Process Guide

This document outlines the process for migrating a MetaMask library that complies with the requirements defined in the `metamask-module-template` repo into the core monorepo.

## Phase A: Preparation in source repo

### 1. Add the following migration notice to the README

```markdown
<table><tr><td><p align="center"><b>⚠️ PLEASE READ ⚠️</b></p><p align="center">This package is currently being migrated to our <a href="https://github.com/MetaMask/core"><code>core</code></a> monorepo. Please do not make any commits to this repository while this migration is taking place, as they will not be transferred over. Also, please re-open PRs that are under active development in the core repo.</p></td></tr></table>
```

- [Example PR](https://github.com/MetaMask/eth-json-rpc-provider/pull/38)

### 2. Disable `dependabot` dependency upgrades

### 3. Add the source repo to the ZenHub workspace repo filter so that its issues/PRs show up on the board

### 4. Align dependency versions and TypeScript, ESLint, Prettier configurations with the core monorepo

- If the dependency versions of the migration target are ahead of core, consider updating the core dependencies first.
- Apply the configurations of the core monorepo to the source repo files.
- Preserve any TypeScript compiler flags that are enabled in the source repo but not in core.
- Resolve all errors or issues resulting from these changes.
- [Example PR](https://github.com/MetaMask/eth-json-rpc-provider/pull/28)
  
### 5. Add any missing files required in subpackages of the core monorepo (e.g. LICENSE)

- [Example PR](https://github.com/MetaMask/eth-json-rpc-provider/pull/24)

### 6. If the package name is not prefixed by the `@metamask/` namespace, rename the package

- Modify the "name" field in `package.json`.
- Update the title of the README.md.
- Add a CHANGELOG entry for the rename.

### 7. Create a new release of the migration target from the source repo

- All subsequent releases of migration target will be partial releases made from the core monorepo.
- [Example PR](https://github.com/MetaMask/eth-json-rpc-provider/pull/29)

### 8. Migrate the git history

1. [Install `git-filter-repo`](https://github.com/newren/git-filter-repo/blob/main/INSTALL.md). This tool is like Git's `filter-branch` command, but much easier to use and much less error-prone.
2. Navigate to a temporary directory: `cd /tmp`
3. Clone the repo for the library you want to migrate: `git clone https://github.com/MetaMask/<repo-name>` (e.g. `<repo-name>` = `utils`). Do **NOT** use an existing clone.
4. `cd` into the newly cloned repo.
5. Run `git filter-repo --to-subdirectory-filter merged-packages/<package-name>` (e.g. `<package-name>` = `utils`). This will rewrite all history to move all files to `merged-packages/<package-name>`. (This is why we're making a fresh clone in a temporary directory — this action is irreversible.)
6. `cd` to wherever you keep the `core` repo on your machine.
7. Add the library as a remote: `git remote add <package-name> /tmp/<package-name>`.
8. Fetch history: `git fetch <package-name> --no-tags`
9. Make a new branch: `git checkout -b migrate-<package-name>`
10. Merge the library into the monorepo: `git merge --allow-unrelated-histories <package-name>/<primary-branch>` (e.g. `<primary-branch>` = `main`)
11. Make a pull request: [Example PR](https://github.com/MetaMask/core/pull/1520).

## Phase B: Staging from `merged-packages/`

### 0. Move the migration target into a temporary directory in core (`merged-packages/`)

- Open a pull request that moves the `merged-packages/<package-name>` directory resulting from the previous step (A-8) into the `merged-packages/` directory of the core monorepo.
- DO NOT rebase the `migrate-<package-name>` branch.
- Ensure that superfluous merge commits don't pollute the history. If necessary, replace the PR branch with a cleaned-up post-migration commit history by rerunning the git history migration steps before merging the PR.
  - For context: https://github.com/MetaMask/core/pull/1804#issuecomment-1771445829
- Contact admins to temporarily enable merge commits into main.
- Merge PR **without squashing** to preserve the migrated git commit history.
- [Example PR](https://github.com/MetaMask/core/pull/1872)

### 1. Port tags

- See: https://github.com/MetaMask/core/issues/1800
- Port the tags locally with the correct package name prefixes.
- Push the ported tags to a fork of the core monorepo for testing.
- Verify that the tag diff links in CHANGELOG are working.
- The diff between last tag before migration and first one after will always include the entire history of the monorepo.
- Push the ported tags to the core repo.
- Verify that the tag diff links in CHANGELOG are working.
- Identify and create tags for release commits that were untagged in the original repo.

### 2. Remove files and directories that will be replaced by files in the monorepo root

- https://github.com/MetaMask/core/pull/1764
- **Remove**: `.github/`, `.git*`, `scripts/`, `.depcheckrc.json`, `.yarn/`, `.yarnrc.yml`, `yarn.lock`, `.editorconfig`, `.eslint*`, `.prettier*`, `.nvm*`.
- **Keep**: `src/`, `tests/`, `CHANGELOG.md`, `LICENSE`, `package.json`, `README.md`, `jest.config.js`, `tsconfig*.json`, `typedoc.json`
  
### 3. Replace config files

- https://github.com/MetaMask/core/pull/1765
- Update `tsconfig*.json`, `typedoc.json`, `jest.config.js` to extend from corresponding files in root. Copy contents of corresponding files in other non-root packages.
- Keep TypeScript compiler flags and compilation target.
- Add tsconfig reference paths for non-root packages that are upstream dependencies of the migration target.
- Keep Jest coverage threshold values.
- Add `deepmerge` as a devDependency.
  
### 4. Align dependencies and build scripts with monorepo

- https://github.com/MetaMask/core/pull/1766
- Remove redundant build scripts that are already listed in the root package.json (including `prepack`)
- Identify validator fixes for CHANGELOG by navigating to `merged-packages/<package-name>`, running `../../scripts/validate-changelog.sh @metamask/<package-name>`, and applying the diffs.
  - If the package has been renamed or needs to be renamed with the `@metamask/` namespace, supply two arguments: `versionBeforePackageRename`, `tagPrefixBeforePackageRename`.
  - See https://github.com/MetaMask/auto-changelog#validate
- Remove redundant dependencies that are already listed in the root package.json.
  - Exception: do not remove TypeScript.
- Align dependency versions with other non-root packages.
  - If migration target dependency version is ahead: Decrement to match monorepo packages.
  - If it's behind:
    - Bump if it's an internal dependency (i.e. the dependency is another sub-package in the monorepo).
    - If it's external, bump only if there are no resulting breaking changes that need to be resolved.
  
### 5. Add exception for non-MIT license

- If the migration target uses a non-MIT license, add exception entries in the root `constraints.pro` file.
  - Add 2 rules to license section of `constraints.pro`: Exclude (`\=`) from MIT rule and include in ISC rule (`==`)
- Make sure the new rule doesn't break any of the existing package.json files by running `yarn constraints`.
- [Example PR](https://github.com/MetaMask/core/pull/1888)

### 6. Update the migration target's README to reflect its new status as a non-root package in the monorepo

- Preserve package intro sentence/paragraph.
- Add/modify "Installation" section.
- Preserve "Usage" section.
- Remove "Test", "Build" and other instructions on common development tasks.
- Add "Contributing" section.

## Phase C: Integration into `packages/`

- https://github.com/MetaMask/core/pull/1738

### 1. The big leap

- **Move migration target from `merged-packages/` to `packages/`.**
- Run `yarn install` in the root directory.
- Check that all tests are passing in migration target by running `yarn workspace @metamask/<package-name> test`.

### 2. Update downstream repos

- **IMPORTANT** Add reference paths for migration target in the root `tsconfig.json` and `tsconfig.build.json` files.
  - This step is essential to avoid build failure for the migration target during release workflow.
- Add tsconfig reference paths for migration target in downstream packages.
- Bump migration target version in downstream packages and root.
  - Notes on why this version bump needs to happen as part of this PR (import module shadowing): https://github.com/MetaMask/core/pull/1738#discussion_r1357554901

### 3. Linter fixes

- Apply yarn constraints fixes to migration target package.json file: `yarn constraints --fix` (run twice).
- Add the `changelog:validate` build script.

### 4. Resolve or TODO downstream errors

- If introducing the migration target breaks any downstream repos:
  - Resolve simple errors
  - Mark and ignore complex/blocked errors using `@ts-expect-error TODO:` annotations.
- Create a separate issue for resolving the marked errors as soon as the migration is completed.
  - https://github.com/MetaMask/core/issues/1823

### 5. Finalize merge

- Check that all tests are passing in all subpackages of core and CI.
- Double-check that dependency version bumps or other changes made to main while the PR was open are correctly merged and reflected.
- Merge `packages/<package-name>` directory into core main branch.

## Phase D: Clean-up and Release

### Source repo

- Transfer open issues from the source repo into the core monorepo using the `Transfer issue` feature.
  - Prepend the title with the package name.
- For open PRs in the source repo, lock conversation (with no reason provided), and leave a comment requesting that authors reopen the PR in core with a link pointing to the discussion in the original PR.
  - For important PRs, manually migrate into core or create tickets for follow-up.

```markdown
This library has now been migrated into the [core monorepo](https://github.com/metamask/core/). This PR has been locked and this repo will be archived shortly. Going forward, releases of this library will only include changes made in the core repo.
- Please push this branch to core and open a new PR there.
- Optionally, add a link pointing to the discussion in this PR to provide context.
```

- Leave a note in the source repo's README announcing the migration and pointing to core.

```html
<table><tr><td><p align="center"><b>⚠️ PLEASE READ ⚠️</b></p><p align="center">This package has been migrated to our <a href="https://github.com/MetaMask/core"><code>core</code></a> monorepo, and this repository has been archived. Please note that all future development and feature releases will take place in the <a href="https://github.com/MetaMask/core"><code>core</code></a> repository.</p></td></tr></table>
```

- Archive the source repo to prevent any changes from being pushed to it going forward.

### Core

- Add migration target to README dependency graph using the `generate-dependency-graph` build script.
- Fix downstream errors that were marked with `@ts-expect-error TODO:` during the migration process.
- Record any changes made to packages during the migration process in their respective CHANGELOGs.
- Use the `yarn create-release-branch` tool to publish a release of core with a new version for the migrated package and any updated downstream packages.
