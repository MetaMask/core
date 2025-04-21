# Guidelines for Packages

## List exports explicitly

Every package in this monorepo should have an `index.ts` file in the `src/` directory. Any symbols that this file exports will be usable by consumers.

It is tempting to save time by re-exporting all symbols from one or many files by using the "wildcard" or ["barrel"](https://basarat.gitbook.io/typescript/main-1/barrel) export syntax:

🚫

```typescript
export * from './foo-controller';
export * from './foo-service';
```

However, using this syntax is not advised for the following reasons:

- Barrel exports make it difficult to understand the public surface area of a package at a glance. This is nice for general development, but is especially important for debugging when sorting through previously published versions of the package on a site such as `npmfs.com`.
- Any time a new export is added to one of these files, it will automatically become an export of the package. That may sound like a benefit, but this makes it very easy to increase the surface area of the package without knowing it.
- Sometimes it is useful to export a symbol from a file for testing purposes but not expose it publicly to consumers. With barrel exports, however, this is impossible.

Instead of using barrel exports, name every export explicitly:

✅

```typescript
export { FooController } from './foo-controller';
export type { FooControllerMessenger } from './foo-controller';
export { FooService } from './foo-service';
export { FooService } from './foo-service';
export type { AbstractFooService } from './foo-service';
```
