import * as allExports from '.';

describe('@metamask/transaction-controller', () => {
  it('has expected JavaScript exports', () => {
    expect(Object.keys(allExports)).toMatchInlineSnapshot(`
      Array [
        "HARDFORK",
        "CANCEL_RATE",
        "TransactionController",
        "GasFeeEstimateLevel",
        "GasFeeEstimateType",
        "SimulationErrorCode",
        "SimulationTokenStandard",
        "TransactionEnvelopeType",
        "TransactionStatus",
        "TransactionType",
        "UserFeeLevel",
        "WalletDevice",
        "determineTransactionType",
        "mergeGasFeeEstimates",
        "isEIP1559Transaction",
        "normalizeTransactionParams",
      ]
    `);
  });
});
