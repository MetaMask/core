import * as allExports from '.';

describe('Package exports', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports).sort()).toMatchInlineSnapshot(`
      [
        "InternalProvider",
        "SafeEventEmitterProvider",
        "providerFromMiddleware",
        "providerFromMiddlewareV2",
      ]
    `);
  });
});
