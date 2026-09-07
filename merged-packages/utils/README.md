<table><tr><td><p align="center"><b>⚠️ PLEASE READ ⚠️</b></p><p align="center">This package is currently being migrated to our <a href="https://github.com/MetaMask/core"><code>core</code></a> monorepo. Please do not make any commits to this repository while this migration is taking place, as they will not be transferred over. Also, please re-open PRs that are under active development in the core repo.</p></td></tr></table>

# MetaMask Utils

Various JavaScript/TypeScript utilities of wide relevance to the MetaMask codebase.

## Installation

`yarn add @metamask/utils`

or

`npm install @metamask/utils`

## API

The full API documentation for the latest published version of this library is [available here](https://metamask.github.io/utils/index.html).

## Contributing

### Setup

- Install [Node.js](https://nodejs.org) version 16
  - If you are using [nvm](https://github.com/creationix/nvm#installation) (recommended) running `nvm use` will automatically choose the right node version for you.
- Install [Yarn v3](https://yarnpkg.com/getting-started/install)
- Run `yarn install` to install dependencies and run any required post-install scripts

### Testing and Linting

Run `yarn test` to run the tests once. To run tests on file changes, run `yarn test:watch`.

Run `yarn lint` to run the linter, or run `yarn lint:fix` to run the linter and fix any automatically fixable issues.

### Documentation

The API documentation can be generated with the command `yarn docs`, which saves it in the `./docs` directory. Open the `./docs/index.html` file to browse the documentation.

### Release & Publishing

The project follows the same release process as the other libraries in the MetaMask organization. The GitHub Actions [`action-create-release-pr`](https://github.com/MetaMask/action-create-release-pr) and [`action-publish-release`](https://github.com/MetaMask/action-publish-release) are used to automate the release process; see those repositories for more information about how they work.

1. Choose a release version.
   - The release version should be chosen according to SemVer. Analyze the changes to see whether they include any breaking changes, new features, or deprecations, then choose the appropriate SemVer version. See [the SemVer specification](https://semver.org/) for more information.

2. If this release is backporting changes onto a previous release, then ensure there is a major version branch for that version (e.g. `1.x` for a `v1` backport release).
   - The major version branch should be set to the most recent release with that major version. For example, when backporting a `v1.0.2` release, you'd want to ensure there was a `1.x` branch that was set to the `v1.0.1` tag.

3. Trigger the [`workflow_dispatch`](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#workflow_dispatch) event [manually](https://docs.github.com/en/actions/managing-workflow-runs/manually-running-a-workflow) for the `Create Release Pull Request` action to create the release PR.
   - For a backport release, the base branch should be the major version branch that you ensured existed in step 2. For a normal release, the base branch should be the main branch for that repository (which should be the default value).
   - This should trigger the [`action-create-release-pr`](https://github.com/MetaMask/action-create-release-pr) workflow to create the release PR.

4. Update the changelog to move each change entry into the appropriate change category ([See here](https://keepachangelog.com/en/1.0.0/#types) for the full list of change categories, and the correct ordering), and edit them to be more easily understood by users of the package.
   - Generally any changes that don't affect consumers of the package (e.g. lockfile changes or development environment changes) are omitted. Exceptions may be made for changes that might be of interest despite not having an effect upon the published package (e.g. major test improvements, security improvements, improved documentation, etc.).
   - Try to explain each change in terms that users of the package would understand (e.g. avoid referencing internal variables/concepts).
   - Consolidate related changes into one change entry if it makes it easier to explain.
   - Run `yarn auto-changelog validate --rc` to check that the changelog is correctly formatted.

5. Review and QA the release.
   - If changes are made to the base branch, the release branch will need to be updated with these changes and review/QA will need to restart again. As such, it's probably best to avoid merging other PRs into the base branch while review is underway.

6. Squash & Merge the release.
   - This should trigger the [`action-publish-release`](https://github.com/MetaMask/action-publish-release) workflow to tag the final release commit and publish the release on GitHub.

7. Publish the release on npm.
   - Be very careful to use a clean local environment to publish the release, and follow exactly the same steps used during CI.
   - Use `npm publish --dry-run` to examine the release contents to ensure the correct files are included. Compare to previous releases if necessary (e.g. using `https://unpkg.com/browse/[package name]@[package version]/`).
   - Once you are confident the release contents are correct, publish the release using `npm publish`.

### Testing changes in other projects using preview builds

If you are working on a pull request and want to test changes in another project before you publish them, you can create a _preview build_ and then configure your project to use it.

#### Creating a preview build

1. Within your pull request, post a comment with the text `@metamaskbot publish-preview`. This starts the `publish-preview` GitHub action, which will create a preview build and publish it to NPM.
2. After a few minutes, the action should complete and you will see a new comment. Note two things:
   - The name is scoped to `@metamask-previews` instead of `@metamask`.
   - The ID of the last commit in the branch is appended to the version, e.g. `1.2.3-preview-e2df9b4` instead of `1.2.3`.

#### Using a preview build

To use a preview build within a project, you need to override the resolution logic for your package manager so that the "production" version of that package is replaced with the preview version. Here's how you do that:

1. Open `package.json` in the project and locate the entry for this package in `dependencies`.
2. Locate the section responsible for resolution overrides (or create it if it doesn't exist). If you're using Yarn, this is `resolutions`; if you're using NPM or any other package manager, this is `overrides`.
3. Add a line to this section that mirrors the dependency entry on the left-hand side and points to the preview version on the right-hand side. Note the exact format of the left-hand side will differ based on which version of Yarn or NPM you are using. For example:
   - For Yarn Modern, you will add something like this to `resolutions`:
     ```
     "@metamask/utils@^1.2.3": "npm:@metamask-previews/utils@1.2.3-preview-abcdefg"
     ```
   - For Yarn Classic, you will add something like this to `resolutions`:
     ```
     "@metamask/utils": "npm:@metamask-previews/utils@1.2.3-preview-abcdefg"
     ```
   - For NPM, you will add something like this to `overrides`:
     ```
     "@metamask/utils": "npm:@metamask-previews/utils@1.2.3-preview-abcdefg"
     ```
4. Run `yarn install`.

#### Updating a preview build

If you make more changes to your pull request and want to create a new preview build:

1. Post another `@metamaskbot` comment on the pull request and wait for the response.
2. Update the version of the preview build in your project's `package.json`. Make sure to re-run `yarn install`!
