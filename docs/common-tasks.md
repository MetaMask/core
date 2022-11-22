# Common monorepo tasks

When working with the monorepo, you will always be concerned with one of two needs:

- How do I do something for only one package?
- How do I do the same thing across all packages?

If you've read the ["How"](./how.md) section you know that we can use Yarn for both of these, because it treats the monorepo as a workspace of workspaces.

## Doing something for only one package

Use `yarn workspace <package> <rest...>`.

That `package` argument is important: it's the name of the package you want to target, not the directory where the package is located.

As for the `rest`, it depends on what you want to do:

- If you want to run a package script (a command configured under the package's `scripts` field) or an executable (a command that a dependency provides), use `run` followed by the name of the script and the arguments.
- If you want to run an arbitrary command, use `exec` followed by the name of the command and the arguments.

### Examples

We'll assume you're working with the package `@metamask/address-book-controller`:

If you want to use the package script `test` to run all tests:

```
yarn workspace @metamask/address-book-controller run test
```

If you want to use the `jest` executable to run Jest directly instead:

```
yarn workspace @metamask/address-book-controller run jest
```

If you want to read `package.json` and run it through `jq` to grab the current version:

```
yarn workspace @metamask/address-book-controller exec cat package.json | jq '.version'
```

## Doing the same thing across all packages

Use `yarn workspaces foreach <rest...>` (notice the `s`).

As with `yarn workspace`, it depends on what you want to do:

- If you want to run a package script, use `run` followed by the name of the script and the arguments.
- If you want to run an arbitrary command, use `exec` followed by the name of the command and the arguments.

This command takes a bunch of options, but these are the ones we've found useful:

- `--verbose` is practically necessary, because without it, you won't know which part of the output came from which package.
- `--parallel` will run the command across a set pool of packages at the same time. This can be handy for speeding up your run.
- `--topological` / `--topological-dev` is neat because it will sort packages in dependency order. This means that the command will run first for packages that do not depend on any other packages, then it will run the command for all of the packages that depend on those packages, etc. (The `-dev` variant includes `devDependencies` when determining what a package's dependencies are, otherwise they are ignored.)

### Examples

If you want to use the package script `test` to run all tests across all packages (note: the `yarn test` command does this already):

```
yarn workspaces foreach --verbose test
```

If you want to use the `jest` executable to run Jest directly for all packages:

```
yarn workspaces foreach --verbose run jest
```

If you want to read `package.json` and run it through `jq` to grab the current version for all packages in parallel (note the double quotes):

```
yarn workspaces foreach --verbose --parallel exec "cat package.json | jq '.version'"
```
