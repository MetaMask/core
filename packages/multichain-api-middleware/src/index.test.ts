import { describe, expect, it } from 'vitest';

import * as allExports from './index.js';

describe('@metamask/multichain-api-middleware', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "methodHandlers",
        "multichainMethodCallValidatorMiddleware",
        "MultichainMiddlewareManager",
        "MultichainSubscriptionManager",
        "MultichainApiNotifications",
      ]
    `);
  });
});
