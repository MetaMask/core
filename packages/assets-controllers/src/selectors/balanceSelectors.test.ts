/* eslint-disable @typescript-eslint/no-explicit-any */
import { AccountWalletType, AccountGroupType } from '@metamask/account-api';

import {
  selectBalanceByAccountGroup,
  selectBalanceByWallet,
  selectBalanceForAllWallets,
  selectBalanceForSelectedAccountGroup,
} from './balanceSelectors';

// Base mock state that can be extended for different state structures
const createBaseMockState = (userCurrency = 'USD') => ({
  AccountTreeController: {
    accountTree: {
      wallets: {
        'entropy:entropy-source-1': {
          id: 'entropy:entropy-source-1',
          type: AccountWalletType.Entropy,
          metadata: {
            name: 'Wallet 1',
            entropy: {
              id: 'entropy-source-1',
              index: 0,
            },
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
          options: {},
          metadata: {
            name: 'Account 1',
            keyring: { type: 'hd' },
            importTime: 1234567890,
          },
          scopes: ['eip155:1', 'eip155:89', 'eip155:a4b1'],
          methods: ['eth_sendTransaction', 'eth_signTransaction'],
        },
        'account-2': {
          id: 'account-2',
          address: '0x2345678901234567890123456789012345678901',
          type: 'eip155:eoa',
          options: {},
          metadata: {
            name: 'Account 2',
            keyring: { type: 'hd' },
            importTime: 1234567890,
          },
          scopes: ['eip155:1'],
          methods: ['eth_sendTransaction', 'eth_signTransaction'],
        },
        'account-3': {
          id: 'account-3',
          address: '0x3456789012345678901234567890123456789012',
          type: 'eip155:eoa',
          options: {},
          metadata: {
            name: 'Account 3',
            keyring: { type: 'hd' },
            importTime: 1234567890,
          },
          scopes: ['eip155:1'],
          methods: ['eth_sendTransaction', 'eth_signTransaction'],
        },
      },
      selectedAccount: 'account-1',
    },
  },
  TokenBalancesController: {
    tokenBalances: {
      '0x1234567890123456789012345678901234567890': {
        '0x1': {
          '0x1234567890123456789012345678901234567890': '0x5f5e100', // 100 USDC (6 decimals) = 100000000
          '0x2345678901234567890123456789012345678901': '0xbebc200', // 200 USDT (6 decimals) = 200000000
        },
        '0x89': {
          '0x1234567890123456789012345678901234567890': '0x1dcd6500', // 500 USDC (6 decimals) = 500000000
          '0x2345678901234567890123456789012345678901': '0x3b9aca00', // 1000 USDT (6 decimals) = 1000000000
        },
        '0xa4b1': {
          '0x1234567890123456789012345678901234567890': '0x2faf080', // 50 USDC (6 decimals) = 50000000
          '0x2345678901234567890123456789012345678901': '0x8f0d180', // 150 USDT (6 decimals) = 150000000
        },
      },
      '0x2345678901234567890123456789012345678901': {
        '0x1': {
          '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': '0x56bc75e2d63100000', // 100 DAI (18 decimals)
          '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': '0xde0b6b3a7640000', // 1 WETH (18 decimals)
        },
      },
    },
  },
  TokenRatesController: {
    marketData: {
      '0x1': {
        '0x1234567890123456789012345678901234567890': {
          tokenAddress: '0x1234567890123456789012345678901234567890',
          currency: 'ETH',
          price: 0.00041, // USDC price in ETH (~$1.00 at $2400 ETH)
        },
        '0x2345678901234567890123456789012345678901': {
          tokenAddress: '0x2345678901234567890123456789012345678901',
          currency: 'ETH',
          price: 0.00041, // USDT price in ETH (~$1.00 at $2400 ETH)
        },
        '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': {
          tokenAddress: '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1',
          currency: 'ETH',
          price: 0.00041, // DAI price in ETH (~$1.00 at $2400 ETH)
        },
        '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': {
          tokenAddress: '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1',
          currency: 'ETH',
          price: 1.0, // WETH price in ETH (1:1)
        },
      },
      '0x89': {
        '0x1234567890123456789012345678901234567890': {
          tokenAddress: '0x1234567890123456789012345678901234567890',
          currency: 'MATIC',
          price: 1.25, // USDC price in MATIC (~$1.00 at $0.80 MATIC)
        },
        '0x2345678901234567890123456789012345678901': {
          tokenAddress: '0x2345678901234567890123456789012345678901',
          currency: 'MATIC',
          price: 1.25, // USDT price in MATIC (~$1.00 at $0.80 MATIC)
        },
      },
      '0xa4b1': {
        '0x1234567890123456789012345678901234567890': {
          tokenAddress: '0x1234567890123456789012345678901234567890',
          currency: 'ARB',
          price: 0.91, // USDC price in ARB (~$1.00 at $1.10 ARB)
        },
        '0x2345678901234567890123456789012345678901': {
          tokenAddress: '0x2345678901234567890123456789012345678901',
          currency: 'ARB',
          price: 0.91, // USDT price in ARB (~$1.00 at $1.10 ARB)
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
            name: 'Dai Stablecoin',
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
            name: 'Dai Stablecoin',
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
  MultichainAssetsRatesController: {
    conversionRates: {},
  },
  MultichainBalancesController: {
    balances: {},
  },
  CurrencyRateController: {
    currentCurrency: userCurrency,
    currencyRates: {
      ETH: {
        conversionRate: 2400, // 1 ETH = 2400 USD
        usdConversionRate: 2400,
      },
      MATIC: {
        conversionRate: 0.8, // 1 MATIC = 0.8 USD
        usdConversionRate: 0.8,
      },
      ARB: {
        conversionRate: 1.1, // 1 ARB = 1.1 USD
        usdConversionRate: 1.1,
      },
    },
  },
});

// Mobile state structure: state.engine.backgroundState.ControllerName
const createMobileMockState = (userCurrency = 'USD') => ({
  engine: {
    backgroundState: createBaseMockState(userCurrency),
  },
});

// Extension state structure: state.metamask.ControllerName
const createExtensionMockState = (userCurrency = 'USD') => ({
  metamask: createBaseMockState(userCurrency),
});

// Flat state structure (default assets-controllers): state.ControllerName
const createFlatMockState = (userCurrency = 'USD') =>
  createBaseMockState(userCurrency);

// Default mock state (mobile structure)
const createMockState = createMobileMockState;

describe('selectors', () => {
  describe('selectBalanceByAccountGroup', () => {
    it('returns total balance for a specific account group in USD', () => {
      const state = createMockState('USD');

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
        state,
      );

      /*
       * CALCULATION (Direct Conversion):
       * Group 0 has 2 accounts: account-1 and account-2
       *
       * Account 1 (Ethereum 0x1):
       * - 100 USDC: 100 * 0.00041 ETH * $2400/ETH = $98.40
       * - 200 USDT: 200 * 0.00041 ETH * $2400/ETH = $196.80
       *
       * Account 1 (Polygon 0x89):
       * - 500 USDC: 500 * 1.25 MATIC * $0.8/MATIC = $500.00
       * - 1000 USDT: 1000 * 1.25 MATIC * $0.8/MATIC = $1000.00
       *
       * Account 1 (Arbitrum 0xa4b1):
       * - 50 USDC: 50 * 0.91 ARB * $1.1/ARB = $50.05
       * - 150 USDT: 150 * 0.91 ARB * $1.1/ARB = $150.15
       *
       * Account 2 (Ethereum 0x1):
       * - 100 DAI: 100 * 0.00041 ETH * $2400/ETH = $98.40
       * - 1 WETH: 1 * 1.0 ETH * $2400/ETH = $2400.00
       *
       * Total: $98.40 + $196.80 + $500.00 + $1000.00 + $50.05 + $150.15 + $98.40 + $2400.00 = $4493.80
       */
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groupId: 'entropy:entropy-source-1/0',
        totalBalanceInUserCurrency: 4493.8,
        userCurrency: 'USD',
      });
    });

    it('returns total balance for a specific account group in EUR', () => {
      const state = createMockState('EUR');
      // Set EUR conversion rate: 1 USD = 0.85 EUR
      state.engine.backgroundState.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
        state,
      );

      /*
       * CALCULATION (Direct Conversion):
       * Same token amounts as above, but converted directly to EUR:
       *
       * Account 1 (Ethereum 0x1):
       * - 100 USDC: 100 * 0.00041 ETH * 2040 EUR/ETH = 83.64 EUR
       * - 200 USDT: 200 * 0.00041 ETH * 2040 EUR/ETH = 167.28 EUR
       *
       * Account 1 (Polygon 0x89):
       * - 500 USDC: 500 * 1.25 MATIC * 0.68 EUR/MATIC = 425.00 EUR
       * - 1000 USDT: 1000 * 1.25 MATIC * 0.68 EUR/MATIC = 850.00 EUR
       *
       * Account 1 (Arbitrum 0xa4b1):
       * - 50 USDC: 50 * 0.91 ARB * 0.935 EUR/ARB = 42.54 EUR
       * - 150 USDT: 150 * 0.91 ARB * 0.935 EUR/ARB = 127.63 EUR
       *
       * Account 2 (Ethereum 0x1):
       * - 100 DAI: 100 * 0.00041 ETH * 2040 EUR/ETH = 83.64 EUR
       * - 1 WETH: 1 * 1.0 ETH * 2040 EUR/ETH = 2040.00 EUR
       *
       * Total: 83.64 + 167.28 + 425.00 + 850.00 + 42.54 + 127.63 + 83.64 + 2040.00 = 3819.73 EUR
       */
      expect(result.walletId).toBe('entropy:entropy-source-1');
      expect(result.groupId).toBe('entropy:entropy-source-1/0');
      expect(result.totalBalanceInUserCurrency).toBeCloseTo(3819.73, 2);
      expect(result.userCurrency).toBe('EUR');
    });

    it('returns total balance for a specific account group in GBP', () => {
      const state = createMockState('GBP');
      // Set GBP conversion rate: 1 USD = 0.75 GBP
      state.engine.backgroundState.CurrencyRateController.currencyRates.ETH.conversionRate = 1800; // 1 ETH = 1800 GBP (2400 * 0.75)
      state.engine.backgroundState.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.6; // 1 MATIC = 0.6 GBP (0.8 * 0.75)
      state.engine.backgroundState.CurrencyRateController.currencyRates.ARB.conversionRate = 0.825; // 1 ARB = 0.825 GBP (1.1 * 0.75)

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
        state,
      );

      /*
       * CALCULATION (Direct Conversion):
       * Same token amounts as above, but converted directly to GBP:
       *
       * Account 1 (Ethereum 0x1):
       * - 100 USDC: 100 * 0.00041 ETH * 1800 GBP/ETH = 73.80 GBP
       * - 200 USDT: 200 * 0.00041 ETH * 1800 GBP/ETH = 147.60 GBP
       *
       * Account 1 (Polygon 0x89):
       * - 500 USDC: 500 * 1.25 MATIC * 0.6 GBP/MATIC = 375.00 GBP
       * - 1000 USDT: 1000 * 1.25 MATIC * 0.6 GBP/MATIC = 750.00 GBP
       *
       * Account 1 (Arbitrum 0xa4b1):
       * - 50 USDC: 50 * 0.91 ARB * 0.825 GBP/ARB = 37.54 GBP
       * - 150 USDT: 150 * 0.91 ARB * 0.825 GBP/ARB = 112.61 GBP
       *
       * Account 2 (Ethereum 0x1):
       * - 100 DAI: 100 * 0.00041 ETH * 1800 GBP/ETH = 73.80 GBP
       * - 1 WETH: 1 * 1.0 ETH * 1800 GBP/ETH = 1800.00 GBP
       *
       * Total: 73.80 + 147.60 + 375.00 + 750.00 + 37.54 + 112.61 + 73.80 + 1800.00 = 3370.35 GBP
       */
      expect(result.walletId).toBe('entropy:entropy-source-1');
      expect(result.groupId).toBe('entropy:entropy-source-1/0');
      expect(result.totalBalanceInUserCurrency).toBeCloseTo(3370.35, 2);
      expect(result.userCurrency).toBe('GBP');
    });

    it('returns total balance for mixed EVM and non-EVM accounts in EUR', () => {
      const state = createMockState('EUR');
      // Set EUR conversion rate: 1 USD = 0.85 EUR
      state.engine.backgroundState.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

      // Add a non-EVM account to the test state
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-4'] = {
        id: 'account-4',
        address: 'FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc',
        type: 'solana:eoa',
        options: {},
        metadata: {
          name: 'Solana Account',
          keyring: { type: 'hd' },
          importTime: 1234567890,
        },
        scopes: ['solana:mainnet'],
        methods: ['solana_signTransaction', 'solana_signMessage'],
      };

      // Add the account to group 0
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-4');

      // Add non-EVM balance data
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-4'] = {
        'solana:mainnet/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc': {
          amount: '50.0',
          unit: 'SOL',
        },
      };

      // Add conversion rate for SOL (already in user currency)
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc'
      ] = {
        rate: '50.0',
        conversionTime: 1234567890,
      };

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
        state,
      );

      /**
       * Expected calculation:
       * EVM balances: 3,819.73 EUR (from previous test)
       * Non-EVM balance: 50.0 SOL * 50.0 EUR/SOL = 2,500.00 EUR
       * Total: 3,819.73 + 2,500.00 = 6,319.73 EUR
       */
      expect(result.walletId).toBe('entropy:entropy-source-1');
      expect(result.groupId).toBe('entropy:entropy-source-1/0');
      expect(result.totalBalanceInUserCurrency).toBeCloseTo(6319.73, 2);
      expect(result.userCurrency).toBe('EUR');
    });

    it('returns total balance for non-EVM accounts only in EUR', () => {
      const state = createMockState('EUR');
      // Set EUR conversion rate: 1 USD = 0.85 EUR
      state.engine.backgroundState.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

      // Create a new group with only non-EVM accounts
      (
        state.engine.backgroundState as any
      ).AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/2'] = {
        id: 'entropy:entropy-source-1/2',
        type: AccountGroupType.MultichainAccount,
        accounts: ['account-5'],
        metadata: {
          name: 'Non-EVM Group',
          pinned: false,
          hidden: false,
          entropy: { groupIndex: 2 },
        },
      };

      // Add non-EVM account
      (
        state.engine.backgroundState as any
      ).AccountsController.internalAccounts.accounts['account-5'] = {
        id: 'account-5',
        address: 'FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc',
        type: 'solana:eoa',
        options: {},
        metadata: {
          name: 'Solana Account',
          keyring: { type: 'hd' },
          importTime: 1234567890,
        },
        scopes: ['solana:mainnet'],
        methods: ['solana_signTransaction', 'solana_signMessage'],
      };

      // Add non-EVM balance data
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-5'] = {
        'solana:mainnet/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc': {
          amount: '25.0',
          unit: 'SOL',
        },
      };

      // Add conversion rate for SOL (already in user currency)
      (
        state.engine.backgroundState as any
      ).MultichainAssetsRatesController.conversionRates[
        'solana:mainnet/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc'
      ] = {
        rate: '50.0',
        conversionTime: 1234567890,
      };

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/2')(
        state,
      );

      /**
       * Expected calculation:
       * Non-EVM balance: 25.0 SOL * 50.0 EUR/SOL = 1,250.00 EUR
       */
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groupId: 'entropy:entropy-source-1/2',
        totalBalanceInUserCurrency: 1250.0,
        userCurrency: 'EUR',
      });
    });

    it('returns zero balance for non-existent account group', () => {
      const state = createMockState('USD');

      const result = selectBalanceByAccountGroup('non-existent-group')(state);

      expect(result).toStrictEqual({
        walletId: 'non-existent-group',
        groupId: 'non-existent-group',
        totalBalanceInUserCurrency: 0,
        userCurrency: 'USD',
      });
    });

    it('falls back to zero when no conversion rate is available', () => {
      const state = createMockState('EUR');
      // Remove conversion rates
      (
        state.engine.backgroundState as any
      ).CurrencyRateController.currencyRates.ETH.conversionRate = null;
      (
        state.engine.backgroundState as any
      ).CurrencyRateController.currencyRates.MATIC.conversionRate = null;
      (
        state.engine.backgroundState as any
      ).CurrencyRateController.currencyRates.ARB.conversionRate = null;

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
        state,
      );

      // Should return zero when no conversion rate is available
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groupId: 'entropy:entropy-source-1/0',
        totalBalanceInUserCurrency: 0, // Zero when no conversion rate available
        userCurrency: 'EUR',
      });
    });

    it('handles malformed balance values gracefully by skipping them', () => {
      const state = createMockState('USD');

      // Add malformed balance data that would result in NaN
      (
        state.engine.backgroundState as any
      ).TokenBalancesController.tokenBalances[
        '0x1234567890123456789012345678901234567890'
      ]['0x1']['0xA0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] =
        'invalid_hex_string' as `0x${string}`;

      // Add another malformed balance for non-EVM account
      (
        state.engine.backgroundState as any
      ).MultichainBalancesController.balances['account-1'] = {
        'eip155:1/slip44:60': {
          amount: 'invalid_number',
          unit: 'ETH',
        },
      };

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
        state,
      );

      // Should still return a valid result, skipping the malformed values
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groupId: 'entropy:entropy-source-1/0',
        totalBalanceInUserCurrency: 4493.8, // Should be the same as valid case
        userCurrency: 'USD',
      });
    });
  });

  describe('selectBalanceByWallet', () => {
    it('returns total balance for all account groups in a wallet in USD', () => {
      const state = createMockState('USD');

      const result = selectBalanceByWallet('entropy:entropy-source-1')(state);

      /*
       * CALCULATION:
       * Wallet has 2 groups: group-0 and group-1
       *
       * Group 0 (from previous test): $4,493.80
       *
       * Group 1 (account-3 only):
       * - No token balances defined for account-3
       * - Total: $0
       *
       * Total: $4,493.80 + $0 = $4,493.80
       */
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groups: {
          'entropy:entropy-source-1/0': {
            walletId: 'entropy:entropy-source-1',
            groupId: 'entropy:entropy-source-1/0',
            totalBalanceInUserCurrency: 4493.8,
            userCurrency: 'USD',
          },
          'entropy:entropy-source-1/1': {
            walletId: 'entropy:entropy-source-1',
            groupId: 'entropy:entropy-source-1/1',
            totalBalanceInUserCurrency: 0,
            userCurrency: 'USD',
          },
        },
        totalBalanceInUserCurrency: 4493.8,
        userCurrency: 'USD',
      });
    });

    it('returns total balance for all account groups in a wallet in EUR', () => {
      const state = createMockState('EUR');
      // Set EUR conversion rate: 1 USD = 0.85 EUR
      state.engine.backgroundState.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

      const result = selectBalanceByWallet('entropy:entropy-source-1')(state);

      /*
       * CALCULATION (Direct Conversion):
       * Same EUR calculation as above: 3,819.73 EUR
       * Group 1 has no balances, so total remains 3,819.73 EUR
       */
      expect(result.walletId).toBe('entropy:entropy-source-1');
      expect(result.groups['entropy:entropy-source-1/0'].walletId).toBe(
        'entropy:entropy-source-1',
      );
      expect(result.groups['entropy:entropy-source-1/0'].groupId).toBe(
        'entropy:entropy-source-1/0',
      );
      expect(
        result.groups['entropy:entropy-source-1/0'].totalBalanceInUserCurrency,
      ).toBeCloseTo(3819.73, 2);
      expect(result.groups['entropy:entropy-source-1/0'].userCurrency).toBe(
        'EUR',
      );
      expect(
        result.groups['entropy:entropy-source-1/1'].totalBalanceInUserCurrency,
      ).toBe(0);
      expect(result.groups['entropy:entropy-source-1/1'].userCurrency).toBe(
        'EUR',
      );
      expect(result.totalBalanceInUserCurrency).toBeCloseTo(3819.73, 2);
      expect(result.userCurrency).toBe('EUR');
    });

    it('returns zero balance for non-existent wallet', () => {
      const state = createMockState('USD');

      const result = selectBalanceByWallet('non-existent-wallet')(state);

      expect(result).toStrictEqual({
        walletId: 'non-existent-wallet',
        groups: {},
        totalBalanceInUserCurrency: 0,
        userCurrency: 'USD',
      });
    });
  });

  describe('selectBalanceForAllWallets', () => {
    it('returns total balance for all wallets in USD', () => {
      const state = createMockState('USD');

      const result = selectBalanceForAllWallets()(state);

      /*
       * CALCULATION:
       * Only one wallet: entropy:entropy-source-1
       * Wallet total: $4,493.80 (from previous test)
       *
       * Total: $4,493.80
       */
      expect(result).toStrictEqual({
        wallets: {
          'entropy:entropy-source-1': {
            walletId: 'entropy:entropy-source-1',
            groups: {
              'entropy:entropy-source-1/0': {
                walletId: 'entropy:entropy-source-1',
                groupId: 'entropy:entropy-source-1/0',
                totalBalanceInUserCurrency: 4493.8,
                userCurrency: 'USD',
              },
              'entropy:entropy-source-1/1': {
                walletId: 'entropy:entropy-source-1',
                groupId: 'entropy:entropy-source-1/1',
                totalBalanceInUserCurrency: 0,
                userCurrency: 'USD',
              },
            },
            totalBalanceInUserCurrency: 4493.8,
            userCurrency: 'USD',
          },
        },
        totalBalanceInUserCurrency: 4493.8,
        userCurrency: 'USD',
      });
    });

    it('returns total balance for all wallets in EUR', () => {
      const state = createMockState('EUR');
      // Set EUR conversion rate: 1 USD = 0.85 EUR
      state.engine.backgroundState.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.engine.backgroundState.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

      const result = selectBalanceForAllWallets()(state);

      /*
       * CALCULATION (Direct Conversion):
       * Same EUR calculation as above: 3,819.73 EUR
       */
      expect(result.wallets['entropy:entropy-source-1'].walletId).toBe(
        'entropy:entropy-source-1',
      );
      expect(
        result.wallets['entropy:entropy-source-1'].groups[
          'entropy:entropy-source-1/0'
        ].totalBalanceInUserCurrency,
      ).toBeCloseTo(3819.73, 2);
      expect(
        result.wallets['entropy:entropy-source-1'].groups[
          'entropy:entropy-source-1/1'
        ].totalBalanceInUserCurrency,
      ).toBe(0);
      expect(
        result.wallets['entropy:entropy-source-1'].totalBalanceInUserCurrency,
      ).toBeCloseTo(3819.73, 2);
      expect(result.totalBalanceInUserCurrency).toBeCloseTo(3819.73, 2);
      expect(result.userCurrency).toBe('EUR');
    });

    it('returns total balance for the selected account group in EUR', () => {
      const state = createMockState('EUR');
      // Set EUR conversion rate: 1 USD = 0.85 EUR
      (
        state.engine.backgroundState as any
      ).CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      (
        state.engine.backgroundState as any
      ).CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      (
        state.engine.backgroundState as any
      ).CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

      const result = selectBalanceForSelectedAccountGroup()(state);

      /*
       * CALCULATION (Direct Conversion):
       * Same EUR calculation as above: 3,819.73 EUR
       */
      expect(result).not.toBeNull();
      expect(result?.walletId).toBe('entropy:entropy-source-1');
      expect(result?.groupId).toBe('entropy:entropy-source-1/0');
      expect(result?.totalBalanceInUserCurrency).toBeCloseTo(3819.73, 2);
      expect(result?.userCurrency).toBe('EUR');
    });

    it('returns null when no account group is selected', () => {
      const state = createMockState('USD');
      state.engine.backgroundState.AccountTreeController.accountTree.selectedAccountGroup =
        '';

      const result = selectBalanceForSelectedAccountGroup()(state);

      expect(result).toBeNull();
    });
  });
});

describe('memoization behavior', () => {
  it('memoizes selectBalanceByAccountGroup results', () => {
    const state = createMockState('USD');
    const selector = selectBalanceByAccountGroup('entropy:entropy-source-1/0');

    const result1 = selector(state);
    const result2 = selector(state);
    const result3 = selector({ ...state }); // New state object with same values

    expect(result1).toBe(result2); // Same reference for same state
    expect(result1).toBe(result3); // Same reference for different state object with same values
  });

  it('memoizes selectBalanceByWallet results', () => {
    const state = createMockState('USD');
    const selector = selectBalanceByWallet('entropy:entropy-source-1');

    const result1 = selector(state);
    const result2 = selector(state);
    const result3 = selector({ ...state }); // New state object with same values

    expect(result1).toBe(result2); // Same reference for same state
    expect(result1).toBe(result3); // Same reference for different state object with same values
  });

  it('memoizes selectBalanceForAllWallets results', () => {
    const state = createMockState('USD');
    const selector = selectBalanceForAllWallets();

    const result1 = selector(state);
    const result2 = selector(state);
    const result3 = selector({ ...state }); // New state object with same values

    expect(result1).toBe(result2); // Same reference for same state
    expect(result1).toBe(result3); // Same reference for different state object with same values
  });

  it('memoizes selectBalanceForSelectedAccountGroup results', () => {
    const state = createMockState('USD');
    const selector = selectBalanceForSelectedAccountGroup();

    const result1 = selector(state);
    const result2 = selector(state);
    const result3 = selector({ ...state }); // New state object with same values

    expect(result1).toBe(result2); // Same reference for same state
    expect(result1).toBe(result3); // Same reference for different state object with same values
  });

  it('returns different references when state values change', () => {
    const state1 = createMockState('USD');
    const state2 = createMockState('EUR'); // Different currency
    const selector = selectBalanceForAllWallets();

    const result1 = selector(state1);
    const result2 = selector(state2);

    expect(result1).not.toBe(result2); // Different references for different values
  });
});

describe('state structure compatibility', () => {
  it('works with mobile state structure', () => {
    const mobileState = createMobileMockState('USD');

    const result = selectBalanceForSelectedAccountGroup()(mobileState);

    expect(result).toBeDefined();
    expect(result?.walletId).toBe('entropy:entropy-source-1');
    expect(result?.groupId).toBe('entropy:entropy-source-1/0');
  });

  it('works with extension state structure', () => {
    const extensionState = createExtensionMockState('USD');

    const result = selectBalanceForSelectedAccountGroup()(extensionState);

    expect(result).toBeDefined();
    expect(result?.walletId).toBe('entropy:entropy-source-1');
    expect(result?.groupId).toBe('entropy:entropy-source-1/0');
  });

  it('works with flat state structure (default assets-controllers)', () => {
    const flatState = createFlatMockState('USD');

    const result = selectBalanceForSelectedAccountGroup()(flatState);

    expect(result).toBeDefined();
    expect(result?.walletId).toBe('entropy:entropy-source-1');
    expect(result?.groupId).toBe('entropy:entropy-source-1/0');
  });
});

describe('edge cases and error handling', () => {
  it('handles missing controller state gracefully', () => {
    const state = createMockState('USD');
    // Set TokenBalancesController to have empty structure instead of undefined
    (state.engine.backgroundState as any).TokenBalancesController = {
      tokenBalances: {},
    };

    const result = selectBalanceForAllWallets()(state);

    // Should still return a valid structure even with empty controller
    expect(result).toBeDefined();
    expect(result.wallets).toBeDefined();
    expect(result.totalBalanceInUserCurrency).toBe(0);
    expect(result.userCurrency).toBe('USD');
  });

  it('handles NaN balance values in EVM accounts', () => {
    const state = createMockState('USD');

    // Add a balance that will result in NaN when parsed
    (state.engine.backgroundState as any).TokenBalancesController.tokenBalances[
      '0x1234567890123456789012345678901234567890'
    ]['0x1']['0xNaNToken'] = '0xinvalid' as `0x${string}`;

    // Add corresponding token with invalid decimals
    (state.engine.backgroundState as any).TokensController.allTokens['0x1'][
      '0x1234567890123456789012345678901234567890'
    ].push({
      address: '0xNaNToken',
      decimals: 'invalid' as any, // This will cause NaN in calculation
      symbol: 'NAN',
      name: 'NaN Token',
    });

    const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
      state,
    );

    // Should skip the NaN balance and return valid result
    expect(result.totalBalanceInUserCurrency).toBe(4493.8);
  });

  it('handles NaN balance values in non-EVM accounts', () => {
    const state = createMockState('USD');

    // Add non-EVM account with invalid balance
    (
      state.engine.backgroundState as any
    ).AccountsController.internalAccounts.accounts['account-6'] = {
      id: 'account-6',
      address: 'FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc',
      type: 'solana:eoa',
      options: {},
      metadata: {
        name: 'Solana Account',
        keyring: { type: 'hd' },
        importTime: 1234567890,
      },
      scopes: ['solana:mainnet'],
      methods: ['solana_signTransaction', 'solana_signMessage'],
    };

    // Add the account to group 0
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets[
      'entropy:entropy-source-1'
    ].groups['entropy:entropy-source-1/0'].accounts.push('account-6');

    // Add invalid balance data that will result in NaN
    (state.engine.backgroundState as any).MultichainBalancesController.balances[
      'account-6'
    ] = {
      'solana:mainnet/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc': {
        amount: 'not_a_number',
        unit: 'SOL',
      },
    };

    const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
      state,
    );

    // Should skip the NaN balance and return valid result
    expect(result.totalBalanceInUserCurrency).toBe(4493.8);
  });

  it('handles NaN conversion rate values in non-EVM accounts', () => {
    const state = createMockState('USD');

    // Add non-EVM account
    (
      state.engine.backgroundState as any
    ).AccountsController.internalAccounts.accounts['account-7'] = {
      id: 'account-7',
      address: 'FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc',
      type: 'solana:eoa',
      options: {},
      metadata: {
        name: 'Solana Account',
        keyring: { type: 'hd' },
        importTime: 1234567890,
      },
      scopes: ['solana:mainnet'],
      methods: ['solana_signTransaction', 'solana_signMessage'],
    };

    // Add the account to group 0
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets[
      'entropy:entropy-source-1'
    ].groups['entropy:entropy-source-1/0'].accounts.push('account-7');

    // Add valid balance data
    (state.engine.backgroundState as any).MultichainBalancesController.balances[
      'account-7'
    ] = {
      'solana:mainnet/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc': {
        amount: '10.0',
        unit: 'SOL',
      },
    };

    // Add invalid conversion rate that will result in NaN
    (
      state.engine.backgroundState as any
    ).MultichainAssetsRatesController.conversionRates[
      'solana:mainnet/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc'
    ] = {
      rate: 'not_a_number',
      conversionTime: 1234567890,
    };

    const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
      state,
    );

    // Should skip the NaN conversion rate and return valid result
    expect(result.totalBalanceInUserCurrency).toBe(4493.8);
  });

  it('handles missing wallet in selectBalanceForSelectedAccountGroup', () => {
    const state = createMockState('USD');

    // Set selected account group to a non-existent wallet
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.selectedAccountGroup =
      'non-existent-wallet/0';

    const result = selectBalanceForSelectedAccountGroup()(state);

    expect(result).toStrictEqual({
      walletId: 'non-existent-wallet',
      groupId: 'non-existent-wallet/0',
      totalBalanceInUserCurrency: 0,
      userCurrency: 'USD',
    });
  });

  it('handles missing group in selectBalanceForSelectedAccountGroup', () => {
    const state = createMockState('USD');

    // Set selected account group to a non-existent group in existing wallet
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.selectedAccountGroup =
      'entropy:entropy-source-1/999';

    const result = selectBalanceForSelectedAccountGroup()(state);

    expect(result).toStrictEqual({
      walletId: 'entropy:entropy-source-1',
      groupId: 'entropy:entropy-source-1/999',
      totalBalanceInUserCurrency: 0,
      userCurrency: 'USD',
    });
  });

  it('handles empty groups in wallet', () => {
    const state = createMockState('USD');

    // Add a wallet with no groups
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets['empty-wallet'] = {
      id: 'empty-wallet',
      type: AccountWalletType.Entropy,
      metadata: {
        name: 'Empty Wallet',
        entropy: {
          id: 'empty-source',
          index: 0,
        },
      },
      groups: {},
    };

    const result = selectBalanceForAllWallets()(state);

    // Should include the empty wallet with zero balance
    expect(result.wallets['empty-wallet']).toBeDefined();
    expect(result.wallets['empty-wallet'].totalBalanceInUserCurrency).toBe(0);
    expect(result.wallets['empty-wallet'].groups).toStrictEqual({});
  });

  it('handles groups with no accounts', () => {
    const state = createMockState('USD');

    // Add a group with no accounts
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets[
      'entropy:entropy-source-1'
    ].groups['entropy:entropy-source-1/empty'] = {
      id: 'entropy:entropy-source-1/empty',
      type: AccountGroupType.MultichainAccount,
      accounts: [], // Empty accounts array
      metadata: {
        name: 'Empty Group',
        pinned: false,
        hidden: false,
        entropy: { groupIndex: 999 },
      },
    };

    const result = selectBalanceByAccountGroup(
      'entropy:entropy-source-1/empty',
    )(state);

    expect(result).toStrictEqual({
      walletId: 'entropy:entropy-source-1',
      groupId: 'entropy:entropy-source-1/empty',
      totalBalanceInUserCurrency: 0,
      userCurrency: 'USD',
    });
  });

  it('handles missing token in TokensController state', () => {
    const state = createMockState('USD');

    // Add a balance for a token that doesn't exist in TokensController
    (state.engine.backgroundState as any).TokenBalancesController.tokenBalances[
      '0x1234567890123456789012345678901234567890'
    ]['0x1']['0xMissingToken'] = '0x5f5e100' as `0x${string}`;

    const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
      state,
    );

    // Should skip the missing token and return valid result
    expect(result.totalBalanceInUserCurrency).toBe(4493.8);
  });

  it('handles missing market data for tokens', () => {
    const state = createMockState('USD');

    // Add a token without market data
    (state.engine.backgroundState as any).TokensController.allTokens['0x1'][
      '0x1234567890123456789012345678901234567890'
    ].push({
      address: '0xNoMarketData',
      decimals: 18,
      symbol: 'NMD',
      name: 'No Market Data Token',
    });

    // Add balance for the token
    (state.engine.backgroundState as any).TokenBalancesController.tokenBalances[
      '0x1234567890123456789012345678901234567890'
    ]['0x1']['0xNoMarketData'] = '0x5f5e100' as `0x${string}`;

    const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
      state,
    );

    // Should skip the token without market data and return valid result
    expect(result.totalBalanceInUserCurrency).toBe(4493.8);
  });

  it('handles missing conversion rates for native currencies', () => {
    const state = createMockState('USD');

    // Remove conversion rates
    delete (state.engine.backgroundState as any).CurrencyRateController
      .currencyRates.ETH;
    delete (state.engine.backgroundState as any).CurrencyRateController
      .currencyRates.MATIC;
    delete (state.engine.backgroundState as any).CurrencyRateController
      .currencyRates.ARB;

    const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
      state,
    );

    // Should return zero when no conversion rates are available
    expect(result).toStrictEqual({
      walletId: 'entropy:entropy-source-1',
      groupId: 'entropy:entropy-source-1/0',
      totalBalanceInUserCurrency: 0,
      userCurrency: 'USD',
    });
  });

  it('handles accounts with missing account data', () => {
    const state = createMockState('USD');

    // Add an account ID to a group but don't add the actual account data
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets[
      'entropy:entropy-source-1'
    ].groups['entropy:entropy-source-1/0'].accounts.push('missing-account');

    const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
      state,
    );

    // Should filter out missing accounts and return valid result
    expect(result.totalBalanceInUserCurrency).toBe(4493.8);
  });

  it('handles wallet with no groups property', () => {
    const state = createMockState('USD');

    // Add a wallet with undefined groups property
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets['undefined-groups-wallet'] = {
      id: 'undefined-groups-wallet',
      type: AccountWalletType.Entropy,
      metadata: {
        name: 'Undefined Groups Wallet',
        entropy: {
          id: 'undefined-groups-source',
          index: 0,
        },
      },
      groups: undefined, // This will trigger the fallback
    };

    const result = selectBalanceForAllWallets()(state);

    // Should handle undefined groups property
    expect(result.wallets['undefined-groups-wallet']).toBeDefined();
    expect(
      result.wallets['undefined-groups-wallet'].totalBalanceInUserCurrency,
    ).toBe(0);
    expect(result.wallets['undefined-groups-wallet'].groups).toStrictEqual({});
  });

  it('handles missing wallet in getInternalAccountsForGroup', () => {
    const state = createMockState('USD');

    // Remove the wallet to test the wallet not found case (line 189)
    delete (state.engine.backgroundState as any).AccountTreeController
      .accountTree.wallets['entropy:entropy-source-1'];

    const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
      state,
    );

    // Should return zero balance when wallet doesn't exist
    expect(result).toStrictEqual({
      walletId: 'entropy:entropy-source-1',
      groupId: 'entropy:entropy-source-1/0',
      totalBalanceInUserCurrency: 0,
      userCurrency: 'USD',
    });
  });

  it('handles missing group in getInternalAccountsForGroup', () => {
    const state = createMockState('USD');

    // Remove the group to test the group not found case (line 194)
    delete (state.engine.backgroundState as any).AccountTreeController
      .accountTree.wallets['entropy:entropy-source-1'].groups[
      'entropy:entropy-source-1/0'
    ];

    const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
      state,
    );

    // Should return zero balance when group doesn't exist
    expect(result).toStrictEqual({
      walletId: 'entropy:entropy-source-1',
      groupId: 'entropy:entropy-source-1/0',
      totalBalanceInUserCurrency: 0,
      userCurrency: 'USD',
    });
  });

  it('handles missing wallet in selectBalanceForAllWallets', () => {
    const state = createMockState('USD');

    // Add a wallet with no groups to test the wallet.groups || {} fallback (line 249)
    (
      state.engine.backgroundState as any
    ).AccountTreeController.accountTree.wallets['no-groups-wallet'] = {
      id: 'no-groups-wallet',
      type: AccountWalletType.Entropy,
      metadata: {
        name: 'No Groups Wallet',
        entropy: {
          id: 'no-groups-source',
          index: 0,
        },
      },
      // No groups property - should use fallback
    };

    const result = selectBalanceForAllWallets()(state);

    // Should handle wallet with no groups property
    expect(result.wallets['no-groups-wallet']).toBeDefined();
    expect(result.wallets['no-groups-wallet'].totalBalanceInUserCurrency).toBe(
      0,
    );
    expect(result.wallets['no-groups-wallet'].groups).toStrictEqual({});
  });
});
