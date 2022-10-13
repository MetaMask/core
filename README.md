# Controllers

A collection of platform-agnostic modules for creating secure data models for cryptocurrency wallets.

## Modules

This is a monorepo that houses the following packages. Please refer to the READMEs for these packages for installation and usage instructions:

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

## Contributing

### Setup

- Install [Node.js](https://nodejs.org) version 14.
  - If you are using [nvm](https://github.com/creationix/nvm#installation) (recommended) running `nvm use` will automatically choose the right node version for you.
- Install [Yarn v3](https://yarnpkg.com/getting-started/install).
- Run `yarn install` to install dependencies and run any required post-install scripts.
- Run `yarn simple-git-hooks` to add a [Git hook](https://github.com/toplenboren/simple-git-hooks#what-is-a-git-hook) which will ensure that all files pass the linter before you push a branch.

### Testing and Linting

Run `yarn test` to run tests for all packages. Run `yarn workspace <package-name> run test` to run tests for a single package.

Run `yarn lint` to lint all files and show possible violations, or run `yarn lint:fix` to fix any automatically fixable violations.

### Release & Publishing

When you are ready to release one or more packages within this monorepo, use the `create-release-branch` tool. This will automate the task of bumping versions and updating changelogs across the monorepo, then create a new branch for you to share as a pull request. You can learn more about how to use this tool by reading through its [documentation][create-release-branch-docs].

This monorepo is following an **independent** versioning strategy: each package has its own version and may be changed without needing to change any other package's version.

[create-release-branch-docs]: https://github.com/MetaMask/create-release-branch/blob/main/docs/usage-monorepo-independent.md
