import { hasSufficientGasForQuote } from './insufficient-gas-for-quote.js';

const mockHasNetworkFee = jest.fn();
jest.mock('./network-fee-unavailable.ts', () => ({
  hasNetworkFee: (): boolean => mockHasNetworkFee(),
}));

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
        normalizedAmount: '1',
        amount: '1000000000000000000',
      },
    ],
  },
};

const balances = {
  'eip155:1/slip44:60': '2',
};

describe('hasSufficientGasForQuote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasNetworkFee.mockReturnValue(true);
  });

  it('returns false if the balance is not available', () => {
    const result = hasSufficientGasForQuote({
      balances: {},
      quote,
    });

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

    const result = hasSufficientGasForQuote({
      balances,
      quote: gaslessQuote,
    });

    expect(result).toBe(true);
  });

  it.each([
    { gasIncluded: true },
    { gasIncluded7702: true },
    { gasSponsored: true },
  ])(
    'returns false if the quote is gasless, ignoreGasLessFlags is true and balance is insufficient %s',
    (gaslessProperties) => {
      const gaslessQuote = {
        ...quote,
        ...gaslessProperties,
      };

      const result = hasSufficientGasForQuote({
        balances: {
          'eip155:1/slip44:60': '0.1',
        },
        quote: gaslessQuote,
        ignoreGasLessFlags: true,
      });

      expect(result).toBe(false);
    },
  );

  it('returns true if the balance is equal to the network fee', () => {
    const result = hasSufficientGasForQuote({
      balances,
      quote,
    });

    expect(result).toBe(true);
  });

  it('returns true if the balance is greater than the network fee', () => {
    const result = hasSufficientGasForQuote({
      balances: {
        'eip155:1/slip44:60': '3',
      },
      quote,
    });

    expect(result).toBe(true);
  });

  it('returns true if the quote has no network fee', () => {
    const quoteWithoutNetworkFee = {
      ...quote,
      src: {
        ...quote.src,
        asset: {
          ...quote.src.asset,
          assetId:
            'eip155:1/erc20:0x0000000000000000000000000000000000000005' as const,
        },
      },
      feeData: {
        network: [],
      },
    };

    const result = hasSufficientGasForQuote({
      balances,
      quote: quoteWithoutNetworkFee,
    });

    expect(result).toBe(true);
  });

  it('returns true if the balance is greater than or equal to the network fee + src amount + minimum balance', () => {
    const result = hasSufficientGasForQuote({
      balances: {
        'eip155:1/slip44:60': '2.1',
      },
      quote,
      minimumBalance: {
        asset: {
          assetId: 'eip155:1/slip44:60' as const,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
        },
        amount: '100000000000000000',
        normalizedAmount: '0.1',
      },
    });

    expect(result).toBe(true);
  });

  it('returns false if the balance is less than the network fee + src amount', () => {
    const result = hasSufficientGasForQuote({
      balances: {
        'eip155:1/slip44:60': '1.9',
      },
      quote,
    });

    expect(result).toBe(false);
  });

  it('returns false if the balance is less than the network fee (ERC20)', () => {
    const erc20Quote = {
      ...quote,
      src: {
        ...quote.src,
        asset: {
          ...quote.src.asset,
          assetId:
            'eip155:1/erc20:0x0000000000000000000000000000000000000005' as const,
        },
      },
    };

    const result = hasSufficientGasForQuote({
      balances: {
        'eip155:1/slip44:60': '0',
      },
      quote: erc20Quote,
    });

    expect(result).toBe(false);
  });

  it('returns true if balances are greater than the network fees (multiple assets)', () => {
    const multipleAssetsQuote = {
      ...quote,
      feeData: {
        network: [
          ...quote.feeData.network,
          {
            asset: {
              assetId:
                'eip155:1/erc20:0x0000000000000000000000000000000000000005' as const,
              decimals: 18,
            },
            normalizedAmount: '1',
            amount: '1000000000000000000',
          },
        ],
      },
    };

    const result = hasSufficientGasForQuote({
      balances: {
        ...balances,
        'eip155:1/erc20:0x0000000000000000000000000000000000000005': '1',
      },
      quote: multipleAssetsQuote,
    });

    expect(result).toBe(true);
  });
});
