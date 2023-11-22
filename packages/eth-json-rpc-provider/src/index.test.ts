import * as allExports from '.';

describe('Package exports', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "SafeEventEmitterProvider",
        "providerFromEngine",
        "providerFromMiddleware",
      ]
    `);
  });
});
