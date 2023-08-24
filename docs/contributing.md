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

## Creating pull requests

When submitting a pull request for this repo, take some a bit of extra time to fill out its description. Use the provided template as a guide, paying particular attention to two sections:

- **Explanation**: This section is targeted toward maintainers and is intended for you to explain the purpose and scope of your changes and share knowledge that they might not be able to see from reading the PR alone. Some questions you should seek to answer are:
  - What is the motivator for these changes? What need are the changes satisfying? Is there a ticket you can share or can you provide some more context for people who might not be familiar with the domain?
  - Are there any changes in particular whose purpose might not be obvious or whose implementation might be difficult to decipher? How do they work?
  - If your primary goal was to update one package but you found you had to update another one along the way, why did you do so?
  - If you had to upgrade a dependency, why did you do so?
- **Changelog:** This section is targeted toward consumers — internal developers of the extension or mobile app in addition to external dapp developers — and is intended to be a list of your changes from the perspective of each package in the monorepo. Questions you should seek to answer are:
  - Which packages are being updated?
  - What are the _exact_ changes to the API (types, interfaces, functions, methods) that are being changed?
  - What are the anticipated effects to whichever platform might want to make use of these changes?
  - If there are breaking changes to the API, what do consumers need to do in order to adapt to those changes upon upgrading to them?

## Testing changes to packages against another project

If you have a project that depends on packages from this monorepo, you may wish to load changes to those packages into the project and test them locally or in CI before releasing them. To solve that problem, this repository provides a mechanism to publish "preview" versions of packages. These versions can then be used in the project like any other versions.

### Publishing preview builds as a MetaMask contributor

If you're a member of the MetaMask organization, you can create preview builds for a pull request by posting a comment with the text `@metamaskbot publish-preview`. This starts the `publish-preview` GitHub action; after a few minutes, it should complete and you will see a new comment that lists the newly published packages. You can then [use these versions in your project](#using-preview-builds).

Note two things about each package:

- The name is scoped to `@metamask-previews` instead of `@metamask`.
- The ID of the last commit in the branch is appended to the version, e.g. `1.2.3-e2df9b4` instead of `1.2.3`.

If you make more changes and wish to publish another set of preview builds, post another comment on the pull request with `@metamaskbot publish-preview`.

### Publishing preview builds as an independent contributor

If you've forked this repository, you can create preview versions for a branch by following these steps:

1. First, since preview build releases are published under an NPM organization, you'll need access to one. If this is not the case, you can either [create a new organization](https://www.npmjs.com/org/create) or [convert your existing username into an organization](https://www.npmjs.com/org/upgrade).

2. Once you've done this, open the `package.json` for each package that you want to publish and change the scope in the name from `@metamask` to `@<NPM_ORG>`, replacing `NPM_ORG` appropriately.

3. Next, run the following commands to generate preview versions for all packages based on the current branch and publish them (again, replacing `NPM_ORG`):

   ```
   yarn prepare-preview-builds "@<NPM_ORG>" "$(git rev-parse --short HEAD)" && yarn build && yarn publish-previews
   ```

   You should be able to see the published version of each package in the output. Note two things:

   - The name is scoped to the NPM organization you entered instead of `@metamask`.
   - The ID of the last commit in the branch is appended to the version, e.g. `1.2.3-e2df9b4` instead of `1.2.3`.

4. Once this command is complete, all preview builds will be published, and you can then [use them in your project](#using-preview-builds).

If you make more changes and wish to publish another set of preview builds, run steps 3 and 4 again.

### Using preview builds

To use a preview build for a package within a project, you need to override the resolution logic for your package manager so that the "production" version of that package is replaced with the preview version. Here's how you do that:

1. Open `package.json` in the project and locate the dependency entry for the core package for which you want to use a preview build.
2. Locate the section responsible for resolution overrides (or create it if it doesn't exist). If you're using Yarn, this is `resolutions`; if you're using NPM or any other package manager, this is `overrides`.
3. Add a line to this section that mirrors the dependency entry on the left-hand side and points to the preview version on the right-hand side:

   ```
   "@metamask/<PACKAGE_NAME>@<PRODUCTION_VERSION_SPECIFIER>": "npm:@<NPM_ORG>/<PACKAGE_NAME>@<PREVIEW_VERSION>"
   ```

4. Run `yarn install`.

For example:

- If you're a member of MetaMask, your project uses Yarn, `@metamask/controller-utils` is listed in dependencies at `^1.1.4` and you want to use the preview version `1.2.3-e2df9b4`, add the following to `resolutions`:

  ```
  "@metamask/controller-utils@^1.1.4": "npm:@metamask-previews/controller-utils@1.2.3-e2df9b4"
  ```

- If you are an individual contributor, your project uses NPM, `@metamask/assets-controllers` is listed in dependencies at `^3.4.7` and you want to use the preview version `4.5.6-bc2a997` published under `@foo`, add the following to `overrides`:

  ```
  "@metamask/assets-controllers@^3.4.7": "npm:@foo/assets-controllers@4.5.6-bc2a997"
  ```

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
