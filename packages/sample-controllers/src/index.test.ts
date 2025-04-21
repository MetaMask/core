import * as allExports from '.';

describe('@metamask/sample-controllers', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "getDefaultSampleGasPricesControllerState",
        "SampleGasPricesController",
        "SamplePetnamesController",
        "SampleGasPricesService",
      ]
    `);
  });
});
