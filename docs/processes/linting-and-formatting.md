# Linting and formatting code

[ESLint](https://eslint.org) v9 (via [MetaMask's shared ESLint configurations](https://github.com/MetaMask/eslint-config)) is used to check for code quality issues, and [Prettier](https://prettier.io/docs/en/) is used to format files.

If you need to customize the behavior of ESLint, see `eslint.config.mjs` in the root.

- Run `yarn lint` to lint all files and show possible violations across the monorepo.
- Run `yarn lint:fix` to fix any automatically fixable violations.
