import * as allExports from '.';

describe('@metamask/rate-limit-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "RateLimitController",
      ]
    `);
  });
});
