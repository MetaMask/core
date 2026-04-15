import type { AssetBalance, AssetMetadata, FungibleAssetPrice } from '../types';
import {
  formatStateForTransactionPay,
  AccountForLegacyFormat,
} from './formatStateForTransactionPay';

function price(
  overrides: Partial<FungibleAssetPrice> & { price: number },
): FungibleAssetPrice {
  return {
    assetPriceType: 'fungible',
    lastUpdated: 0,
    usdPrice: overrides.price,
    ...overrides,
  };
}

const ETH_NATIVE_ID = 'eip155:1/slip44:60';
const USDC_ASSET_ID =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';

const ACCOUNT_1: AccountForLegacyFormat = {
  id: 'account-1',
  address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
};

const EVM_NATIVE_IDS: Record<string, string> = {
  'eip155:1': ETH_NATIVE_ID,
};

const EVM_NETWORK_CONFIGS: Record<string, { nativeCurrency: string }> = {
  '0x1': { nativeCurrency: 'ETH' },
};

describe('formatStateForTransactionPay', () => {
  it('returns empty tokenBalances, accountsByChainId, allTokens when no balances or info', () => {
    const result = formatStateForTransactionPay({
      accounts: [ACCOUNT_1],
      assetsBalance: {},
      assetsInfo: {},
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    expect(result.tokenBalances).toStrictEqual({});
    expect(result.accountsByChainId).toStrictEqual({});
    expect(result.allTokens).toStrictEqual({});
    expect(result.currentCurrency).toBe('usd');
    expect(result.marketData).toStrictEqual({});
    expect(result.currencyRates).toStrictEqual({});
  });

  it('includes native balance in tokenBalances and accountsByChainId', () => {
    const result = formatStateForTransactionPay({
      accounts: [ACCOUNT_1],
      assetsBalance: {
        [ACCOUNT_1.id]: {
          [ETH_NATIVE_ID]: { amount: '1000000000000000000' },
        },
      },
      assetsInfo: {},
      assetsPrice: { [ETH_NATIVE_ID]: price({ price: 2000 }) },
      selectedCurrency: 'usd',
      nativeAssetIdentifiers: EVM_NATIVE_IDS,
      networkConfigurationsByChainId: EVM_NETWORK_CONFIGS,
    });

    const accountLower = ACCOUNT_1.address.toLowerCase();
    expect(result.tokenBalances[accountLower]).toBeDefined();
    expect(result.tokenBalances[accountLower]['0x1']).toBeDefined();
    expect(result.tokenBalances[accountLower]['0x1'][NATIVE_ADDRESS]).toBe(
      '0xde0b6b3a7640000',
    );

    expect(result.accountsByChainId['0x1']).toBeDefined();
    const checksumAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    expect(result.accountsByChainId['0x1'][checksumAddress]).toStrictEqual({
      balance: '0xde0b6b3a7640000',
    });
  });

  it('includes ERC20 balance in tokenBalances', () => {
    const result = formatStateForTransactionPay({
      accounts: [ACCOUNT_1],
      assetsBalance: {
        [ACCOUNT_1.id]: {
          [USDC_ASSET_ID]: { amount: '1000000' },
        },
      },
      assetsInfo: {},
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    const accountLower = ACCOUNT_1.address.toLowerCase();
    expect(result.tokenBalances[accountLower]['0x1'][USDC_ADDRESS]).toBe(
      '0xf4240',
    );
  });

  it('builds allTokens from assetsInfo with decimals, symbol, name', () => {
    const result = formatStateForTransactionPay({
      accounts: [],
      assetsBalance: {},
      assetsInfo: {
        [USDC_ASSET_ID]: {
          type: 'erc20',
          decimals: 6,
          symbol: 'USDC',
          name: 'USD Coin',
        } as AssetMetadata,
        [ETH_NATIVE_ID]: {
          type: 'native',
          decimals: 18,
          symbol: 'ETH',
          name: 'Ether',
        } as AssetMetadata,
      },
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    expect(result.allTokens['0x1']).toBeDefined();
    expect(result.allTokens['0x1']['']).toHaveLength(2);

    const usdcToken = result.allTokens['0x1'][''].find(
      (token) => token.address === USDC_ADDRESS,
    );
    expect(usdcToken).toStrictEqual({
      address: USDC_ADDRESS,
      decimals: 6,
      symbol: 'USDC',
      name: 'USD Coin',
    });

    const nativeToken = result.allTokens['0x1'][''].find(
      (token) => token.address === NATIVE_ADDRESS,
    );
    expect(nativeToken).toStrictEqual({
      address: NATIVE_ADDRESS,
      decimals: 18,
      symbol: 'ETH',
      name: 'Ether',
    });
  });

  it('skips non-eip155 asset IDs for balances and tokens', () => {
    const bip122Id = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
    const result = formatStateForTransactionPay({
      accounts: [ACCOUNT_1],
      assetsBalance: {
        [ACCOUNT_1.id]: {
          [bip122Id]: { amount: '1000' },
        },
      },
      assetsInfo: {
        [bip122Id]: {
          decimals: 8,
          symbol: 'BTC',
          name: 'Bitcoin',
        } as AssetMetadata,
      },
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    expect(result.tokenBalances).toStrictEqual({});
    expect(result.accountsByChainId).toStrictEqual({});
    expect(result.allTokens).toStrictEqual({});
  });

  it('de-duplicates tokens by address (case-insensitive) in allTokens', () => {
    const lowerUsdcId =
      'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    const result = formatStateForTransactionPay({
      accounts: [],
      assetsBalance: {},
      assetsInfo: {
        [USDC_ASSET_ID]: {
          type: 'erc20',
          decimals: 6,
          symbol: 'USDC',
        } as AssetMetadata,
        [lowerUsdcId]: {
          type: 'erc20',
          decimals: 6,
          symbol: 'USDC',
        } as AssetMetadata,
      },
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    expect(
      result.allTokens['0x1'][''].filter((token) => token.symbol === 'USDC'),
    ).toHaveLength(1);
  });

  it('uses lowercase account address for tokenBalances key', () => {
    const result = formatStateForTransactionPay({
      accounts: [ACCOUNT_1],
      assetsBalance: {
        [ACCOUNT_1.id]: {
          [ETH_NATIVE_ID]: { amount: '1' },
        },
      },
      assetsInfo: {},
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    expect(result.tokenBalances[ACCOUNT_1.address.toLowerCase()]).toBeDefined();
    expect(result.tokenBalances[ACCOUNT_1.address]).toBeUndefined();
  });

  it('handles balance as object without amount (defaults to 0)', () => {
    const result = formatStateForTransactionPay({
      accounts: [ACCOUNT_1],
      assetsBalance: {
        [ACCOUNT_1.id]: {
          [ETH_NATIVE_ID]: {} as AssetBalance,
        },
      },
      assetsInfo: {},
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    const accountLower = ACCOUNT_1.address.toLowerCase();
    expect(result.tokenBalances[accountLower]['0x1'][NATIVE_ADDRESS]).toBe(
      '0x0',
    );
  });

  it('passes assetsPrice and selectedCurrency to formatExchangeRatesForBridge', () => {
    const result = formatStateForTransactionPay({
      accounts: [],
      assetsBalance: {},
      assetsInfo: {},
      assetsPrice: {
        [ETH_NATIVE_ID]: price({ price: 2000, lastUpdated: 1_700_000_000_000 }),
      },
      selectedCurrency: 'eur',
      nativeAssetIdentifiers: EVM_NATIVE_IDS,
      networkConfigurationsByChainId: EVM_NETWORK_CONFIGS,
    });

    expect(result.currentCurrency).toBe('eur');
    expect(result.currencyRates.ETH).toBeDefined();
    expect(result.marketData['0x1']?.[NATIVE_ADDRESS]).toBeDefined();
  });

  it('uses price for conversionRate and usdPrice for usdConversionRate when selectedCurrency is not usd', () => {
    const result = formatStateForTransactionPay({
      accounts: [],
      assetsBalance: {},
      assetsInfo: {},
      assetsPrice: {
        [ETH_NATIVE_ID]: price({
          price: 1840,
          usdPrice: 2000,
          lastUpdated: 1_700_000_000_000,
        }),
      },
      selectedCurrency: 'eur',
      nativeAssetIdentifiers: EVM_NATIVE_IDS,
      networkConfigurationsByChainId: EVM_NETWORK_CONFIGS,
    });

    expect(result.currentCurrency).toBe('eur');
    expect(result.currencyRates.ETH).toStrictEqual({
      conversionDate: 1_700_000_000,
      conversionRate: 1840,
      usdConversionRate: 2000,
    });
  });

  it('includes multiple accounts in tokenBalances and accountsByChainId', () => {
    const account2: AccountForLegacyFormat = {
      id: 'account-2',
      address: '0xDEADBEEF00000000000000000000000000000000',
    };
    const result = formatStateForTransactionPay({
      accounts: [ACCOUNT_1, account2],
      assetsBalance: {
        [ACCOUNT_1.id]: { [ETH_NATIVE_ID]: { amount: '100' } },
        [account2.id]: { [ETH_NATIVE_ID]: { amount: '200' } },
      },
      assetsInfo: {},
      assetsPrice: {},
      selectedCurrency: 'usd',
      nativeAssetIdentifiers: EVM_NATIVE_IDS,
    });

    expect(
      result.tokenBalances[ACCOUNT_1.address.toLowerCase()]['0x1'][
        NATIVE_ADDRESS
      ],
    ).toBe('0x64');
    expect(
      result.tokenBalances[account2.address.toLowerCase()]['0x1'][
        NATIVE_ADDRESS
      ],
    ).toBe('0xc8');

    expect(
      result.accountsByChainId['0x1'][
        '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
      ],
    ).toStrictEqual({ balance: '0x64' });
    expect(
      result.accountsByChainId['0x1'][
        '0xdEADBEeF00000000000000000000000000000000'
      ],
    ).toStrictEqual({ balance: '0xc8' });
  });

  it('skips account with no balances in assetsBalance', () => {
    const result = formatStateForTransactionPay({
      accounts: [ACCOUNT_1],
      assetsBalance: {},
      assetsInfo: {},
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    expect(result.tokenBalances).toStrictEqual({});
    expect(result.accountsByChainId).toStrictEqual({});
  });

  it('skips malformed asset IDs in balance and info without throwing', () => {
    const result = formatStateForTransactionPay({
      accounts: [ACCOUNT_1],
      assetsBalance: {
        [ACCOUNT_1.id]: {
          [ETH_NATIVE_ID]: { amount: '100' },
          'not-valid-caip': { amount: '999' },
        },
      },
      assetsInfo: {
        [USDC_ASSET_ID]: {
          type: 'erc20',
          decimals: 6,
          symbol: 'USDC',
        } as AssetMetadata,
        'invalid-asset-id': {
          decimals: 18,
          symbol: 'X',
        } as AssetMetadata,
      },
      assetsPrice: {},
      selectedCurrency: 'usd',
    });

    const accountLower = ACCOUNT_1.address.toLowerCase();
    expect(result.tokenBalances[accountLower]['0x1'][NATIVE_ADDRESS]).toBe(
      '0x64',
    );
    expect(
      result.allTokens['0x1'][''].find((token) => token.symbol === 'USDC'),
    ).toBeDefined();
    expect(
      result.allTokens['0x1'][''].find((token) => token.symbol === 'X'),
    ).toBeUndefined();
  });
});
