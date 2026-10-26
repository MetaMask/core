import { describe, expect, it } from 'vitest';

import { lowerDecorators } from './lower-decorators.ts';

type Transform = (code: string, id: string) => { code: string } | null;

describe('lowerDecorators', () => {
  const transform = lowerDecorators().transform as Transform;

  it('returns null for a TypeScript module without a decorator', () => {
    expect(transform('export class A {}', '/x/a.ts')).toBeNull();
  });

  it('returns null for a non TypeScript module', () => {
    expect(transform('@dec class A {}', '/x/a.js')).toBeNull();
  });

  it('lowers a decorator in a TypeScript module', () => {
    const result = transform(
      'function dec(t: unknown) { return t; }\n@dec\nexport class A {}',
      '/x/a.ts',
    );
    expect(result?.code).not.toContain('@dec');
    expect(result?.code).toMatch(/__(es)?[dD]ecorate/u);
  });

  it('ignores a query suffix on the module id', () => {
    const result = transform('@dec\nexport class A {}', '/x/a.ts?v=1');
    expect(result).not.toBeNull();
  });
});
