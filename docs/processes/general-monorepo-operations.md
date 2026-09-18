# Performing operations across the monorepo

This repository relies on Yarn's [workspaces feature](https://yarnpkg.com/features/workspaces) to provide a way to work with packages individually and collectively. Refer to the documentation for the following Yarn commands for usage instructions:

- [`yarn workspace`](https://yarnpkg.com/cli/workspace)
- [`yarn workspaces foreach`](https://yarnpkg.com/cli/workspaces/foreach)

> **Note**
>
> - `workspaceName` in the Yarn documentation is the `name` field within a package's `package.json`, e.g., `@metamask/address-book-controller`, not the directory where it is located, e.g., `packages/address-book-controller`.
> - `commandName` in the Yarn documentation is any sub-command that the `yarn` executable would usually take. Pay special attention to the difference between `run` vs `exec`. If you want to run a package script, you would use `run`, e.g., `yarn workspace @metamask/address-book-controller run changelog:validate`; but if you want to run _any_ shell command, you'd use `exec`, e.g. `yarn workspace @metamask/address-book-controller exec cat package.json | jq '.version'`.
