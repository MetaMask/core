import * as allExports from '.';

describe('@metamask/gas-fee-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "LEGACY_GAS_PRICES_API_URL",
        "GAS_ESTIMATE_TYPES",
        "GasFeeController",
        "unknownString",
        "FeeMarketEstimateType",
        "LegacyEstimateType",
        "EthGasPriceEstimateType",
        "NoEstimateType",
        "GasEstimateType",
        "EstimatedGasFeeTimeBounds",
        "EthGasPriceEstimate",
        "LegacyGasPriceEstimate",
        "Eip1559GasFee",
        "GasFeeEstimates",
        "GasFeeStateEthGasPrice",
        "GasFeeStateFeeMarket",
        "GasFeeStateLegacy",
        "GasFeeStateNoEstimates",
        "FetchGasFeeEstimateOptions",
        "SingleChainGasFeeState",
        "GasFeeEstimatesByChainId",
        "GasFeeState",
        "GasFeeStateChange",
        "GetGasFeeState"
      ]
    `);
  });
});
