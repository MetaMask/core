import * as allExports from '.';

describe('@metamask/sample-controllers/sample-gas-prices-service', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "SampleGasPricesService",
      ]
    `);
  });
});
