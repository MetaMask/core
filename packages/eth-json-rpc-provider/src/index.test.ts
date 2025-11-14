import * as allExports from '.';

describe('Package exports', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports).sort()).toMatchInlineSnapshot(`
      Array [
        "InternalProvider",
        "SafeEventEmitterProvider",
        "providerFromMiddleware",
        "providerFromMiddlewareV2",
      ]
    `);
  });
});
