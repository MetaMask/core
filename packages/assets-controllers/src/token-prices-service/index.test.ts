import * as allExports from '.';

describe('token-prices-service', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "CodefiTokenPricesServiceV2",
        "SUPPORTED_CHAIN_IDS",
      ]
    `);
  });
});
