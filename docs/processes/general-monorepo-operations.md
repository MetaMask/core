# Performing operations across the monorepo

This repository relies on Yarn's [workspaces feature](https://yarnpkg.com/features/workspaces) to provide a way to work with packages individually and collectively. Refer to the documentation for the following Yarn commands for usage instructions:

- [`yarn workspace`](https://yarnpkg.com/cli/workspace)
- [`yarn workspaces foreach`](https://yarnpkg.com/cli/workspaces/foreach)

For example:

- Run `yarn workspace <package-name> run <script>` to run a package script within a package.
- Run `yarn workspace <package-name> exec <command>` to run an executable within a package.
- Run `yarn workspace <package-name> add <dependency>` to add a dependency to a package.
- Run `yarn workspace <package-name> add -D <dependency>` to add a development dependency to a package.
- Run `yarn workspaces foreach --all run <script>` to run a package script across all packages.
- Run `yarn workspaces foreach --all exec <command>` to run an executable across all packages.
- Run `yarn workspaces foreach --all add <dependency>` to add a dependency to all packages.
- Run `yarn workspaces foreach --all add -D <dependency>` to add a development dependency to all packages.
- Run `yarn run <script>` to run a package script defined in the root `package.json`.
- Run `yarn exec <command>` to run an executable from the root of the project.
- Run `yarn add <dependency>` to add a dependency to the root `package.json`.
- Run `yarn add -D <dependency>` to add a dependency to the root `package.json`.
- Run `yarn up -R <dependency>` to upgrade a dependency across the monorepo.

> **Note**
>
> - `workspaceName` in the Yarn documentation is the `name` field within a package's `package.json`, e.g., `@metamask/address-book-controller`, not the directory where it is located, e.g., `packages/address-book-controller`.
> - `commandName` in the Yarn documentation is any sub-command that the `yarn` executable would usually take. Pay special attention to the difference between `run` vs `exec`. If you want to run a package script, you would use `run`, e.g., `yarn workspace @metamask/address-book-controller run changelog:validate`; but if you want to run _any_ shell command, you'd use `exec`, e.g. `yarn workspace @metamask/address-book-controller exec cat package.json | jq '.version'`.
