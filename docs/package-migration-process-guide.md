# Package Migration Process Guide

This document outlines the process for migrating a MetaMask library into the core monorepo. The migration target is assumed to comply with the requirements defined by [`metamask-module-template`](https://github.com/MetaMask/metamask-module-template) and [`module-lint`](https://github.com/MetaMask/module-lint).

## Phase A: **Preparation** in the _Source Repo_

### **[PR#1]** 1. Add the following migration notice to the README

```markdown
<table><tr><td><p align="center"><b>⚠️ PLEASE READ ⚠️</b></p><p align="center">This package is currently being migrated to our <a href="https://github.com/MetaMask/core"><code>core</code></a> monorepo. Please do not make any commits to this repository while this migration is taking place, as they will not be transferred over. Also, please re-open PRs that are under active development in the core repo.</p></td></tr></table>
```

- [Example PR](https://github.com/MetaMask/eth-json-rpc-provider/pull/38)

### 2. Add the source repo to the ZenHub workspace repo filter so that its issues/PRs show up on the board

### **[PR#2]** 4. Align dependency versions and TypeScript, ESLint, Prettier configurations with the core monorepo

- If the dependency versions of the migration target are ahead of core, consider updating the core dependencies first.
- Apply the configurations of the core monorepo to the source repo files.
  - Preserve any TypeScript compiler flags that are enabled in the source repo but not in core.
- Resolve any errors or issues resulting from these changes.
- [Example PR](https://github.com/MetaMask/eth-json-rpc-provider/pull/28)

### **[PR#3]** 5. Review the `metamask-module-template`, and add any missing files or elements (e.g. LICENSE)

- [Example PR](https://github.com/MetaMask/eth-json-rpc-provider/pull/24)

### **[PR#4]** 6. Rename the migration target package so that it is prepended by the `@metamask/` namespace (skip if not applicable)

- Modify the "name" field in `package.json`.
- Update the title of the README.md.
- Add a CHANGELOG entry for the rename.

### **[PR#5]** 7. Create a new release of the migration target from the source repo

- All subsequent releases of the migration target will be made from the core monorepo.
- [Example PR](https://github.com/MetaMask/eth-json-rpc-provider/pull/29)

## Phase B: **Staging** from the core monorepo's `merged-packages/` directory

### **[PR#6]** 1. Migrate the source repo's git history into the `merged-packages/` temporary directory in core

#### Steps

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
11. Open a pull request in the core repo that reflects the above changes.

> [!WARNING]
>
> - DO NOT rebase the `migrate-<package-name>` branch, as this will disrupt the git history.
> - Ensure that superfluous merge commits to the main branch don't pollute the migrated git history.
>   - Coordinate with the team to minimize the time that this PR stays open.
>   - If necessary, replace the PR branch with a cleaned-up commit history by rerunning the git history migration steps before merging the PR.
>   - For further context on this: https://github.com/MetaMask/core/pull/1804#issuecomment-1771445829
> - Merge PR **without squashing** to preserve the migrated git commit history.
>   - Contact a [**maintainer**](https://github.com/orgs/MetaMask/teams/engineering?query=role%3Amaintainer) to temporarily enable merge commits into main.

- [Example PR](https://github.com/MetaMask/core/pull/1872)

### **[PR#7]** 2. Update the CHANGELOG tag diff links so that they follow the core repo's tag naming convention

- The core repo tags for non-root packages should be formatted as: `<package-name>@[version-number]`.
  - For all releases following the migration, the package name should be prepended with the `@metamask/` namespace.
- Make updates to the CHANGELOG tag diff links so that they follow this naming scheme:
  1. Navigate to `merged-packages/<package-name>`
  2. Run this command: `../../scripts/validate-changelog.sh @metamask/<package-name>`
  3. Apply the diffs outputted by the script.
- If the package has been renamed or needs to be renamed with the `@metamask/` namespace, supply two arguments to the script: `--version-before-package-rename`, `--tag-prefix-before-package-rename`.
- For further instructions on using the script, see: https://github.com/MetaMask/auto-changelog#validate.

### 3. Port tags

- Following [these instructions](./migrate-tags.md), use the `scripts/migrate-tags.sh` tool to port the source repo's release tags onto the migrated git history in core.

1. Port the tags locally.

- Use the script to ensure that the tags have the correct package name prefixes.

2. Create a fork of the core monorepo for testing, and push the ported tags to the test fork.

- **Do not run the script against `MetaMask/core` before testing it on a fork.**

3. From the fork, verify that the tag diff links in CHANGELOG are working.

- Note: The diff between any tag before migration and any tag after will always include the entire history of the monorepo. This is due to the nature of the process we use for git history migration, and is a WONTFIX issue.
- The correct diff can be derived using `git log --ancestry-path`, but GitHub compare links don't support --ancestry-path.

4. Push the ported tags to the core repo.

5. From the core repo, verify that the tag diff links in CHANGELOG are working.

6. Manually create tags for release commits that were never tagged in the original repo.

### **[PR#8]** 4. Remove files and directories that will be replaced by files in the monorepo root directory

- **Remove**: `.github/`, `.git*`, `scripts/`, `.depcheckrc.json`, `.yarn/`, `.yarnrc.yml`, `yarn.lock`, `.editorconfig`, `.eslint*`, `.prettier*`, `.nvm*`.
- **Keep**: `src/`, `tests/`, `CHANGELOG.md`, `LICENSE`, `package.json`, `README.md`, `jest.config.js`, `tsconfig*.json`, `typedoc.json`
- [Example PR](https://github.com/MetaMask/core/pull/1764)

### **[PR#9]** 5. Replace config files

- Update `tsconfig*.json`, `typedoc.json`, `jest.config.js` to extend from the corresponding files in the root directory by copying the contents of these files from other non-root packages.
- Preserve TypeScript compiler flags and its compilation target.
- Add tsconfig reference paths for non-root packages that are upstream dependencies of the migration target.
- Preserve Jest coverage threshold values.
- Add `deepmerge` as a devDependency.
- [Example PR](https://github.com/MetaMask/core/pull/1765)

### **[PR#10]** 6. Align dependencies and build scripts with monorepo

- Remove redundant build scripts that are already listed in the root package.json (including `prepack`)
- Remove redundant dependencies that are already listed in the root package.json.
  - Exception: do not remove TypeScript.
- Align dependency versions with other non-root packages.
  - If migration target dependency version is ahead: Decrement to match monorepo packages.
  - If it's behind:
    - Bump if it's an internal dependency (i.e. the dependency is another sub-package in the monorepo).
    - If it's external, bump only if there are no resulting breaking changes that need to be resolved.
- [Example PR](https://github.com/MetaMask/core/pull/1766)

### **[PR#11]** 7. Add exception for non-MIT license

- If the migration target uses a non-MIT license, add exception entries in the root `constraints.pro` file.
  - In the license section of `constraints.pro`: Exclude (`\=`) and include (`==`) the package in the appropriate license rules.
- Make sure the new rule doesn't break any of the existing package.json files by running `yarn constraints`.
- [Example PR](https://github.com/MetaMask/core/pull/1888)

### **[PR#12]** 8. Update the README to reflect its new status as a non-root package in the monorepo

- Preserve the opening sentence/paragraph that introduces the package.
- Add or modify an "Installation" section (see the READMEs of other non-root packages for examples).
- Preserve the "Usage" section.
- Remove "Test", "Build" and other instructions on common development tasks.
- Add a "Contributing" section (see the READMEs of other non-root packages for examples).

## **[PR#13]** Phase C: **Integration** into the core monorepo's `packages/` directory

- The following steps of "Phase C" need to happen in a single PR.
- Coordinate with the team to minimize the time that this PR stays open to avoid merge conflicts with the main branch from accumulating.
- [Example PR](https://github.com/MetaMask/core/pull/1738)

### 1. Move the migration target directory from `merged-packages/` into `packages/`

- Run `yarn install` in the root directory.
- Check that all tests are passing in migration target by running `yarn workspace @metamask/<package-name> test`.

### 2. Update downstream repos

- **IMPORTANT** Add reference paths for the migration target in the root `tsconfig.json` and `tsconfig.build.json` files.
  - This step is essential to avoid build failure for the migration target during release workflow.
- Add tsconfig reference paths for the migration target in downstream packages.
- Bump the migration target version in downstream packages and root.
  - Notes on why this version bump needs to happen as part of this PR (import module shadowing): https://github.com/MetaMask/core/pull/1738#discussion_r1357554901

### 3. Linter fixes

- Apply yarn constraints fixes to migration target package.json file: `yarn constraints --fix`.
- Add the `changelog:validate` build script to the package.json file.

### 4. Resolve or TODO downstream errors

- If introducing the migration target breaks any downstream repos:
  - Resolve simple errors as part of this PR.
  - Mark and ignore complex/blocked errors using `@ts-expect-error TODO:` annotations.
- Create a separate issue for resolving the marked errors as soon as the migration is completed.
  - e.g. https://github.com/MetaMask/core/issues/1823

### 5. Record changes made to any core package in its CHANGELOG, under the `## [Unreleased]` heading

- CHANGELOG entries should be recorded in the migration target's downstream packages for version bumps to the migration target's current release.
- [Example PR](https://github.com/MetaMask/core/pull/2003/files): this step can be performed either as a part of Phase C, or in a separate, subsequent PR.

### 6. Finalize merge

- Check that all tests are passing in all subpackages of core and CI.
- Double-check that dependency version bumps or other changes made to main while the PR was open are correctly merged and reflected.

## Phase D: Clean-up and Release

### Source repo

1. Transfer open issues from the source repo into the core monorepo using GitHub's `Transfer issue` feature (prepend the title with the package name: `[<package-name>]`).

2. For open PRs in the source repo, lock conversation (do not provide a reason), and leave a comment requesting that authors reopen the PR in core with a link pointing to the discussion in the original PR. For important PRs, manually migrate into core or create tickets for follow-up.

```markdown
This library has now been migrated into the [core monorepo](https://github.com/metamask/core/). This PR has been locked and this repo will be archived shortly. Going forward, releases of this library will only include changes made in the core repo.

- Please push this branch to core and open a new PR there.
- Optionally, add a link pointing to the discussion in this PR to provide context.
```

3. **[PR#14]** Leave a note in the source repo's README announcing the migration and pointing to core.

- This note should replace the notice added in step A-1.

```html
<table>
  <tr>
    <td>
      <p align="center"><b>⚠️ PLEASE READ ⚠️</b></p>
      <p align="center">
        This package has been migrated to our
        <a href="https://github.com/MetaMask/core"><code>core</code></a>
        monorepo, and this repository has been archived. Please note that all
        future development and feature releases will take place in the
        <a href="https://github.com/MetaMask/core"><code>core</code></a>
        repository.
      </p>
    </td>
  </tr>
</table>
```

4. Archive the source repo to prevent any changes from being pushed to it going forward.

- Contact a [**maintainer**](https://github.com/orgs/MetaMask/teams/engineering?query=role%3Amaintainer) to perform this step.

### Core

1. **[PR#15]** Add migration target to the list of packages in the README as well as the dependency graph in the README by running `yarn update-readme-content`.
2. Fix downstream errors that were marked with `@ts-expect-error TODO:` during the migration process.

- If possible, perform this step before the first post-migration release of the migrated package.

3. **[PR#16]** Use the `yarn create-release-branch` tool to publish a release of core with a new version for the migrated package and any updated downstream packages.
