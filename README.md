# Controllers

A collection of platform-agnostic modules for creating secure data models for cryptocurrency wallets.

## Modules

This repo houses the following packages, which you can examine for installation and usage instructions:

- [`@metamask/address-book-controller`](packages/address-book-controller)
- [`@metamask/announcement-controller`](packages/announcement-controller)
- [`@metamask/approval-controller`](packages/approval-controller)
- [`@metamask/assets-controller`](packages/assets-controller)
- [`@metamask/base-controller`](packages/base-controller)
- [`@metamask/composable-controller`](packages/composable-controller)
- [`@metamask/controller-utils`](packages/controller-utils)
- [`@metamask/ens-controller`](packages/ens-controller)
- [`@metamask/gas-fee-controller`](packages/gas-fee-controller)
- [`@metamask/keyring-controller`](packages/keyring-controller)
- [`@metamask/message-manager`](packages/message-manager)
- [`@metamask/network-controller`](packages/network-controller)
- [`@metamask/notification-controller`](packages/notification-controller)
- [`@metamask/permission-controller`](packages/permission-controller)
- [`@metamask/phishing-controller`](packages/phishing-controller)
- [`@metamask/preferences-controller`](packages/preferences-controller)
- [`@metamask/rate-limit-controller`](packages/rate-limit-controller)
- [`@metamask/subject-metadata-controller`](packages/subject-metadata-controller)
- [`@metamask/transaction-controller`](packages/transaction-controller)

Or, in graph form:

![Dependency graph](assets/dependency-graph.png)

> **Note**
> To regenerate this graph, run `yarn generate-dependency-graph`.

## Architecture

This is a monorepo that houses multiple packages published under the `@metamask` namespace on NPM. Here are some topics you may find useful when developing:

- [What is a controller and how are they used?](docs/what.md)
- [Why we're using a monorepo](docs/why.md)
- [How the monorepo works](docs/how.md)
- [Common tasks you may need to perform when working on a package](docs/common-tasks.md)
- [How to test in-progress changes to a package within a project](docs/preview-builds.md)

## Contributing

### Setup

- Install [Node.js](https://nodejs.org) version 14.
  - If you are using [nvm](https://github.com/creationix/nvm#installation) (recommended) running `nvm use` will automatically choose the right node version for you.
- Install [Yarn v3](https://yarnpkg.com/getting-started/install).
- Run `yarn install` to install dependencies and run any required post-install scripts.
- Run `yarn simple-git-hooks` to add a [Git hook](https://github.com/toplenboren/simple-git-hooks#what-is-a-git-hook) to your local development environment which will ensure that all files pass the linter before you push a branch.

### Testing and Linting

Run `yarn test` to run tests for all packages. Run `yarn workspace <package-name> run test` to run tests for a single package (where `<package-name>` is the `name` field in its `package.json`, e.g. `@metamask/announcement-controller` rather than its location within the monorepo `packages/announcement-controller`).

Run `yarn lint` to lint all files and show possible violations, or run `yarn lint:fix` to fix any automatically fixable violations.

### Release & Publishing

This project follows a process which is unique to this repo. The [`create-release-branch`](https://github.com/MetaMask/create-release-branch) tool and [`action-publish-release`](https://github.com/MetaMask/action-publish-release) GitHub action are used to automate the release process; see those repositories for more information about how they work.

1. To begin the release process, run `create-release-branch`, specifying the packages you want to release. This tool will bump versions and update changelogs across the monorepo automatically, then create a new branch for you.

2. Once you have a new release branch, review the set of package changelogs that the tool has updated. For each changelog, update it to move each change entry into the appropriate change category ([see here](https://keepachangelog.com/en/1.0.0/#types) for the full list of change categories and the correct ordering), and edit them to be more easily understood by users of the package.

   - Generally any changes that don't affect consumers of the package (e.g. lockfile changes or development environment changes) are omitted. Exceptions may be made for changes that might be of interest despite not having an effect upon the published package (e.g. major test improvements, security improvements, improved documentation, etc.).
   - Try to explain each change in terms that users of the package would understand (e.g. avoid referencing internal variables/concepts).
   - Consolidate related changes into one change entry if it makes it easier to explain.
   - Run `yarn auto-changelog validate --rc` to check that the changelog is correctly formatted.

3. Submit a pull request for the release branch, so that it can be reviewed and tested.

   - If changes are made to the base branch, the release branch will need to be updated with these changes and review/QA will need to restart again. As such, it's probably best to avoid merging other PRs into the base branch while review is underway.

4. Squash & Merge the release.

   - This should trigger the [`action-publish-release`](https://github.com/MetaMask/action-publish-release) workflow to tag the final release commit and publish the release on GitHub.

5. Publish the release on npm.

   - Wait for the `publish-release` GitHub Action workflow to finish. This should trigger a second job (`publish-npm`), which will wait for a run approval by the [`npm publishers`](https://github.com/orgs/MetaMask/teams/npm-publishers) team.
   - Approve the `publish-npm` job (or ask somebody on the npm publishers team to approve it for you).
   - Once the `publish-npm` job has finished, check npm to verify that it has been published.
