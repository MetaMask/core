import * as allExports from '.';

describe('token-prices-service', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "codefiTokenPricesServiceV2",
      ]
    `);
  });
});
