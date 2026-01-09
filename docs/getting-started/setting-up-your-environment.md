# Setting up your development environment

1. Install the current LTS version of [Node](https://nodejs.org).
   - If you are using [NVM](https://github.com/creationix/nvm#installation) (recommended), running `nvm install` will install the latest version, and running `nvm use` will automatically choose the right Node version for you.
2. Run `corepack enable` to install [Yarn](https://yarnpkg.com) via [Corepack](https://github.com/nodejs/corepack?tab=readme-ov-file#how-to-install).
   - If you have Yarn installed globally via Homebrew or NPM, you'll need to uninstall it before running this command.
3. Run `yarn install` to install dependencies and run any required post-install scripts.
4. Run `yarn simple-git-hooks` to add a [Git hook](https://github.com/toplenboren/simple-git-hooks#what-is-a-git-hook) to your local development environment which will ensure that all files pass linting before you push a branch.
