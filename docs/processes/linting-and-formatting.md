# Linting and formatting code

[Oxlint](https://oxc.rs/docs/guide/usage/linter) v1 (via [MetaMask's shared Oxlint configurations](https://github.com/MetaMask/oxlint-config)) is used to check for code quality issues, and [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) is used to format files.

If you need to customize the behavior of Oxlint, see `oxlint.config.ts` in the root.

- Run `yarn lint:eslint` to run ESLint and show possible violations across the monorepo.
  - Note that this runs `yarn build:only-clean` first, which deletes all `packages/*/dist` files. Run `yarn build` again if you need the built artifacts.
- Run `yarn lint:misc` to reformat all files across the repo.
- Run `yarn changelog:validate` to check for formatting issues in changelogs.
- Run `yarn lint` to lint all files and show possible problems to fix.
  - Due to ESLint, this takes a long time, so prefer the commands above.
  - See note on `yarn lint:eslint` below.
- Run `yarn lint:fix` to fix any automatically fixable lint problems.

> [!TIP]
> Most `yarn lint:*` scripts merely audit the repo and report on errors without changing any files. The only exception is `lint:misc`, which is reversed (`lint:misc:check` checks, `lint:misc` formats).
