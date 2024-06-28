import * as allExports from '.';

describe('Package exports', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "providerFromEngine",
        "providerFromMiddleware",
        "SafeEventEmitterProvider",
      ]
    `);
  });
});
