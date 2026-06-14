import {
  CHAIN_ID_POLYGON,
  POLYGON_PUSD_ADDRESS,
  POLYGON_USDCE_ADDRESS,
  STABLECOINS,
} from './constants';

describe('STABLECOINS', () => {
  it('includes both Polygon USDC.e and Polymarket pUSD as Polygon stablecoins', () => {
    // pUSD is treated as a USD-pegged stablecoin so post-quote display logic
    // uses currencyOut.amountFormatted (1:1 USD) instead of going through
    // the USD-rate API. Without pUSD in this list, predict-withdraw quote
    // displays would round-trip through fiat conversion needlessly.
    const polygonStablecoins = STABLECOINS[CHAIN_ID_POLYGON];

    expect(polygonStablecoins).toContain(POLYGON_USDCE_ADDRESS.toLowerCase());
    expect(polygonStablecoins).toContain(POLYGON_PUSD_ADDRESS.toLowerCase());
  });

  it('lower-cases all stablecoin entries for case-insensitive lookup', () => {
    for (const [, addresses] of Object.entries(STABLECOINS)) {
      for (const address of addresses) {
        expect(address).toBe(address.toLowerCase());
      }
    }
  });
});
