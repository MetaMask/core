import * as allExports from '../src';

describe('Package exports', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "WALLET_PREFIX",
        "CAVEAT_TYPES",
        "LOG_IGNORE_METHODS",
        "LOG_METHOD_TYPES",
        "LOG_LIMIT",
        "PermissionLogController",
      ]
    `);
  });
});
