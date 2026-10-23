import { describe, expect, it } from 'vitest';

import * as allExports from '../src/index.js';

describe('Package exports', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "PermissionLogController",
      ]
    `);
  });
});
