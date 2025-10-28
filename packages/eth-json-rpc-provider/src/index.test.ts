import * as allExports from '.';

describe('Package exports', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports).sort()).toMatchInlineSnapshot(`
      Array [
        "InternalProvider",
        "SafeEventEmitterProvider",
        "providerFromEngine",
        "providerFromMiddleware",
        "providerFromMiddlewareV2",
      ]
    `);
  });
});
