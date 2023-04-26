# Contributing to the monorepo

## Getting started

- Install [Node.js](https://nodejs.org) version 16.
  - If you're using [NVM](https://github.com/creationix/nvm#installation) (recommended), `nvm use` will ensure that the right version is installed.
- Install [Yarn v3](https://yarnpkg.com/getting-started/install).
- Run `yarn install` to install dependencies and run any required post-install scripts.
- Run `yarn simple-git-hooks` to add a [Git hook](https://github.com/toplenboren/simple-git-hooks#what-is-a-git-hook) to your local development environment which will ensure that all files pass linting before you push a branch.

## Testing

- Run `yarn workspace <workspaceName> run test` to run all tests for a package.
- Run `yarn workspace <workspaceName> run jest --no-coverage <file>` to run a test file within the context of a package.
- Run `yarn test` to run tests for all packages.

> **Note**
>
> `workspaceName` in these commands is the `name` field within a package's `package.json`, e.g., `@metamask/address-book-controller`, not the directory where it is located, e.g., `packages/address-book-controller`.

## Using packages in other projects during development/testing

When developing changes to packages within this repository that a different project depends upon, you may wish to load those changes into the project and test them locally or in CI before publishing proper releases of those packages. To solve that problem, this repository provides a mechanism to publish "preview" versions of packages to GitHub Package Registry. These versions can then be used in the project like any other version, provided the project is configured to use that registry.

> **Warning**
>
> There is a known problem with the preview build workflow. It relies upon you having a local cache of any non-preview `@metamask/`-scoped packages.
>
> If you encounter problems installing non-preview `@metamask/`-scoped packages when using this workflow, you can work around the problem by temporarily removing the `.npmrc` / `.yarnrc.yml` changes to install the missing packages. Once they are installed, restore the preview build credentials to use preview builds. The non-preview `@metamask/`-scoped packages should then be found in your local cache.
>
> See [issue #1075](https://github.com/MetaMask/core/issues/1075) for more details.

### As a MetaMask contributor

If you're a MetaMask contributor, you can create these preview versions via draft pull requests:

1. Navigate to your settings within GitHub and [create a classic access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-personal-access-token-classic). Make sure to give this token the `read:packages` scope.
2. Switch to your project locally and add/edit the appropriate file with the following content, filling in the appropriate areas:

   - **Yarn 1 (classic) or NPM**

     Add the following in `.npmrc`

     ```
     @metamask:registry=https://npm.pkg.github.com
     //npm.pkg.github.com/:_authToken=<your personal access token>
     ```

   - **Yarn >= 2 (berry):**

     Add the following in `.yarnrc.yml`

     ```
     npmScopes:
        metamask:
           npmAlwaysAuth: true
           npmAuthToken: <your personal access token>
           npmRegistryServer: 'https://npm.pkg.github.com'
     ```

   Make sure not to commit these changes.

3. Go to GitHub and open up a pull request for this repository, then post a comment on the PR with the text `@metamaskbot publish-preview`. (This triggers the `publish-preview` GitHub action.)
4. After a few minutes, you will see a new comment indicating that all packages have been published with the format `<package name>-<commit id>`.
5. Switch back to your project locally and update `package.json` by replacing the versions for the packages you've changed in your PR using the new version format (e.g. `1.2.3-e2df9b4` instead of `~1.2.3`), then run `yarn install`.
6. Repeat steps 3-5 after pushing new changes to your PR to generate and use new preview versions.

### As an independent contributor

If you're a contributor and you've forked this repository, you can create preview versions for a branch via provided scripts:

1. Navigate to your settings within GitHub and [create a **classic** access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-personal-access-token-classic). Make sure to give this token the `read:packages` scope.
2. Switch to your project locally and add/edit the appropriate file with the following content, filling in the appropriate areas.

   - **Yarn 1 (classic) or NPM:**

     Add the following in `.npmrc`

     ```
     @<your GitHub username>:registry=https://npm.pkg.github.com
     //npm.pkg.github.com/:_authToken=<your personal access token>
     ```

   - **Yarn >= 2 (berry):**

     Add the following in `.yarnrc.yml`

     ```
     npmScopes:
        <your GitHub username>:
           npmAlwaysAuth: true
           npmAuthToken: <your personal access token>
           npmRegistryServer: 'https://npm.pkg.github.com'
     ```

   Make sure not to commit these changes.

3. Open the `package.json` for each package that you want to publish and change the scope in the name from `@metamask` to `@<your GitHub username>`.
4. Switch to your fork of this repository locally and run `yarn prepare-preview-builds "$(git rev-parse --short HEAD)" && yarn build && yarn publish-previews` to generate preview versions for all packages based on the current branch and publish them to GitHub Package Registry. Take note of the version that is published; it should look like `1.2.3-e2df9b4` instead of `1.2.3`.
5. Switch back to your project and update `package.json` by replacing the versions for all packages you've changed using the version that was output in the previous step, then run `yarn install`.
6. If you make any new changes to your project, repeat steps 3-5 to generate and use new preview versions.
7. As changes will have been made to this repository (due to step 4), make sure to clear out those changes after you've completed testing.

## Linting

Run `yarn lint` to lint all files and show possible violations.

Run `yarn lint:fix` to fix any automatically fixable violations.

## Performing operations across the monorepo

This repository relies on Yarn's [workspaces feature](https://yarnpkg.com/features/workspaces) to provide a way to work with packages individually and collectively. Refer to the documentation for the following Yarn commands for usage instructions:

- [`yarn workspace`](https://yarnpkg.com/cli/workspace)
- [`yarn workspaces foreach`](https://yarnpkg.com/cli/workspaces/foreach)

> **Note**
>
> - `workspaceName` in the Yarn documentation is the `name` field within a package's `package.json`, e.g., `@metamask/address-book-controller`, not the directory where it is located, e.g., `packages/address-book-controller`.
> - `commandName` in the Yarn documentation is any sub-command that the `yarn` executable would usually take. Pay special attention to the difference between `run` vs `exec`. If you want to run a package script, you would use `run`, e.g., `yarn workspace @metamask/address-book-controller run changelog:validate`; but if you want to run _any_ shell command, you'd use `exec`, e.g. `yarn workspace @metamask/address-book-controller exec cat package.json | jq '.version'`.

## Releasing

The [`create-release-branch`](https://github.com/MetaMask/create-release-branch) tool and [`action-publish-release`](https://github.com/MetaMask/action-publish-release) GitHub action are used to automate the release process.

1. **Create a release branch.**

   Run `yarn create-release-branch`. This tool generates a file and opens it in your editor, where you can specify which packages you want to include in the next release and which versions they should receive. Instructions are provided for you at the top; read them and update the file accordingly.

   When you're ready to continue, save and close the file.

2. **Update changelogs for relevant packages.**

   At this point you will be on a new release branch, and a new section will have been added to the changelog of each package you specified in the previous step.

   For each changelog, review the new section and make the appropriate changes:

   - Move each entry into the appropriate category (review the ["Keep a Changelog"](https://keepachangelog.com/en/1.0.0/#types) spec for the full list of categories and the correct ordering of all categories).
   - Remove any changelog entries that don't affect consumers of the package (e.g. lockfile changes or development environment changes). Exceptions may be made for changes that might be of interest despite not having an effect upon the published package (e.g. major test improvements, security improvements, improved documentation, etc.).
   - Reword changelog entries to explain changes in terms that users of the package will understand (e.g., avoid referencing internal variables/concepts).
   - Consolidate related changes into one change entry if it makes it easier to comprehend.

   Run `yarn changelog:validate` to check that all changelogs are correctly formatted.

   Commit and push the branch.

3. **Submit a pull request for the release branch so that it can be reviewed and tested.**

   Make sure the title of the pull request follows the pattern "Release \<new version\>".

   If changes are made to the base branch, the release branch will need to be updated with these changes and review/QA will need to restart again. As such, it's probably best to avoid merging other PRs into the base branch while review is underway.

4. **"Squash & Merge" the release.**

   This step triggers the [`publish-release` GitHub action](https://github.com/MetaMask/action-publish-release) workflow to tag the final release commit and publish the release on GitHub.

   Pay attention to the box you see when you press the green button and ensure that the final name of the commit follows the pattern "Release \<new version\>".

5. **Publish the release on NPM.**

   The `publish-release` GitHub Action workflow runs the `publish-npm` job, which publishes relevant packages to NPM. It requires approval from the [`npm-publishers`](https://github.com/orgs/MetaMask/teams/npm-publishers) team to complete. If you're not on the team, ask a member to approve it for you; otherwise, approve the job.

   Once the `publish-npm` job has finished, [check NPM](https://npms.io/search?q=scope%3Ametamask) to verify that all relevant packages has been published.
