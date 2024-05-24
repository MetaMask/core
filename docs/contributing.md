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

## Testing changes to packages in another project

If you have a project that depends on a package in this monorepo, you may want to load those changes into the project without having to create a whole new monorepo release. How you do this depends on your use case.

### Testing changes to packages locally

If you're developing your project locally and want to test changes to a package, you can follow these steps:

1. First, you must build the monorepo. It's recommend to run `yarn build:watch` so that changes to the package you want to change are reflected in your project automatically.
2. Next, you need to connect the package to your project by overriding the resolution logic in your package manager to replace the published version of the package with the local version.

   1. Open `package.json` in the project and locate the dependency entry for the package.
   2. Locate the section responsible for resolution overrides (or create it if it doesn't exist). If you're using Yarn, this is `resolutions`; if you're using NPM or any other package manager, this is `overrides`.
   3. Add a line to this section that mirrors the dependency entry on the left-hand side and points to the local path on the right-hand side:

      ```
      "@metamask/<PACKAGE_NAME>@<PUBLISHED_VERSION_RANGE>": "file:<PATH_TO_CORE>/packages/<PACKAGE_NAME>"
      ```

      > **Example:**
      >
      > - If your project uses Yarn, `@metamask/controller-utils` is listed in dependencies at `^1.1.4`, and your clone of the `core` repo is at the same level as your project, add the following to `resolutions`:
      >
      >   ```
      >   "@metamask/controller-utils@^1.1.4": "file:../core/packages/controller-utils"
      >   ```

   4. Run `yarn install`.

3. Due to the use of Yarn's `file:` protocol, if you update the package in the monorepo, then you'll need to run `yarn install` in the project again.

### Testing changes to packages with preview builds

If you want to test changes to a package where it would be unwieldy or impossible to use a local version, such as on CI, you can publish a preview build and configure your project to use it.

#### Publishing preview builds as a MetaMask contributor

If you're a member of the MetaMask organization, you can create preview builds based on a pull request by following these steps:

1. Post a comment on the pull request with the text `@metamaskbot publish-preview`. This starts the `publish-preview` GitHub action, which will create preview builds for all packages in the monorepo.
2. After a few minutes, the action should complete and you will see a new comment that lists the newly published packages along with their versions.

   Note two things about each package:

   - The name is scoped to `@metamask-previews` instead of `@metamask`.
   - The ID of the last commit in the branch is appended to the version, e.g. `1.2.3-preview-e2df9b4` instead of `1.2.3`.

Now you can [use these preview builds in your project](#using-preview-builds).

If you make more changes to a package, follow step 2 again, making sure to update the reference to the package in your project's `package.json` to use the newly published preview version.

#### Publishing preview builds as an independent contributor

If you've forked this repository, you can create preview builds based on a branch by following these steps:

1. First, since an NPM scope is used to host preview build releases, you'll need access to one. If you do not, you can either [create a new organization](https://www.npmjs.com/org/create) or [convert your existing username into an organization](https://www.npmjs.com/org/upgrade).

2. Once you've done this, open the `package.json` for each package that you want to publish and change the scope in the name from `@metamask` to `@<NPM_ORG>`, replacing `NPM_ORG` with your NPM organization.

3. Next, run the following command to create and publish the preview builds (again, replacing `NPM_ORG` as appropriate):

   ```
   yarn prepare-preview-builds "@<NPM_ORG>" "$(git rev-parse --short HEAD)" && yarn build && yarn publish-previews
   ```

   You should be able to see the published version of each package in the output. Note two things:

   - The name is scoped to the NPM organization you entered instead of `@metamask`.
   - The ID of the last commit in the branch is appended to the version, e.g. `1.2.3-preview-e2df9b4` instead of `1.2.3`.

Now you can [use these preview builds in your project](#using-preview-builds).

If you make more changes to a package, follow step 3 again, making sure to update the reference to the package in your project's `package.json` to use the newly published preview version.

#### Using preview builds

To use a preview build for a package within a project, you need to override the resolution logic for your package manager so that the "production" version of that package is replaced with the preview version. Here's how you do that:

1. Open `package.json` in the project and locate the dependency entry for the core package for which you want to use a preview build.
2. Locate the section responsible for resolution overrides (or create it if it doesn't exist). If you're using Yarn, this is `resolutions`; if you're using NPM or any other package manager, this is `overrides`.
3. Add a line to this section that mirrors the dependency entry on the left-hand side and points to the preview version on the right-hand side:

   ```
   "@metamask/<PACKAGE_NAME>@<PRODUCTION_VERSION_RANGE>": "npm:@<NPM_ORG>/<PACKAGE_NAME>@<PREVIEW_VERSION>"
   ```

   > **Example:**
   >
   > - If your project uses Yarn, `@metamask/controller-utils` is listed in dependencies at `^1.1.4`, and you want to use the preview version `1.2.3-preview-e2df9b4`, add the following to `resolutions`:
   >
   >   ```
   >   "@metamask/controller-utils@^1.1.4": "npm:@metamask-previews/controller-utils@1.2.3-preview-e2df9b4"
   >   ```

4. Run `yarn install`.

## Adding new packages

> If you're migrating an existing package to the monorepo, please see [the package migration documentation](./package-migration-process-guide.md).
> You may be able to make use of `create-package` when migrating your package, but there's a lot more to it.

Manually a new monorepo package can be a tedious, even frustrating process. To spare us from that
suffering, we have created a CLI that automates most of the job for us, creatively titled
[`create-package`](../scripts/create-package/). To create a new monorepo package, follow these steps:

1. Create a new package using `yarn create-package`.
   - Use the `--help` flag for usage information.
   - Once this is done, you can find a package with your chosen name in `/packages`.
2. Make sure your license is correct.
   - By default, `create-package` gives your package an MIT license.
   - If your desired license is _not_ MIT, then you must update your `LICENSE` file and the
     `license` field of `package.json`.
3. Add your dependencies.
   - Do this as normal using `yarn`.
   - Remember, if you are adding other monorepo packages as dependents, don't forget to add them
     to the `references` array in your package's `tsconfig.json` and `tsconfig.build.json`.

And that's it!

### Contributing to `create-package`

Along with this documentation, `create-package` is intended to be the source of truth for the
process of adding new packages to the monorepo. Consequently, to change that process, you will want
to change `create-package`.

The `create-package` directory contains a [template package](../scripts/create-package/package-template/). The CLI is not aware of the contents of the template, only that its files have
[placeholder values](../scripts/create-package/constants.ts). When a new package is created, the template files are read from disk, the
placeholder values are replaced with real ones, and the updated files are added to a new directory
in `/packages`. To modify the template package:

- If you need to add or modify any files or folders, just go ahead and make your changes in
  [`/scripts/create-package/package-template`](../scripts/create-package/package-template/).
  The CLI will read whatever's in that directory and write it to disk.
- If you need to add or modify any placeholders, make sure that your desired values are added to
  both the relevant file(s) and
  [`/scripts/create-package/constants.ts`](../scripts/create-package/constants.ts).
  Then, update the implementation of the CLI accordingly.
- As with placeholders, updating the monorepo files that the CLI interacts with begins by updating
  [`/scripts/create-package/constants.ts`](../scripts/create-package/constants.ts).

## Releasing

The [`create-release-branch`](https://github.com/MetaMask/create-release-branch) tool and [`action-publish-release`](https://github.com/MetaMask/action-publish-release) GitHub action are used to automate the release process.

1. **Initiate the release branch and specify packages to be released.**

   1. **Create the release branch.**

      Start by running `yarn create-release-branch`. This command creates a branch named `release/<new release version>` which will represent the new release.

   2. **Specify packages to release along with their versions.**

      At this point, you need to tell the tool which packages you want to include in the next release and which versions to assign to those packages. You do this by modifying a YAML file called a "release spec", which the tool has generated and opened it in your editor. Follow the instructions at the top of the file to proceed.

      To assist you, the tool has also updated all of the packages that have been changed since their previous releases so that their changelogs now reflect those new changes. This should help you to understand what will be released and how to bump the versions.

      Once you save and close the release spec, the tool will proceed.

2. **update all packages dependencies to their latest version**

   Run `yarn constraints --fix && yarn && yarn dedupe`.

3. **Review and update changelogs for relevant packages.**

   1. At this point, the versions of all packages you intend to release have been bumped and their changelogs list new changes. Now you need to go through each changelog and make sure that they follow existing standards:

      - Categorize entries appropriately following the ["Keep a Changelog"](https://keepachangelog.com/en/1.0.0/) guidelines.
      - Remove changelog entries that don't affect consumers of the package (e.g. lockfile changes or development environment changes). Exceptions may be made for changes that might be of interest despite not having an effect upon the published package (e.g. major test improvements, security improvements, improved documentation, etc.).
      - Reword changelog entries to explain changes in terms that users of the package will understand (e.g., avoid referencing internal variables/concepts).
      - Consolidate related changes into single entries where appropriate.

   2. Run `yarn changelog:validate` to ensure all changelogs are correctly formatted.

4. **Push and submit a pull request for the release branch so that it can be reviewed and tested.**

   Make sure the title of the pull request follows the pattern "Release \<new version\>".

   If changes are made to the base branch, the release branch will need to be updated with these changes and review/QA will need to restart again. As such, it's probably best to avoid merging other PRs into the base branch while review is underway.

5. **"Squash & Merge" the release.**

   This step triggers the [`publish-release` GitHub action](https://github.com/MetaMask/action-publish-release) workflow to tag the final release commit and publish the release on GitHub.

   Pay attention to the box you see when you press the green button and ensure that the final name of the commit follows the pattern "Release \<new version\>".

6. **Publish the release on NPM.**

   The `publish-release` GitHub Action workflow runs the `publish-npm` job, which publishes relevant packages to NPM. It requires approval from the [`npm-publishers`](https://github.com/orgs/MetaMask/teams/npm-publishers) team to complete. If you're not on the team, ask a member to approve it for you; otherwise, approve the job.

   Once the `publish-npm` job has finished, [check NPM](https://npms.io/search?q=scope%3Ametamask) to verify that all relevant packages has been published.

### Handling common errors

If an error occurs, re-edit the release spec and rerun `yarn create-release-branch`. Common errors include:

- **Invalid Version Specifier:**

  - Error: `* Line 14: "invalid_version" is not a valid version specifier...`
  - Resolution: Use "major", "minor", "patch", or a specific version number like "1.2.3".

- **Version Less than or Equal to Current:**

  - Error: `* Line 14: "1.2.3" is not a valid version specifier...`
  - Resolution: Specify a version greater than the current version of the package.

- **Releasing Packages with Breaking Changes:**

  - Error: `* The following dependents of package '@metamask/a'...`
  - Resolution: Include dependent packages in the release or use "intentionally-skip" if certain they are unaffected.

- **Dependencies/Peer Dependencies Missing:**
  - Error: `* The following packages, which are dependencies...`
  - Resolution: Include necessary dependencies or peer dependencies in the release or use "intentionally-skip" if certain they are unaffected.
