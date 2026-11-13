import { describe, expect, it } from 'vitest';

import * as allExports from './index.js';

describe('Package exports', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports).sort()).toMatchInlineSnapshot(`
      [
        "InternalProvider",
        "MockInternalProvider",
        "SafeEventEmitterProvider",
        "providerFromMiddleware",
        "providerFromMiddlewareV2",
      ]
    `);
  });
});
