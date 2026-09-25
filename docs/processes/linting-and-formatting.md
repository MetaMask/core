# Linting and formatting code

[Oxlint](https://oxc.rs/docs/guide/usage/linter) v1 (via [MetaMask's shared Oxlint configurations](https://github.com/MetaMask/oxlint-config)) is used to check for code quality issues, and [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) is used to format files.

If you need to customize the behavior of Oxlint, see `oxlint.config.ts` in the root.

- Run `yarn lint` to lint all files and show possible violations across the monorepo.
- Run `yarn changelog:validate` to check for formatting issues in changelogs.
- Run `yarn lint:fix` to fix any automatically fixable violations.
