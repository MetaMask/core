# Building packages

All of the public packages in this repo feature a `build` script which uses the [TypeScript 7](https://www.typescriptlang.org/) compiler to generate production code.

For each package, `dist/` holds code that will be published to NPM. You should always ensure that test files, secrets, or other code that is not intended to be used by consumers are excluded from this directory.

- Run `yarn build` to build all packages in the monorepo.
- Run `yarn workspace <workspaceName> run build` to build a single package.
- Run `yarn workspace <workspaceName> run build:all` to build the dependencies of a package, then the package itself.
