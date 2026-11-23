# Building packages

Built files show up in the `dist/` directory in each package. These are the files which will ultimately be published to NPM.

For each package, `dist/` holds code that will be published to NPM. You should always ensure that test files, secrets, or other code that is not intended to be used by consumers are excluded from this directory.

- Run `yarn build` to build all packages in the monorepo.
- Run `yarn workspace <workspaceName> run build` to build a single package.
