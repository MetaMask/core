import { AccountWalletType, AccountGroupType } from '@metamask/account-api';

import {
  selectBalanceByAccountGroup,
  selectBalanceByWallet,
  selectBalanceForAllWallets,
  selectBalanceForSelectedAccountGroup,
} from './balanceSelectors';
import { getDefaultMultichainAssetsRatesControllerState } from '../MultichainAssetsRatesController';
import { getDefaultTokenBalancesState } from '../TokenBalancesController';
import { getDefaultTokenRatesControllerState } from '../TokenRatesController';
import type { MarketDataDetails } from '../TokenRatesController';
import { getDefaultTokensState } from '../TokensController';
import type { AssetsSelectorState } from '../utils/stateAdapter';

const createMockState = (userCurrency = 'USD'): AssetsSelectorState => ({
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
          scopes: ['eip155:1'],
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
    ...getDefaultTokenBalancesState(),
    tokenBalances: {
      '0x1': {
        '0x1234567890123456789012345678901234567890': {
          '0x1234567890123456789012345678901234567890': '0x5f5e100', // 100 USDC (6 decimals) = 100000000
          '0x2345678901234567890123456789012345678901': '0xbebc200', // 200 USDT (6 decimals) = 200000000
        },
        '0x2345678901234567890123456789012345678901': {
          '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': '0x56bc75e2d63100000', // 100 DAI (18 decimals)
          '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': '0xde0b6b3a7640000', // 1 WETH (18 decimals)
        },
      },
      '0x89': {
        '0x1234567890123456789012345678901234567890': {
          '0x1234567890123456789012345678901234567890': '0x1dcd6500', // 500 USDC (6 decimals) = 500000000
          '0x2345678901234567890123456789012345678901': '0x3b9aca00', // 1000 USDT (6 decimals) = 1000000000
        },
      },
      '0xa4b1': {
        '0x1234567890123456789012345678901234567890': {
          '0x1234567890123456789012345678901234567890': '0x2faf080', // 50 USDC (6 decimals) = 50000000
          '0x2345678901234567890123456789012345678901': '0x8f0d180', // 150 USDT (6 decimals) = 150000000
        },
      },
    },
  },
  TokenRatesController: {
    ...getDefaultTokenRatesControllerState(),
    marketData: {
      '0x1': {
        '0x1234567890123456789012345678901234567890': {
          tokenAddress: '0x1234567890123456789012345678901234567890',
          currency: 'ETH',
          price: 0.00041, // USDC price in ETH (~$1.00 at $2400 ETH)
        } as unknown as MarketDataDetails,
        '0x2345678901234567890123456789012345678901': {
          tokenAddress: '0x2345678901234567890123456789012345678901',
          currency: 'ETH',
          price: 0.00041, // USDT price in ETH (~$1.00 at $2400 ETH)
        } as unknown as MarketDataDetails,
        '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': {
          tokenAddress: '0xC0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1',
          currency: 'ETH',
          price: 0.00041, // DAI price in ETH (~$1.00 at $2400 ETH)
        } as unknown as MarketDataDetails,
        '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1': {
          tokenAddress: '0xD0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1',
          currency: 'ETH',
          price: 1.0, // WETH price in ETH (1:1)
        } as unknown as MarketDataDetails,
      },
      '0x89': {
        '0x1234567890123456789012345678901234567890': {
          tokenAddress: '0x1234567890123456789012345678901234567890',
          currency: 'MATIC',
          price: 1.25, // USDC price in MATIC (~$1.00 at $0.80 MATIC)
        } as unknown as MarketDataDetails,
        '0x2345678901234567890123456789012345678901': {
          tokenAddress: '0x2345678901234567890123456789012345678901',
          currency: 'MATIC',
          price: 1.25, // USDT price in MATIC (~$1.00 at $0.80 MATIC)
        } as unknown as MarketDataDetails,
      },
      '0xa4b1': {
        '0x1234567890123456789012345678901234567890': {
          tokenAddress: '0x1234567890123456789012345678901234567890',
          currency: 'ARB',
          price: 0.91, // USDC price in ARB (~$1.00 at $1.10 ARB)
        } as unknown as MarketDataDetails,
        '0x2345678901234567890123456789012345678901': {
          tokenAddress: '0x2345678901234567890123456789012345678901',
          currency: 'ARB',
          price: 0.91, // USDT price in ARB (~$1.00 at $1.10 ARB)
        } as unknown as MarketDataDetails,
      },
    },
  },
  TokensController: {
    ...getDefaultTokensState(),
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
  CurrencyRateController: {
    currentCurrency: userCurrency,
    currencyRates: {
      ETH: {
        conversionRate: 2400, // 1 ETH = $2400 USD
        conversionDate: null,
        usdConversionRate: 1.0, // 1 USD = 1 USD (for USD currency)
      },
      MATIC: {
        conversionRate: 0.8, // 1 MATIC = $0.80 USD
        conversionDate: null,
        usdConversionRate: 1.0, // 1 USD = 1 USD (for USD currency)
      },
      ARB: {
        conversionRate: 1.1, // 1 ARB = $1.10 USD
        conversionDate: null,
        usdConversionRate: 1.0, // 1 USD = 1 USD (for USD currency)
      },
    },
  },
  MultichainAssetsRatesController: {
    ...getDefaultMultichainAssetsRatesControllerState(),
    conversionRates: {},
  },
  MultichainBalancesController: {
    balances: {},
  },
});

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
      state.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

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
      state.CurrencyRateController.currencyRates.ETH.conversionRate = 1800; // 1 ETH = 1800 GBP (2400 * 0.75)
      state.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.6; // 1 MATIC = 0.6 GBP (0.8 * 0.75)
      state.CurrencyRateController.currencyRates.ARB.conversionRate = 0.825; // 1 ARB = 0.825 GBP (1.1 * 0.75)

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
      state.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

      // Add a non-EVM account to the test state
      state.AccountsController.internalAccounts.accounts['account-4'] = {
        id: 'account-4',
        address: 'FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc',
        type: 'solana:data-account',
        options: {},
        metadata: {
          name: 'Solana Account',
          keyring: { type: 'hd' },
          importTime: 1234567890,
        },
        scopes: ['bip122:000000000019d6689c085ae165831e93'],
        methods: ['solana_signTransaction'],
      };

      // Add the account to group 0
      state.AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/0'].accounts.push('account-4');

      // Add non-EVM balance data
      state.MultichainBalancesController.balances['account-4'] = {
        'bip122:000000000019d6689c085ae165831e93/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc':
          {
            amount: '50.0',
            unit: 'SOL',
          },
      };

      // Add conversion rate for SOL (already in user currency)
      state.MultichainAssetsRatesController.conversionRates[
        'bip122:000000000019d6689c085ae165831e93/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc'
      ] = {
        rate: '170.0', // 170 EUR per SOL (200 * 0.85)
        conversionTime: 1234567890,
      };

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
        state,
      );

      /*
       * CALCULATION (Direct Conversion):
       * Group 0 now has 3 accounts: account-1, account-2 (EVM), and account-4 (non-EVM)
       *
       * EVM Accounts (from previous test): 3,819.73 EUR
       * - Account 1 (Ethereum): 83.64 + 167.28 = 250.92 EUR
       * - Account 1 (Polygon): 425.00 + 850.00 = 1,275.00 EUR
       * - Account 1 (Arbitrum): 42.54 + 127.63 = 170.17 EUR
       * - Account 2 (Ethereum): 83.64 + 2040.00 = 2,123.64 EUR
       * - EVM Total: 250.92 + 1,275.00 + 170.17 + 2,123.64 = 3,819.73 EUR
       *
       * Non-EVM Account (Solana):
       * - Account 4: 50 SOL * 170 EUR/SOL = 8,500.00 EUR
       *
       * Total: 3,819.73 + 8,500.00 = 12,319.73 EUR
       */
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groupId: 'entropy:entropy-source-1/0',
        totalBalanceInUserCurrency: 12319.73,
        userCurrency: 'EUR',
      });
    });

    it('returns total balance for non-EVM accounts only in EUR', () => {
      const state = createMockState('EUR');
      // Set EUR conversion rate: 1 USD = 0.85 EUR
      state.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

      // Create a new group with only non-EVM accounts
      state.AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/2'] = {
        id: 'entropy:entropy-source-1/2',
        type: AccountGroupType.MultichainAccount,
        accounts: ['account-5'],
        metadata: {
          name: 'Group 2',
          pinned: false,
          hidden: false,
          entropy: { groupIndex: 2 },
        },
      };

      // Add non-EVM account
      state.AccountsController.internalAccounts.accounts['account-5'] = {
        id: 'account-5',
        address: 'FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc',
        type: 'solana:data-account',
        options: {},
        metadata: {
          name: 'Solana Account',
          keyring: { type: 'hd' },
          importTime: 1234567890,
        },
        scopes: ['bip122:000000000019d6689c085ae165831e93'],
        methods: ['solana_signTransaction'],
      };

      // Add non-EVM balance data
      state.MultichainBalancesController.balances['account-5'] = {
        'bip122:000000000019d6689c085ae165831e93/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc':
          {
            amount: '25.0',
            unit: 'SOL',
          },
      };

      // Add conversion rate for SOL (already in user currency)
      state.MultichainAssetsRatesController.conversionRates[
        'bip122:000000000019d6689c085ae165831e93/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc'
      ] = {
        rate: '170.0', // 170 EUR per SOL (200 * 0.85)
        conversionTime: 1234567890,
      };

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/2')(
        state,
      );

      /*
       * CALCULATION (Direct Conversion):
       * Group 2 has 1 non-EVM account: account-5
       *
       * Non-EVM Account (Solana):
       * - Account 5: 25 SOL * 170 EUR/SOL = 4,250.00 EUR
       *
       * Total: 4,250.00 EUR
       */
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groupId: 'entropy:entropy-source-1/2',
        totalBalanceInUserCurrency: 4250.0,
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
      state.CurrencyRateController.currencyRates.ETH.conversionRate = null;
      state.CurrencyRateController.currencyRates.MATIC.conversionRate = null;
      state.CurrencyRateController.currencyRates.ARB.conversionRate = null;

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
      state.TokenBalancesController.tokenBalances['0x1'][
        '0x1234567890123456789012345678901234567890'
      ]['0xA0b86a33E6441b8C4C3C1d3e2C1d3e2C1d3e2C1'] =
        'invalid_hex_string' as `0x${string}`;

      // Add another malformed balance for non-EVM account
      state.MultichainBalancesController.balances['account-1'] = {
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
      state.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

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
      state.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

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
      state.CurrencyRateController.currencyRates.ETH.conversionRate = 2040; // 1 ETH = 2040 EUR (2400 * 0.85)
      state.CurrencyRateController.currencyRates.MATIC.conversionRate = 0.68; // 1 MATIC = 0.68 EUR (0.8 * 0.85)
      state.CurrencyRateController.currencyRates.ARB.conversionRate = 0.935; // 1 ARB = 0.935 EUR (1.1 * 0.85)

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
      state.AccountTreeController.accountTree.selectedAccountGroup = '';

      const result = selectBalanceForSelectedAccountGroup()(state);

      expect(result).toBeNull();
    });
  });
});
