# Guidelines for packages

## Use clear filenames and paths for entrypoints

Library packages may have one or more entrypoints as defined in the `exports` field of `package.json`.

The name of the root entrypoint — the file loaded when the package is imported by its name, without specifying any subpaths — should be called `src/index.ts`.

The expected name of a non-root entrypoint depends on its nature:

- If that entrypoint represents a distinct submodule of the package whose code lives in its own subdirectory of `src/`, then the file should be called `index.ts` and be located in that subdirectory. The subdirectory should be named after the subpath (e.g. `./one` → `src/one/index.ts`).
- Otherwise, the file should be named after the subpath and be located directly in `src/` (e.g. `./node` → `src/node.ts`).

Subpaths may be nested, in which case the same rules apply to each segment (e.g. `./one/mocks` → `src/one/mocks/index.ts`).

Do not use wildcards when defining patterns for entrypoints (e.g. `"./utils/*": "./dist/utils/*.js"`). These expose every file in a directory to consumers, which has [the same drawbacks as wildcard exports](#name-all-exports-explicitly-instead-of-grouping-them-together).

### Examples

Given two packages:

- `@metamask/foo` has two entrypoints: the root and `./node`. All files that both entrypoints import are located directly in `src/`, but `./node` imports an extra file that the root doesn't.
- `@metamask/bar` has three entrypoints: the root, `./one`, and `./two`. The latter two represent distinct submodules within the package.

Then this is the expected layout of both packages:

```
packages/
  foo/
    src/
      index.ts                  # Imports one.ts, two.ts
      node.ts                   # Imports one.ts, two.ts, three.ts
      one.ts
      three.ts
      two.ts
    package.json
  bar/
    src/
      one/
        index.ts               # Imports other files within one/
      two/
        index.ts               # Imports other files within two/
      index.ts                 # Imports individual files within one/ and two/ (not their index.ts files)
    package.json
```

Here is what the `package.json` for `foo` should look like:

```json
{
  "name": "@metamask/foo",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./node": {
      "types": "./dist/node.d.ts",
      "default": "./dist/node.js"
    },
    "./package.json": "./package.json"
  }
}
```

And the `package.json` for `bar` should look like this:

```json
{
  "name": "@metamask/bar",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./one": {
      "types": "./dist/one/index.d.ts",
      "default": "./dist/one/index.js"
    },
    "./two": {
      "types": "./dist/two/index.d.ts",
      "default": "./dist/two/index.js"
    },
    "./package.json": "./package.json"
  }
}
```

## Do not use "barrel" files for non-entrypoints

No `index.ts` file should exist at any subdirectory within the package, except [those that act as entrypoints for subpath exports](#use-clear-filenames-and-paths-for-entrypoints)

Instead, move all exports to an entrypoint and [name all exports explicitly](#name-all-exports-explicitly-instead-of-grouping-them-together).

The examples below assume the following `package.json`:

```json
{
  "name": "@metamask/foo",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./package.json": "./package.json"
  }
}
```

🚫

```typescript
// packages/foo/src/module-one/index.ts

export { foo, bar, baz } from './first';
export { qux } from './second';

// packages/foo/src/module-two/index.ts

export { fizz, buzz } from './first';

// packages/foo/src/index.ts

export * as ModuleOne from './module-one';
export * as ModuleTwo from './module-two';
```

✅

```typescript
// packages/foo/src/index.ts

// Module One
export { foo, bar, baz } from './module-one/first';
export { qux } from './module-one/second';

// Module Two
export { fizz, buzz } from './module-two/first';
```

<details>
<summary>Read more</summary>

It is tempting to divide a large package into smaller modules and use an `index.ts` file (otherwise known as a "barrel" file) to re-export all symbols in one module to use in another. Usually this is combined with a namespace re-export in the root `index.ts` of the package.

However, re-exporting symbols in this manner is not advised for the following reasons:

- It makes it difficult to view the public surface area of a package at a glance, which is useful for security auditing purposes.
- It makes it difficult to notice new additions to the surface area. Any time a new export is added to one of these files, it will automatically become an export of the package, so it could be easily missed in a review (and fail to be added to the changelog).
- It makes it impossible to export a symbol from a file but not expose it publicly to consumers. This can be useful for testing purposes.
- It can slow down static analysis tools (TypeScript, linting tools, etc.) because it increases the number of paths it takes to reach a file. (You can read more about this here: https://www.atlassian.com/blog/how-we-build/faster-builds-when-removing-barrel-files)
</details>

## Name all exports explicitly instead of grouping them together

All exports in an [entrypoint](#use-clear-filenames-and-paths-for-entrypoints) should be named explicitly; symbols should not be re-exported from other files using wildcards.

🚫 **Re-exporting all named exports from a file**

```typescript
// index.ts
export * from './foo-controller';
export * from './foo-service';
```

✅ **Re-exporting each named export individually**

```typescript
// index.ts
export { FooController } from './foo-controller';
export type { FooControllerMessenger } from './foo-controller';
export { FooService } from './foo-service';
export type { AbstractFooService } from './foo-service';
```

🚫 **Grouping exports under a namespace automatically**

```typescript
// index.ts
export * as Constants from './constants';
export type * as Types from './types';
```

✅ **Grouping values under a namespace manually, and exporting types individually**

(Note that types cannot be grouped together at all. Export each type by name instead.)

```typescript
// index.ts

import { FOO, BAR } from './constants';

export const Constants = { FOO, BAR };
export type { FooType, BarType } from './types';
```

<details>
<summary>Read more</summary>

It is tempting to save time by re-exporting all symbols from a directory _en masse_ by using wildcard exports.

However, re-exporting symbols in this manner is not advised for the following reasons:

- It makes it difficult to view the public surface area of a package at a glance, which is useful for security auditing purposes.
- It makes it difficult to notice new additions to the surface area. Any time a new export is added to one of these files, it will automatically become an export of the package, so it could be easily missed in a review (and fail to be added to the changelog).
- It makes it impossible to export a symbol from a file but not expose it publicly to consumers. This can be useful for testing purposes.
</details>
