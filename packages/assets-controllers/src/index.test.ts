import * as allExports from '.';

describe('@metamask/assets-controllers', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "AccountTrackerController",
        "SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID",
        "MISSING_PROVIDER_ERROR",
        "AssetsContractController",
        "CurrencyRateController",
        "getDefaultNftControllerState",
        "NftController",
        "NftDetectionController",
        "TokenBalancesController",
        "TokenDetectionController",
        "TokenListController",
        "TokenRatesController",
        "TokensController",
        "isTokenDetectionSupportedForNetwork",
        "formatIconUrlWithProxy",
        "getFormattedIpfsUrl",
        "fetchTokenContractExchangeRates",
        "CodefiTokenPricesServiceV2",
        "SUPPORTED_CHAIN_IDS",
        "RatesController",
        "Cryptocurrency",
      ]
    `);
  });
});
