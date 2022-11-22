# How the monorepo works

## Structure

All monorepos need to follow some sort of organizational system. If the goal of a monorepo is to house the code for multiple packages, then the code for each package needs to live somewhere that makes it easy to developers to manage the files inside it and publish that package later.

In our case, we have a directory in the root called `packages/`, and each directory in this directory represents a package:

```
packages/
  package-one/
  package-two/
  package-three/
  ...
```

Although there may be minor differences from one package to another, all packages follow a common structure:

```
some-package/
  src/
  CHANGELOG.md
  jest.config.js
  LICENSE
  package.json
  README.md
  tsconfig.build.json
  tsconfig.json
  typedoc.json
```

For a given configuration file, there are even a common set of properties. For instance, every `package.json` has a `name`, `version`, `description`, etc.

## Supporting technologies

### Yarn v3

You probably know that Yarn is a package manager which keeps track of dependencies and makes sure that they are installed. However, did you also know that it is instrumental in orchestrating changes across the monorepo?

Say we want to run tests across all of the packages in the monorepo. We could certainly do this by writing a script which would gather the names of the directories within `packages/` and then run the test command for each directory. But what if we want to run tests in parallel? We'd have to figure out how to write that code.

Additionally, if you take another look at the [dependency graph in the README](../README.md#modules), you'll realize that some of our packages depend on another package. What if we want to run some other operation which stores data as it does along, and in order to do this right, we need to walk through our packages in dependency order — first packages that have no dependencies, then the packages that depend on those packages, etc.? In this case, we need something that understands how each package is connected to each other.

We solve both of these problems by using Yarn's [workspaces](https://yarnpkg.com/features/workspaces) feature.

As it has first-class support for monorepos, Yarn knows how to find our packages. It does this because we've told it so: in the `package.json` located in the root, we've included a property called `workspaces`, which expands to all of the directories within `packages/`. Once it has this information, it is able to build a dependency graph, a code version of the picture mentioned above.

> **Note**
> In Yarn's parlance, the existence of `workspaces` defines our project as a _worktree_ that holds a set of _workspaces_, and the existence of `package.json` means that our project is also a workspace itself. (It's a workspace of workspaces, hence, a worktree.) This terminology can get a bit confusing, so throughout this document and elsewhere, we call the packages located in `packages/` _workspace packages_, and we call the package located at the root level, the one representing the whole project, the _root package_. Just keep in mind that from a tooling perspective, the project is a workspace too.

When it comes to working with workspace packages, Yarn provides two commands which we use heavily:

- [`yarn workspaces foreach`](https://yarnpkg.com/cli/workspaces/foreach): Runs a package script or command for all (or a subset of) workspace packages. There are options for running things in parallel or walking through the set of workspace packages in a specific order.
- [`yarn workspaces list`](https://yarnpkg.com/cli/workspaces/list): Gets a list of all (or a subset of) workspace packages. Useful for scripting.

### TypeScript

All of the code that we ship in this repo is written in TypeScript. This allows us to write more bulletproof code and it helps us keep track of the APIs that we expose more easily. We love it.

That said, there are a few obstacles that we've had to overcome for the monorepo which shape how we've wired everything up.

#### Building all the things

In order for our code to be used in Node and in the browser, we can't ship TypeScript directly. We can ship TypeScript _definition_ files, but we must also ship JavaScript files. That means that we need some sort of build step to create these files before we release a package.

The TypeScript compiler (`tsc`) can accomplish this, but compiling TypeScript in the context of a monorepo presents some new challenges. As mentioned above, some of our packages depend on other packages. So if we want to build a package that uses another package internally, that other package needs to be built first. In other words, we have the same problem as Yarn: we need a dependency graph of our project to do this right.

Fortunately, TypeScript can construct such a graph just like Yarn. And, similarly, we need to instruct TypeScript how our packages are connected. We do this via TypeScript's [project references](https://www.typescriptlang.org/docs/handbook/project-references.html) feature.

- If you look at `tsconfig.json` in the root, you will notice two things: this file has a `references` field, and it also has a empty `files` array. TypeScript calls this type of file a ["solution" file](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#support-for-solution-style-tsconfigjson-files)). It doesn't compile any files directly, but merely acts a pointer to other TypeScript projects that need to be compiled, which, in our case, match the same list of packages that we've told Yarn about.
- If you go one level deeper and skim over the `tsconfig.json` file for a few of the packages, you will see that typically the file extends `tsconfig.packages.json` in the root, meaning all packages share the same core TypeScript settings. In addition, most of the package-level TypeScript config files even have `references` fields themselves, which correspond to the dependencies for those packages.

By following all of the references from the root project, TypeScript is able to build the dependency graph that we desire. It will then use this to build all of our packages in the correct order. You can see this by running `yarn build`, which runs `tsc --build` behind the scenes.

#### Linking dependencies

If some of our packages depend on other packages, it stands to reason that we would need to import those packages somewhere in the code. For instance, if we looked at a controller package, it would have an import like this:

```typescript
import { ... } from '@metamask/base-controller';
```

In the real world, this code lives on NPM, and so `@metamask/base-controller` is a reference to the NPM package with the same name. But in development, we don't want to use the NPM versions of our packages, because then we'd be forced to create new versions of our packages constantly and keep them in sync with each other. Instead, we want to be able to use the TypeScript code in our packages directly.

In theory, we ought to be able to accomplish this without any additional configuration. When we want to codify a dependency for one package on another in `package.json`, instead of a version, we use [a special specifier, `workspace:~`](https://yarnpkg.com/features/protocols#workspace). This will get replaced with the appropriate version (plus the leading `~`) when we build the package, but in development, this instructs Yarn to place a symlink in `node_modules` that points to the package. For instance, `@metamask/address-book-controller` has the following:

```
{
  ...,
  "dependencies": {
    ...
    "@metamask/base-controller": "workspace:~"
    ...
  },
  ...
}
```

and if you look in `node_modules`, you will see that `node_modules/@metamask/base-controller` is a symlink to `packages/base-controller`.

Because this symlink exists, we can import this package anywhere in TypeScript as though it were published. There's a problem here, though: TypeScript doesn't know it's not published, because when it resolves the import, it attempts to look for the files that will end up in the published version. This happens because it's using `types` from `package.json`, and that field points to a file which is only available once the package is built. Of course, we could solve this by running `yarn build` every time we change a package, but that would be a pain.

A more efficient route would be for TypeScript to make use of the original source files which live in each package's `src/` directory. To fix this, we have to add a rule to the TypeScript compiler that effectively replaces all imports that look like `@metamask/<name>` with their appropriate path within the project. Hence, if you look in `tsconfig.packages.json` — which all packages use — you will see a `paths` field which does just this.

#### Testing

There's one other thing to talk about with regard to TypeScript config files: the fact that there are two versions, `tsconfig.json` and `tsconfig.build.json`. What gives? When we build files for a release, we want to make sure that test files do not appear in the final package, and so we exclude them from TypeScript's purview. But when we are developing locally, we've found that this exclusion will cause extra warnings to appear in-editor if we are extending types from third-party libraries using [type augmentations](https://dev.to/wojciechmatuszewski/extending-various-typescript-type-declarations-36km). To solve this problem, we use one config file for development and another file for building. This dichotomy is reflected from the root level to the package level.

### Jest

Each package has its own unit tests that live along their implementation files. We run Jest for each package individually, so this means that each package has its own `jest.config.js`, with common settings extracted to `jest.config.packages.js` (located in the root) and overrides specified per-package as needed.

Ordinarily, this setup would be simple enough, but there is a wrinkle that emerges when we combine Jest and TypeScript, and it results in a similar problem as TypeScript with regard to package references. To understand why, we need to know a bit more about Jest.

Jest is very sophisticated, and there are a lot of steps that take place happen under the hood when you run your tests, but two are worth mentioning:

- Jest [runs each file it sees through a transformer](https://jestjs.io/docs/code-transformation). By default, it uses Babel, so that if you want to use an EcmaScript feature that isn't support in your version of Node, you can do so.
- Jest will [statically analyze your code in order to derive dependencies between files](https://youtu.be/3YDiloj8_d0?t=549). During this preprocessing step, when Jest sees an import, it will attempt to follow that import using specific resolution logic. By default it reuses the [same logic that Node uses](https://nodejs.org/api/modules.html).

In our case, we need Jest to work hand in hand with TypeScript. We use the [`ts-jest`](https://github.com/kulshekhar/ts-jest) plugin to accomplish this. This plugin changes the transformation step, so that when Jest sees a TypeScript file, it uses the TypeScript engine to convert it to JavaScript. It's important to realize, however, that `ts-jest` doesn't change the resolution logic: [Jest still statically analyzes the resulting JavaScript file for imports](https://github.com/kulshekhar/ts-jest/issues/414#issuecomment-369909761).

And therein lies the wrinkle. When Jest sees an import like:

```typescript
import { ... } from '@metamask/base-controller';
```

it ends up in the same boat that TypeScript does: it tries to look for the `dist/` files, and if it can't find any, it will bail. Unfortunately, the `paths` option that we configure TypeScript with doesn't take effect, because it's too late.

To address this issue, then, we need another tactic. Fortunately, Jest offers us a lifeline here via the `moduleNameMapper` option, which you will see employed in `jest.config.packages.js`. We do have to account for `@metamask/*` packages that live outside of this monorepo, but other than that, the configuration is very similar to the one in `tsconfig.json`.

### ESLint/Prettier

We have extensive linting rules for all of our repos, and the monorepo is no exception. Unlike Yarn and TypeScript there is nothing complicated going on here: we can define a global set of rules in `.eslintrc.js`, just like a polyrepo project, and lint and/or format all of our TypeScript files in one go. The same goes for formatting code via Prettier (which we use for Markdown and JSON files).

### TypeDoc

We try to add inline documentation for our code in the form of JSDoc blocks as much as possible. This is _immensely_ helpful when writing code, because if we are working with a type, interface, function, class, method, or even a variable that we're not quite familiar with, we can hover over it to learn more.

We use [TypeDoc](https://github.com/TypeStrong/typedoc) to scan for these JSDoc blocks and generate HTML documentation. The `typedoc` command is run per package, and the generated files end up in `docs/`.
