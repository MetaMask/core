import * as allExports from './index.js';

describe('token-prices-service', () => {
  it('has expected exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      [
        "CodefiTokenPricesServiceV2",
        "SUPPORTED_CHAIN_IDS",
        "getNativeTokenAddress",
        "fetchSupportedNetworks",
        "getSupportedNetworks",
        "resetSupportedNetworksCache",
        "SPOT_PRICES_SUPPORT_INFO",
        "getAssetId",
      ]
    `);
  });
});
