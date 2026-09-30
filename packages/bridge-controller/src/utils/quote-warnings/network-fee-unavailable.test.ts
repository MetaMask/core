import { hasNetworkFee } from './network-fee-unavailable.js';

const quote = {
  gasIncluded: false,
  gasIncluded7702: false,
  gasSponsored: false,
  src: {
    asset: {
      assetId: 'eip155:1/slip44:60' as const,
    },
    amount: '1000000000000000000',
    normalizedAmount: '1',
  },
  feeData: {
    network: [
      {
        asset: {
          assetId: 'eip155:1/slip44:60' as const,
        },
        normalizedAmount: '0',
        amount: '0',
      },
    ],
  },
};

describe('hasNetworkFee', () => {
  it.each([
    {
      amount: '1000000000000000000',
    },
    {
      normalizedAmount: '1',
    },
    {
      valueInCurrency: '1000000000000000000',
    },
  ])(
    'returns true if the network fee is defined and greater than 0: %s',
    (partialNetworkFee) => {
      const result = hasNetworkFee({
        ...quote,
        feeData: {
          network: [{ ...quote.feeData?.network?.[0], ...partialNetworkFee }],
        },
      });

      expect(result).toBe(true);
    },
  );

  it('returns false if the network fee is 0', () => {
    const result = hasNetworkFee(quote);

    expect(result).toBe(false);
  });

  it.each([
    { gasIncluded: true },
    { gasIncluded7702: true },
    { gasSponsored: true },
  ])('returns true if the quote is gasless %s', (gaslessProperties) => {
    const gaslessQuote = {
      ...quote,
      ...gaslessProperties,
    };

    const result = hasNetworkFee(gaslessQuote);

    expect(result).toBe(true);
  });
});
