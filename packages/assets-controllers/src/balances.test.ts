/* eslint-disable @typescript-eslint/no-explicit-any */
import { AccountWalletType, AccountGroupType } from '@metamask/account-api';

import {
  calculateBalanceForAllWallets,
  calculateBalanceChangeForAllWallets,
  calculateBalanceChangeForAccountGroup,
} from './balances';

const createBaseMockState = (userCurrency = 'USD') => ({
  AccountTreeController: {
    accountTree: {
      wallets: {
        'entropy:entropy-source-1': {
          id: 'entropy:entropy-source-1',
          type: AccountWalletType.Entropy,
          metadata: {
            name: 'Wallet 1',
            entropy: { id: 'entropy-source-1', index: 0 },
          },
          groups: {
            'entropy:entropy-source-1/0': {
              id: 'entropy:entropy-source-1/0',
              type: AccountGroupType.MultichainAccount,
              accounts: ['account-1', 'account-2'],
              metadata: {
                name: 'Group 0',
                pinned: false,
                hidden: false,
                entropy: { groupIndex: 0 },
              },
            },
            'entropy:entropy-source-1/1': {
              id: 'entropy:entropy-source-1/1',
              type: AccountGroupType.MultichainAccount,
              accounts: ['account-3'],
              metadata: {
                name: 'Group 1',
                pinned: false,
                hidden: false,
                entropy: { groupIndex: 1 },
              },
            },
          },
        },
      },
      selectedAccountGroup: 'entropy:entropy-source-1/0',
    },
    accountGroupsMetadata: {},
    accountWalletsMetadata: {},
  },
  AccountsController: {
    internalAccounts: {
      accounts: {
        'account-1': {
          id: 'account-1',
          address: '0x1234567890123456789012345678901234567890',
          type: 'eip155:eoa',
          scopes: ['eip155:1', 'eip155:89', 'eip155:a4b1'],
          methods: [],
          options: {},
          metadata: {
            name: 'Account 1',
            keyring: { type: 'hd' },
            importTime: 0,
          },
        },
        'account-2': {
          id: 'account-2',
          address: '0x2345678901234567890123456789012345678901',
          type: 'eip155:eoa',
          scopes: ['eip155:1'],
          methods: [],
          options: {},
          metadata: {
            name: 'Account 2',
            keyring: { type: 'hd' },
            importTime: 0,
          },
        },
        'account-3': {
          id: 'account-3',
          address: '0x3456789012345678901234567890123456789012',
          type: 'eip155:eoa',
          scopes: ['eip155:1'],
          methods: [],
          options: {},
          metadata: {
            name: 'Account 3',
            keyring: { type: 'hd' },
            importTime: 0,
          },
        },
      },
      selectedAccount: 'account-1',
    },
  },
  TokenBalancesController: {
    tokenBalances: {
      '0x1234567890123456789012345678901234567890': {
        '0x1': {
          '0x1234567890123456789012345678901234567890': '0x5f5e100',
          '0x2345678901234567890123456789012345678901': '0xbebc200',
        },
        '0x89': {
          '0x1234567890123456789012345678901234567890': '0x1dcd6500',
          '0x2345678901234567890123456789012345678901': '0x3b9aca00',
        },
        '0xa4b1': {
          '0x1234567890123456789012345678901234567890': '0x2faf080',
          '0x2345678901234567890123456789012345678901': '0x8f0d180',
        },
      },
      '0x2345678901234567890123456789012345678901': {
        '0x1': {
          '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': '0x56bc75e2d63100000',
          '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': '0xde0b6b3a7640000',
        },
      },
    },
  },
  TokenRatesController: {
    marketData: {
      '0x1': {
        '0x1234567890123456789012345678901234567890': {
          tokenAddress: '0x123...',
          currency: 'ETH',
          price: 0.00041,
        },
        '0x2345678901234567890123456789012345678901': {
          tokenAddress: '0x234...',
          currency: 'ETH',
          price: 0.00041,
        },
        '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': {
          tokenAddress: '0xC0b...',
          currency: 'ETH',
          price: 0.00041,
        },
        '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': {
          tokenAddress: '0xD0b...',
          currency: 'ETH',
          price: 1.0,
        },
      },
      '0x89': {
        '0x1234567890123456789012345678901234567890': {
          tokenAddress: '0x123...',
          currency: 'MATIC',
          price: 1.25,
        },
        '0x2345678901234567890123456789012345678901': {
          tokenAddress: '0x234...',
          currency: 'MATIC',
          price: 1.25,
        },
      },
      '0xa4b1': {
        '0x1234567890123456789012345678901234567890': {
          tokenAddress: '0x123...',
          currency: 'ARB',
          price: 0.91,
        },
        '0x2345678901234567890123456789012345678901': {
          tokenAddress: '0x234...',
          currency: 'ARB',
          price: 0.91,
        },
      },
    },
  },
  TokensController: {
    allTokens: {
      '0x1': {
        '0x1234567890123456789012345678901234567890': [
          {
            address: '0x1234567890123456789012345678901234567890',
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin',
          },
          {
            address: '0x2345678901234567890123456789012345678901',
            decimals: 6,
            symbol: 'USDT',
            name: 'Tether USD',
          },
          {
            address: '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1',
            decimals: 18,
            symbol: 'DAI',
            name: 'Dai',
          },
          {
            address: '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1',
            decimals: 18,
            symbol: 'WETH',
            name: 'Wrapped Ether',
          },
        ],
        '0x2345678901234567890123456789012345678901': [
          {
            address: '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1',
            decimals: 18,
            symbol: 'DAI',
            name: 'Dai',
          },
          {
            address: '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1',
            decimals: 18,
            symbol: 'WETH',
            name: 'Wrapped Ether',
          },
        ],
      },
      '0x89': {
        '0x1234567890123456789012345678901234567890': [
          {
            address: '0x1234567890123456789012345678901234567890',
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin',
          },
          {
            address: '0x2345678901234567890123456789012345678901',
            decimals: 6,
            symbol: 'USDT',
            name: 'Tether USD',
          },
        ],
      },
      '0xa4b1': {
        '0x1234567890123456789012345678901234567890': [
          {
            address: '0x1234567890123456789012345678901234567890',
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin',
          },
          {
            address: '0x2345678901234567890123456789012345678901',
            decimals: 6,
            symbol: 'USDT',
            name: 'Tether USD',
          },
        ],
      },
    },
  },
  MultichainAssetsRatesController: { conversionRates: {} },
  MultichainBalancesController: { balances: {} },
  CurrencyRateController: {
    currentCurrency: userCurrency,
    currencyRates: {
      ETH: { conversionRate: 2400, usdConversionRate: 2400 },
      MATIC: { conversionRate: 0.8, usdConversionRate: 0.8 },
      ARB: { conversionRate: 1.1, usdConversionRate: 1.1 },
    },
  },
});

const createMobileMockState = (userCurrency = 'USD') => ({
  engine: { backgroundState: createBaseMockState(userCurrency) },
});

describe('calculateBalanceForAllWallets', () => {
  it('computes all wallets total in USD', () => {
    const state = createMobileMockState('USD');
    const result = calculateBalanceForAllWallets(
      state.engine.backgroundState.AccountTreeController as any,
      state.engine.backgroundState.AccountsController as any,
      state.engine.backgroundState.TokenBalancesController as any,
      state.engine.backgroundState.TokenRatesController as any,
      state.engine.backgroundState.MultichainAssetsRatesController as any,
      state.engine.backgroundState.MultichainBalancesController as any,
      state.engine.backgroundState.TokensController as any,
      state.engine.backgroundState.CurrencyRateController as any,
      undefined,
    );
    expect(result.totalBalanceInUserCurrency).toBeCloseTo(4493.8, 1);
  });

  it('computes totals in EUR (different conversion rates)', () => {
    const state = createMobileMockState('EUR');
    state.engine.backgroundState.CurrencyRateController.currencyRates.ETH.conversionRate = 2040;
    state.engine.backgroundState.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68;
    state.engine.backgroundState.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935;

    const result = calculateBalanceForAllWallets(
      state.engine.backgroundState.AccountTreeController as any,
      state.engine.backgroundState.AccountsController as any,
      state.engine.backgroundState.TokenBalancesController as any,
      state.engine.backgroundState.TokenRatesController as any,
      state.engine.backgroundState.MultichainAssetsRatesController as any,
      state.engine.backgroundState.MultichainBalancesController as any,
      state.engine.backgroundState.TokensController as any,
      state.engine.backgroundState.CurrencyRateController as any,
      undefined,
    );
    expect(result.totalBalanceInUserCurrency).toBeCloseTo(3819.73, 2);
    expect(result.userCurrency).toBe('EUR');
  });

  it('includes non-EVM balances when provided', () => {
    const state = createMobileMockState('EUR');
    // Adjust EUR rates
    state.engine.backgroundState.CurrencyRateController.currencyRates.ETH.conversionRate = 2040;
    state.engine.backgroundState.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68;
    state.engine.backgroundState.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935;

    // Add non-EVM account to group 0
    (
      state.engine.backgroundState as any
    ).AccountsController.internalAccounts.accounts['account-4'] = {
      id: 'account-4',
      address: 'FzQ4QJ...yCzPq8dYc',
      type: 'solana:eoa',
      scopes: ['solana:mainnet'],
      methods: [],
      options: {},
      metadata: { name: 'Sol', keyring: { type: 'hd' }, importTime: 0 },
    };
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets[
      'entropy:entropy-source-1'
    ].groups['entropy:entropy-source-1/0'].accounts.push('account-4');

    // Non-EVM balance and conversion rate (already in user currency)
    (state.engine.backgroundState as any).MultichainBalancesController.balances[
      'account-4'
    ] = {
      'solana:mainnet/solana:FzQ4QJ...yCzPq8dYc': {
        amount: '50.0',
        unit: 'SOL',
      },
    };
    (
      state.engine.backgroundState as any
    ).MultichainAssetsRatesController.conversionRates[
      'solana:mainnet/solana:FzQ4QJ...yCzPq8dYc'
    ] = {
      rate: '50.0',
      conversionTime: 0,
    };

    const result = calculateBalanceForAllWallets(
      state.engine.backgroundState.AccountTreeController as any,
      state.engine.backgroundState.AccountsController as any,
      state.engine.backgroundState.TokenBalancesController as any,
      state.engine.backgroundState.TokenRatesController as any,
      state.engine.backgroundState.MultichainAssetsRatesController as any,
      state.engine.backgroundState.MultichainBalancesController as any,
      state.engine.backgroundState.TokensController as any,
      state.engine.backgroundState.CurrencyRateController as any,
      undefined,
    );
    // 3819.73 EUR (EVM from previous test) + 50*50 = 2500 = 6319.73
    expect(result.totalBalanceInUserCurrency).toBeCloseTo(6319.73, 2);
  });

  it('filters out disabled chains via enabledNetworkMap (mobile semantics: false disables)', () => {
    const state = createMobileMockState('USD');
    const enabledNetworkMap = {
      eip155: { '0x1': true, '0x89': true, '0xa4b1': false },
    } as Record<string, Record<string, boolean>>;
    const result = calculateBalanceForAllWallets(
      state.engine.backgroundState.AccountTreeController as any,
      state.engine.backgroundState.AccountsController as any,
      state.engine.backgroundState.TokenBalancesController as any,
      state.engine.backgroundState.TokenRatesController as any,
      state.engine.backgroundState.MultichainAssetsRatesController as any,
      state.engine.backgroundState.MultichainBalancesController as any,
      state.engine.backgroundState.TokensController as any,
      state.engine.backgroundState.CurrencyRateController as any,
      enabledNetworkMap,
    );
    // Excluding ARB group amounts (200.2) from 4493.8 => 4293.6
    expect(result.totalBalanceInUserCurrency).toBeCloseTo(4293.6, 1);
  });

  it('filters out chains missing from enabledNetworkMap (extension semantics: missing disables)', () => {
    const state = createMobileMockState('USD');
    const enabledNetworkMap = {
      eip155: { '0x1': true, '0x89': true },
    } as Record<string, Record<string, boolean>>; // 0xa4b1 missing
    const result = calculateBalanceForAllWallets(
      state.engine.backgroundState.AccountTreeController as any,
      state.engine.backgroundState.AccountsController as any,
      state.engine.backgroundState.TokenBalancesController as any,
      state.engine.backgroundState.TokenRatesController as any,
      state.engine.backgroundState.MultichainAssetsRatesController as any,
      state.engine.backgroundState.MultichainBalancesController as any,
      state.engine.backgroundState.TokensController as any,
      state.engine.backgroundState.CurrencyRateController as any,
      enabledNetworkMap,
    );
    expect(result.totalBalanceInUserCurrency).toBeCloseTo(4293.6, 1);
  });

  it('handles undefined wallet entries when aggregating totals', () => {
    const state = createMobileMockState('USD');
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets['undefined:wallet'] = undefined;

    const result = calculateBalanceForAllWallets(
      state.engine.backgroundState.AccountTreeController as any,
      state.engine.backgroundState.AccountsController as any,
      state.engine.backgroundState.TokenBalancesController as any,
      state.engine.backgroundState.TokenRatesController as any,
      state.engine.backgroundState.MultichainAssetsRatesController as any,
      state.engine.backgroundState.MultichainBalancesController as any,
      state.engine.backgroundState.TokensController as any,
      state.engine.backgroundState.CurrencyRateController as any,
      undefined,
    );
    expect(result.totalBalanceInUserCurrency).toBeGreaterThanOrEqual(0);
  });

  it('ignores EVM token that is not listed in allTokens', () => {
    const state = createMobileMockState('USD');
    (state.engine.backgroundState as any).TokenBalancesController.tokenBalances[
      '0x1234567890123456789012345678901234567890'
    ]['0x1']['0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'] = '0x1';

    const result = calculateBalanceForAllWallets(
      state.engine.backgroundState.AccountTreeController as any,
      state.engine.backgroundState.AccountsController as any,
      state.engine.backgroundState.TokenBalancesController as any,
      state.engine.backgroundState.TokenRatesController as any,
      state.engine.backgroundState.MultichainAssetsRatesController as any,
      state.engine.backgroundState.MultichainBalancesController as any,
      state.engine.backgroundState.TokensController as any,
      state.engine.backgroundState.CurrencyRateController as any,
      undefined,
    );
    expect(result.totalBalanceInUserCurrency).toBeGreaterThan(0);
  });

  it('skips non-EVM totals for disabled chain and NaN inputs', () => {
    const state = createMobileMockState('USD');
    (
      state.engine.backgroundState as any
    ).AccountsController.internalAccounts.accounts['account-8'] = {
      id: 'account-8',
      address: 'NonEvm4',
      type: 'solana:eoa',
      scopes: ['solana:mainnet'],
      methods: [],
      options: {},
      metadata: { name: 'Sol4', keyring: { type: 'hd' }, importTime: 0 },
    };
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets[
      'entropy:entropy-source-1'
    ].groups['entropy:entropy-source-1/0'].accounts.push('account-8');

    (state.engine.backgroundState as any).MultichainBalancesController.balances[
      'account-8'
    ] = {
      'solana:mainnet/asset:disabled': { amount: '5', unit: 'X' },
      'solana:mainnet/asset:nan-amount': { amount: 'abc', unit: 'Y' },
      'solana:mainnet/asset:nan-rate': { amount: '3', unit: 'Z' },
    };
    (
      state.engine.backgroundState as any
    ).MultichainAssetsRatesController.conversionRates[
      'solana:mainnet/asset:disabled'
    ] = {
      rate: '2',
      marketData: { pricePercentChange: { P1D: 10 } },
      conversionTime: 0,
    };
    (
      state.engine.backgroundState as any
    ).MultichainAssetsRatesController.conversionRates[
      'solana:mainnet/asset:nan-amount'
    ] = {
      rate: '2',
      marketData: { pricePercentChange: { P1D: 10 } },
      conversionTime: 0,
    };
    (
      state.engine.backgroundState as any
    ).MultichainAssetsRatesController.conversionRates[
      'solana:mainnet/asset:nan-rate'
    ] = {
      rate: 'NaN',
      marketData: { pricePercentChange: { P1D: 10 } },
      conversionTime: 0,
    };

    const enabledNetworkMap = { solana: { 'solana:mainnet': false } } as Record<
      string,
      Record<string, boolean>
    >;

    const result = calculateBalanceForAllWallets(
      state.engine.backgroundState.AccountTreeController as any,
      state.engine.backgroundState.AccountsController as any,
      state.engine.backgroundState.TokenBalancesController as any,
      state.engine.backgroundState.TokenRatesController as any,
      state.engine.backgroundState.MultichainAssetsRatesController as any,
      state.engine.backgroundState.MultichainBalancesController as any,
      state.engine.backgroundState.TokensController as any,
      state.engine.backgroundState.CurrencyRateController as any,
      enabledNetworkMap,
    );
    expect(result.totalBalanceInUserCurrency).toBeGreaterThanOrEqual(0);
  });

  describe('calculateBalanceChangeForAllWallets', () => {
    it('computes 1d change for EVM tokens', () => {
      const state = createMobileMockState('USD');
      // Inject percent change into market data for one token to exercise change calc
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'].pricePercentChange1d = 10;

      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );

      // Expect exact calculations:
      // 1 WETH @ 1 ETH, 1 ETH = 2400 USD => current = 2400
      // previous = 2400 / 1.1, delta = current - previous, pct = 10%
      expect(out.userCurrency).toBe('USD');
      expect(out.period).toBe('1d');
      expect(out.currentTotalInUserCurrency).toBeCloseTo(2400, 6);
      expect(out.previousTotalInUserCurrency).toBeCloseTo(2400 / 1.1, 6);
      expect(out.amountChangeInUserCurrency).toBeCloseTo(2400 - 2400 / 1.1, 6);
      expect(out.percentChange).toBeCloseTo(10, 6);
    });

    it('respects enabledNetworkMap', () => {
      const state = createMobileMockState('USD');
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'].pricePercentChange1d = 10;
      const enabledNetworkMap = {
        eip155: { '0x1': false, '0x89': true, '0xa4b1': true },
      } as Record<string, Record<string, boolean>>;

      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        enabledNetworkMap,
        '1d',
      );

      // With ETH disabled, change should exclude 0x1 tokens => zeros across the board
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
      expect(out.amountChangeInUserCurrency).toBe(0);
      expect(out.percentChange).toBe(0);
    });

    it('computes 1d change aggregating EVM and non-EVM assets (complex case)', () => {
      const state = createMobileMockState('USD');

      // EVM side: 1 WETH @ 1 ETH, ETH→USD=2400, +10% (pricePercentChange1d)
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'].pricePercentChange1d = 10;

      // Non-EVM side: add a Solana-like asset with 10 units @ 50 USD each, +20% (P1D)
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-4'] = {
        id: 'account-4',
        address: 'FzQ4QJ...yCzPq8dYc',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'Sol', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-4');

      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-4'] = {
        'solana:mainnet/solana:FzQ4QJ...yCzPq8dYc': {
          amount: '10.0',
          unit: 'SOL',
        },
      };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/solana:FzQ4QJ...yCzPq8dYc'
      ] = {
        rate: '50.0',
        marketData: { pricePercentChange: { P1D: 20 } },
        conversionTime: 0,
      };

      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );

      // Calculation:
      // EVM current = 1 * 1 ETH * 2400 USD = 2400; previous = 2400 / 1.1
      // non-EVM current = 10 * 50 = 500; previous = 500 / 1.2
      // total current = 2400 + 500 = 2900
      // total previous = 2400/1.1 + 500/1.2
      // amount change = current - previous
      // percent change = (amount change / previous) * 100
      const expectedCurrent = 2400 + 500;
      const expectedPrevious = 2400 / 1.1 + 500 / 1.2;
      const expectedDelta = expectedCurrent - expectedPrevious;
      const expectedPct = (expectedDelta / expectedPrevious) * 100;

      expect(out.currentTotalInUserCurrency).toBeCloseTo(expectedCurrent, 6);
      expect(out.previousTotalInUserCurrency).toBeCloseTo(expectedPrevious, 6);
      expect(out.amountChangeInUserCurrency).toBeCloseTo(expectedDelta, 6);
      expect(out.percentChange).toBeCloseTo(expectedPct, 6);
    });

    it('skips EVM asset when percent change is missing (coverage of guard path)', () => {
      const state = createMobileMockState('USD');
      // Ensure price exists but percent is missing
      delete (state.engine.backgroundState as any).TokenRatesController
        .marketData['0x1']['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1']
        .pricePercentChange1d;

      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );

      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
      expect(out.amountChangeInUserCurrency).toBe(0);
      expect(out.percentChange).toBe(0);
    });

    it('skips non-EVM asset when rate is NaN or percent is NaN (coverage of guard path)', () => {
      const state = createMobileMockState('USD');

      // Add a non-EVM account with a balance
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-5'] = {
        id: 'account-5',
        address: 'NonEvmAddress',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'Sol', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-5');

      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-5'] = {
        'solana:mainnet/asset:bad-rate': {
          amount: '10.0',
          unit: 'BAD',
        },
        'solana:mainnet/asset:bad-percent': {
          amount: '10.0',
          unit: 'BADPCT',
        },
      };
      // First asset: non-numeric rate
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:bad-rate'
      ] = {
        rate: 'not-a-number',
        marketData: { pricePercentChange: { P1D: 10 } },
        conversionTime: 0,
      };
      // Second asset: NaN percent
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:bad-percent'
      ] = {
        rate: '5.0',
        marketData: { pricePercentChange: { P1D: Number.NaN } },
        conversionTime: 0,
      };

      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );

      // Both non-EVM entries should be skipped, so everything zero
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
      expect(out.amountChangeInUserCurrency).toBe(0);
      expect(out.percentChange).toBe(0);
    });

    it('skips EVM asset when percent change is -100 (denom === 0)', () => {
      const state = createMobileMockState('USD');
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'].pricePercentChange1d =
        -100;

      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );

      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
      expect(out.amountChangeInUserCurrency).toBe(0);
      expect(out.percentChange).toBe(0);
    });

    it('skips non-EVM asset when percent change is -100 (denom === 0)', () => {
      const state = createMobileMockState('USD');

      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-6'] = {
        id: 'account-6',
        address: 'NonEvm2',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'Sol2', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-6');

      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-6'] = {
        'solana:mainnet/asset:denom-zero': {
          amount: '7.0',
          unit: 'BAD100',
        },
      };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:denom-zero'
      ] = {
        rate: '10.0',
        marketData: { pricePercentChange: { P1D: -100 } },
        conversionTime: 0,
      };

      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );

      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
      expect(out.amountChangeInUserCurrency).toBe(0);
      expect(out.percentChange).toBe(0);
    });

    it('change calc ignores undefined wallet entry', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets['undefined:wallet'] =
        undefined;
      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
    });

    it('change calc ignores EVM token not in allTokens', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).TokenBalancesController.tokenBalances[
        '0x1234567890123456789012345678901234567890'
      ]['0x1']['0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'] = '0x1';
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'] = {
        tokenAddress: '0xEEEE',
        currency: 'ETH',
        price: 1.0,
        pricePercentChange1d: 5,
      } as any;
      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
    });

    it('change calc ignores EVM token with invalid hex balance', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).TokenBalancesController.tokenBalances[
        '0x2345678901234567890123456789012345678901'
      ]['0x1']['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = '0xZZZ';
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = {
        tokenAddress: '0xD0b',
        currency: 'ETH',
        price: 1.0,
        pricePercentChange1d: 5,
      } as any;
      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
    });

    it('change calc ignores EVM token when price missing', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).TokenBalancesController.tokenBalances[
        '0x1234567890123456789012345678901234567890'
      ]['0x1']['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = '0x1';
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = {
        tokenAddress: '0xD0b',
        currency: 'ETH',
        pricePercentChange1d: 5,
      } as any;
      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
    });

    it('change calc ignores EVM token when native conversion missing', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).TokenBalancesController.tokenBalances[
        '0x1234567890123456789012345678901234567890'
      ]['0x1']['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = '0x1';
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = {
        tokenAddress: '0xD0b',
        currency: 'ETH',
        price: 1.0,
        pricePercentChange1d: 5,
      } as any;
      delete (state.engine.backgroundState as any).CurrencyRateController
        .currencyRates.ETH;
      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
    });

    it('change calc ignores non-EVM account with no balances', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-10'] = {
        id: 'account-10',
        address: 'NonEvmX',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'SolX', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-10');
      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
    });

    it('change calc ignores non-EVM asset when chain disabled', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-11'] = {
        id: 'account-11',
        address: 'NonEvmY',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'SolY', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-11');
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-11'] = {
        'solana:mainnet/asset:Z': { amount: '5', unit: 'Z' },
      };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:Z'
      ] = {
        rate: '2',
        marketData: { pricePercentChange: { P1D: 10 } },
        conversionTime: 0,
      };
      const enabledNetworkMap = {
        solana: { 'solana:mainnet': false },
      } as Record<string, Record<string, boolean>>;
      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        enabledNetworkMap,
        '1d',
      );
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
    });

    it('change calc ignores non-EVM asset with NaN amount', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-12'] = {
        id: 'account-12',
        address: 'NonEvmZ',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'SolZ', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-12');
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-12'] = {
        'solana:mainnet/asset:W': { amount: 'abc', unit: 'W' },
      };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:W'
      ] = {
        rate: '2',
        marketData: { pricePercentChange: { P1D: 10 } },
        conversionTime: 0,
      };
      const out = calculateBalanceChangeForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        '1d',
      );
      expect(out.currentTotalInUserCurrency).toBe(0);
      expect(out.previousTotalInUserCurrency).toBe(0);
    });

    it('records zero group total when group has no accounts', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/empty'] = {
        id: 'entropy:entropy-source-1/empty',
        type: AccountGroupType.MultichainAccount,
        accounts: [],
        metadata: {},
      };
      const res = calculateBalanceForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
      );
      expect(
        res.wallets['entropy:entropy-source-1'].groups[
          'entropy:entropy-source-1/empty'
        ].totalBalanceInUserCurrency,
      ).toBe(0);
    });

    it('ignores invalid hex EVM balance in totals', () => {
      const state = createMobileMockState('USD');
      const baseline = calculateBalanceForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
      );
      (
        state.engine.backgroundState as any
      ).TokenBalancesController.tokenBalances[
        '0x1234567890123456789012345678901234567890'
      ]['0x1']['0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = '0xZZZ';
      const res = calculateBalanceForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
      );
      expect(res.totalBalanceInUserCurrency).toBe(
        baseline.totalBalanceInUserCurrency,
      );
    });

    it('skips non-EVM balances with NaN amount in totals', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-sol2'] = {
        id: 'account-sol2',
        address: 'SolAcc2',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'Sol2', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-sol2');
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-sol2'] = {
        'solana:mainnet/asset:X': { amount: 'abc', unit: 'X' },
      };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:X'
      ] = { rate: '2', conversionTime: 0 };
      const res = calculateBalanceForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
      );
      expect(res.totalBalanceInUserCurrency).toBeGreaterThanOrEqual(0);
    });

    it('skips non-EVM balances with NaN rate in totals', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-sol3'] = {
        id: 'account-sol3',
        address: 'SolAcc3',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'Sol3', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-sol3');
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-sol3'] = {
        'solana:mainnet/asset:Y': { amount: '5', unit: 'Y' },
      };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:Y'
      ] = { rate: 'abc', conversionTime: 0 };
      const res = calculateBalanceForAllWallets(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
      );
      expect(res.totalBalanceInUserCurrency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateBalanceChangeForAccountGroup', () => {
    it('eVM path computes previous/current (denom > 0) for group with balances', () => {
      const state = createMobileMockState('USD');
      // Ensure group 1 contains an account with EVM balances (account-2)
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/1'].accounts.push('account-2');

      // Provide 1d percent change for a token that account-2 holds on mainnet
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'].pricePercentChange1d = 10;

      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/1',
        '1d',
      );

      expect(res.currentTotalInUserCurrency).toBeGreaterThan(0);
      expect(res.previousTotalInUserCurrency).toBeGreaterThan(0);
      expect(res.previousTotalInUserCurrency).toBeLessThan(
        res.currentTotalInUserCurrency,
      );
    });
    it('computes 1d change for specified EVM-only group', () => {
      const state = createMobileMockState('USD');
      // attach percent change to one token on mainnet
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = {
        tokenAddress: '0xC0b',
        currency: 'ETH',
        price: 0.00041,
        pricePercentChange1d: 10,
      };
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/1',
        '1d',
      );
      expect(res.userCurrency).toBe('USD');
      expect(res.period).toBe('1d');
      // Non-zero change expected if token balance and price exist
      expect(res.currentTotalInUserCurrency).toBeGreaterThanOrEqual(0);
    });

    it('respects enabledNetworkMap for group', () => {
      const state = createMobileMockState('USD');
      const enabledNetworkMap = {
        eip155: { '0x1': true, '0x89': false },
      } as Record<string, Record<string, boolean>>;
      // Add percent change for a polygon token that should be filtered out
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x89'
      ]['0x1234567890123456789012345678901234567890'] = {
        tokenAddress: '0x123',
        currency: 'MATIC',
        price: 1.25,
        pricePercentChange1d: 15,
      };
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        enabledNetworkMap,
        'entropy:entropy-source-1/0',
        '1d',
      );
      // Polygon chain disabled, so totals should reflect only other enabled chains
      expect(res.currentTotalInUserCurrency).toBeGreaterThanOrEqual(0);
    });

    it('handles non-EVM balances for group', () => {
      const state = createMobileMockState('USD');
      // create a new solana:eoa account inside group 0 and give it a non-evm asset
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-sol'] = {
        id: 'account-sol',
        address: 'SolAcc',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'Sol', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-sol');
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-sol'] = {
        'solana:mainnet/asset:SOL': { amount: '2', unit: 'SOL' },
      };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:SOL'
      ] = {
        rate: '100',
        marketData: { pricePercentChange: { P1D: 5 } },
        conversionTime: 0,
      };
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/0',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBeGreaterThan(0);
      expect(res.amountChangeInUserCurrency).toBeGreaterThanOrEqual(0);
    });

    it('returns zeros when group has no accounts', () => {
      const state = createMobileMockState('USD');
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/999',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBe(0);
      expect(res.previousTotalInUserCurrency).toBe(0);
      expect(res.amountChangeInUserCurrency).toBe(0);
      expect(res.percentChange).toBe(0);
    });

    it('returns zeros when group wallet is missing', () => {
      const state = createMobileMockState('USD');
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'missing-wallet/0',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBe(0);
      expect(res.previousTotalInUserCurrency).toBe(0);
    });

    it('ignores EVM token not in allTokens for group', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).TokenBalancesController.tokenBalances[
        '0x1234567890123456789012345678901234567890'
      ]['0x1']['0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'] = '0x1';
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'] = {
        tokenAddress: '0xEEEE',
        currency: 'ETH',
        price: 1.0,
        pricePercentChange1d: 5,
      } as any;
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/0',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBe(0);
      expect(res.previousTotalInUserCurrency).toBe(0);
    });

    it('ignores invalid hex EVM balance for group', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).TokenBalancesController.tokenBalances[
        '0x1234567890123456789012345678901234567890'
      ]['0x1']['0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = '0xZZZ';
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/0',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBe(0);
      expect(res.previousTotalInUserCurrency).toBe(0);
    });

    it('ignores EVM token when price is missing for group', () => {
      const state = createMobileMockState('USD');
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = {
        tokenAddress: '0xC0b',
        currency: 'ETH',
        pricePercentChange1d: 10,
      } as any;
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/1',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBe(0);
    });

    it('ignores EVM token when native conversion missing for group', () => {
      const state = createMobileMockState('USD');
      (state.engine.backgroundState as any).TokenRatesController.marketData[
        '0x1'
      ]['0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] = {
        tokenAddress: '0xC0b',
        currency: 'ETH',
        price: 1.0,
        pricePercentChange1d: 10,
      } as any;
      delete (state.engine.backgroundState as any).CurrencyRateController
        .currencyRates.ETH;
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/1',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBe(0);
    });

    it('non-EVM group path: continues when account has no balances', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-sol4'] = {
        id: 'account-sol4',
        address: 'SolAcc4',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'Sol4', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-sol4');
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/0',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBeGreaterThanOrEqual(0);
    });

    it('non-EVM group path: disabled chain is skipped', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-sol5'] = {
        id: 'account-sol5',
        address: 'SolAcc5',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'Sol5', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-sol5');
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-sol5'] = {
        'solana:mainnet/asset:Q': { amount: '3', unit: 'Q' },
      };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:Q'
      ] = { rate: '10', marketData: { pricePercentChange: { P1D: 2 } } };
      const enabledNetworkMap = {
        solana: { 'solana:mainnet': false },
      } as Record<string, Record<string, boolean>>;
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        enabledNetworkMap,
        'entropy:entropy-source-1/0',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBeGreaterThanOrEqual(0);
    });

    it('non-EVM group path: skips NaN amount, NaN rate, and denom zero', () => {
      const state = createMobileMockState('USD');
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-sol6'] = {
        id: 'account-sol6',
        address: 'SolAcc6',
        type: 'solana:eoa',
        scopes: ['solana:mainnet'],
        methods: [],
        options: {},
        metadata: { name: 'Sol6', keyring: { type: 'hd' }, importTime: 0 },
      };
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-sol6');
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-sol6'] = {
        'solana:mainnet/asset:R': { amount: 'abc', unit: 'R' },
        'solana:mainnet/asset:S': { amount: '5', unit: 'S' },
        'solana:mainnet/asset:T': { amount: '5', unit: 'T' },
      };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:S'
      ] = { rate: 'abc', marketData: { pricePercentChange: { P1D: 1 } } };
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/asset:T'
      ] = { rate: '10', marketData: { pricePercentChange: { P1D: -100 } } };
      const res = calculateBalanceChangeForAccountGroup(
        state.engine.backgroundState.AccountTreeController as any,
        state.engine.backgroundState.AccountsController as any,
        state.engine.backgroundState.TokenBalancesController as any,
        state.engine.backgroundState.TokenRatesController as any,
        state.engine.backgroundState.MultichainAssetsRatesController as any,
        state.engine.backgroundState.MultichainBalancesController as any,
        state.engine.backgroundState.TokensController as any,
        state.engine.backgroundState.CurrencyRateController as any,
        undefined,
        'entropy:entropy-source-1/0',
        '1d',
      );
      expect(res.currentTotalInUserCurrency).toBeGreaterThanOrEqual(0);
    });
  });
});
