# Guidelines for Packages

## Keep the scope of the package as concise as possible

Be mindful of the size of the controller package, and don't export anything you don't anticipate consumers won't need to use. This not only makes your package easier to use, but it also reduces the risk of accidentally introducing breaking changes in the future if code is shuffled around or deleted.

### Corollary: Be explicit about exports

Some controller packages have an `index.ts` which exports everything from all of the file. This is inadvisable as it makes it difficult to understand at a glance what the exports of that package are.

🚫

```typescript
export * from './foo';
export * from './bar';
```

✅

```typescript
export { A, B, C } from './foo';
export { d, e } from './bar';
```

💡 Add a test for this so you catch accidental additions or removals from exports:

```typescript
// index.test.ts

import * as allExports from '.';

describe('@metamask/foo-controller', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "A",
        "B",
        "C",
        "d",
        "e",
      ]
    `);
  });
});
```
