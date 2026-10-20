import { describe, expect, it } from 'vitest';

import * as allExports from './index.js';

describe('index', () => {
  it('includes the expected exports', () => {
    expect(Object.keys(allExports).sort()).toMatchInlineSnapshot(`
      [
        "ensureError",
        "getErrorMessage",
        "isErrorWithCode",
        "isErrorWithMessage",
        "isErrorWithStack",
        "wrapError",
      ]
    `);
  });
});
