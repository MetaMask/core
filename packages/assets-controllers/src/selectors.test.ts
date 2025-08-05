import { AccountWalletType, AccountGroupType } from '@metamask/account-api';

import { getDefaultMultichainAssetsRatesControllerState } from './MultichainAssetsRatesController';
import {
  selectBalanceByAccountGroup,
  selectBalanceByWallet,
  selectBalanceForAllWallets,
  selectBalanceForSelectedAccountGroup,
} from './selectors';
import type { RootState } from './selectors';
import { getDefaultTokenBalancesState } from './TokenBalancesController';
import { getDefaultTokenRatesControllerState } from './TokenRatesController';
import type { MarketDataDetails } from './TokenRatesController';
import { getDefaultTokensState } from './TokensController';

const createMockState = (): RootState => ({
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
                entropy: { groupIndex: 0 },
              },
            },
            'entropy:entropy-source-1/1': {
              id: 'entropy:entropy-source-1/1',
              type: AccountGroupType.MultichainAccount,
              accounts: ['account-3'],
              metadata: {
                name: 'Group 1',
                entropy: { groupIndex: 1 },
              },
            },
          },
        },
      },
      selectedAccountGroup: 'entropy:entropy-source-1/0',
    },
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
    currentCurrency: 'USD',
    currencyRates: {
      ETH: {
        conversionRate: 2400, // 1 ETH = $2400 USD
        conversionDate: null,
        usdConversionRate: 1234567890,
      },
      MATIC: {
        conversionRate: 0.8, // 1 MATIC = $0.80 USD
        conversionDate: null,
        usdConversionRate: 1234567890,
      },
      ARB: {
        conversionRate: 1.1, // 1 ARB = $1.10 USD
        conversionDate: null,
        usdConversionRate: 1234567890,
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
    it('returns total balance for a specific account group', () => {
      const state = createMockState();

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
        state,
      );

      /*
       * CALCULATION:
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

    it('returns total balance for mixed EVM and non-EVM accounts', () => {
      const state = createMockState();

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

      // Add conversion rate for SOL
      state.MultichainAssetsRatesController.conversionRates[
        'bip122:000000000019d6689c085ae165831e93/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc'
      ] = {
        rate: '200.0', // $200 per SOL
        conversionTime: 1234567890,
      };

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/0')(
        state,
      );

      /*
       * CALCULATION:
       * Group 0 now has 3 accounts: account-1, account-2 (EVM), and account-4 (non-EVM)
       *
       * EVM Accounts (from previous test): $4,493.80
       * - Account 1 (Ethereum): 100 USDC + 200 USDT = $98.40 + $196.80 = $295.20
       * - Account 1 (Polygon): 500 USDC + 1000 USDT = $500.00 + $1000.00 = $1500.00
       * - Account 1 (Arbitrum): 50 USDC + 150 USDT = $50.05 + $150.15 = $200.20
       * - Account 2 (Ethereum): 100 DAI + 1 WETH = $98.40 + $2400.00 = $2498.40
       * - EVM Total: $295.20 + $1500.00 + $200.20 + $2498.40 = $4493.80
       *
       * Non-EVM Account (Solana):
       * - Account 4: 50 SOL * $200/SOL = $10,000.00
       *
       * Total: $4,493.80 + $10,000.00 = $14,493.80
       */
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groupId: 'entropy:entropy-source-1/0',
        totalBalanceInUserCurrency: 14493.8,
        userCurrency: 'USD',
      });
    });

    it('returns total balance for non-EVM accounts only', () => {
      const state = createMockState();

      // Create a new group with only non-EVM accounts
      state.AccountTreeController.accountTree.wallets[
        'entropy:entropy-source-1'
      ].groups['entropy:entropy-source-1/2'] = {
        id: 'entropy:entropy-source-1/2',
        type: AccountGroupType.MultichainAccount,
        accounts: ['account-5', 'account-6'],
        metadata: {
          name: 'Non-EVM Group',
          entropy: { groupIndex: 2 },
        },
      };

      // Add non-EVM accounts
      state.AccountsController.internalAccounts.accounts['account-5'] = {
        id: 'account-5',
        address: 'FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc',
        type: 'solana:data-account',
        options: {},
        metadata: {
          name: 'Solana Account 1',
          keyring: { type: 'hd' },
          importTime: 1234567890,
        },
        scopes: ['bip122:000000000019d6689c085ae165831e93'],
        methods: ['solana_signTransaction'],
      };

      state.AccountsController.internalAccounts.accounts['account-6'] = {
        id: 'account-6',
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        type: 'bip122:p2pkh',
        options: {},
        metadata: {
          name: 'Bitcoin Account',
          keyring: { type: 'hd' },
          importTime: 1234567890,
        },
        scopes: ['bip122:000000000019d6689c085ae165831e93'],
        methods: ['bip122_signTransaction'],
      };

      // Add non-EVM balance data
      state.MultichainBalancesController.balances['account-5'] = {
        'bip122:000000000019d6689c085ae165831e93/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc':
          {
            amount: '25.0',
            unit: 'SOL',
          },
      };

      state.MultichainBalancesController.balances['account-6'] = {
        'bip122:000000000019d6689c085ae165831e93/bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh':
          {
            amount: '0.5',
            unit: 'BTC',
          },
      };

      // Add conversion rates
      state.MultichainAssetsRatesController.conversionRates[
        'bip122:000000000019d6689c085ae165831e93/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc'
      ] = {
        rate: '200.0', // $200 per SOL
        conversionTime: 1234567890,
      };

      state.MultichainAssetsRatesController.conversionRates[
        'bip122:000000000019d6689c085ae165831e93/bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
      ] = {
        rate: '50000.0', // $50,000 per BTC
        conversionTime: 1234567890,
      };

      const result = selectBalanceByAccountGroup('entropy:entropy-source-1/2')(
        state,
      );

      /*
       * CALCULATION:
       * Group 2 has 2 non-EVM accounts: account-5 (Solana) and account-6 (Bitcoin)
       *
       * Solana Account:
       * - 25 SOL * $200/SOL = $5,000
       *
       * Bitcoin Account:
       * - 0.5 BTC * $50,000/BTC = $25,000
       *
       * Total: $5,000 + $25,000 = $30,000
       */
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groupId: 'entropy:entropy-source-1/2',
        totalBalanceInUserCurrency: 30000,
        userCurrency: 'USD',
      });
    });

    it('returns zero balance for non-existent account group', () => {
      const state = createMockState();

      const result = selectBalanceByAccountGroup('non-existent-group')(state);

      expect(result).toStrictEqual({
        walletId: 'non-existent-group',
        groupId: 'non-existent-group',
        totalBalanceInUserCurrency: 0,
        userCurrency: 'USD',
      });
    });
  });

  describe('selectBalanceByWallet', () => {
    it('returns total balance for all account groups in a wallet', () => {
      const state = createMockState();

      const result = selectBalanceByWallet('entropy:entropy-source-1')(state);

      /*
       * CALCULATION:
       * Wallet has 2 groups: group-0 and group-1
       *
       * Group 0 (from previous test): $3,006,994.5
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

    it('returns zero balance for non-existent wallet', () => {
      const state = createMockState();

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
    it('returns total balance for all wallets', () => {
      const state = createMockState();

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
  });

  describe('selectBalanceForSelectedAccountGroup', () => {
    it('returns total balance for the selected account group', () => {
      const state = createMockState();

      const result = selectBalanceForSelectedAccountGroup()(state);

      /*
       * CALCULATION:
       * Same as selectBalanceByAccountGroup for group-0: $4,493.80
       */
      expect(result).toStrictEqual({
        walletId: 'entropy:entropy-source-1',
        groupId: 'entropy:entropy-source-1/0',
        totalBalanceInUserCurrency: 4493.8,
        userCurrency: 'USD',
      });
    });

    it('returns null when no account group is selected', () => {
      const state = createMockState();
      state.AccountTreeController.accountTree.selectedAccountGroup = '';

      const result = selectBalanceForSelectedAccountGroup()(state);

      expect(result).toBeNull();
    });
  });
});
