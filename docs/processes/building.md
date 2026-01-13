# Building packages

[`ts-bridge`](https://github.com/ts-bridge/ts-bridge) is used to build packages in both CommonJS- and ESM-compatible formats.

Built files show up in the `dist/` directory in each package. These are the files which will ultimately be published to NPM.

- Run `yarn build` to build all packages in the monorepo.
- Run `yarn workspace <workspaceName> run build` to build a single package.
