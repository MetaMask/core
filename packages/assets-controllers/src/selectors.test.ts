import { AccountGroupType, AccountWalletType } from '@metamask/account-api';
import { SolAccountType } from '@metamask/keyring-api';

import {
  selectBalancesByAccountGroup,
  selectBalancesByWallet,
  selectBalancesForAllWallets,
  selectBalancesByCurrentlySelectedGroup,
} from './selectors';
import type { RootState } from './selectors';

// Helper function to create mock state - avoiding beforeEach as per Cursor rules
const createMockState = (): RootState => ({
  AccountTreeController: {
    accountTree: {
      selectedAccountGroup: 'entropy:entropy-source-1/0',
      wallets: {
        'entropy:entropy-source-1': {
          type: AccountWalletType.Entropy,
          id: 'entropy:entropy-source-1',
          groups: {
            'entropy:entropy-source-1/0': {
              type: AccountGroupType.MultichainAccount,
              id: 'entropy:entropy-source-1/0',
              accounts: ['account-1', 'account-2'], // EVM accounts
              metadata: {
                name: 'Group 0',
                entropy: {
                  groupIndex: 0,
                },
              },
            },
            'entropy:entropy-source-1/1': {
              type: AccountGroupType.MultichainAccount,
              id: 'entropy:entropy-source-1/1',
              accounts: ['account-3'], // Solana account
              metadata: {
                name: 'Group 1',
                entropy: {
                  groupIndex: 1,
                },
              },
            },
          },
          metadata: {
            name: 'Wallet 1',
            entropy: {
              id: 'entropy-source-1',
              index: 0,
            },
          },
        },
        'entropy:entropy-source-2': {
          type: AccountWalletType.Entropy,
          id: 'entropy:entropy-source-2',
          groups: {
            'entropy:entropy-source-2/0': {
              type: AccountGroupType.MultichainAccount,
              id: 'entropy:entropy-source-2/0',
              accounts: ['account-4'], // Another EVM account
              metadata: {
                name: 'Group 0',
                entropy: {
                  groupIndex: 0,
                },
              },
            },
          },
          metadata: {
            name: 'Wallet 2',
            entropy: {
              id: 'entropy-source-2',
              index: 0,
            },
          },
        },
      },
    },
  },
  AccountsController: {
    internalAccounts: {
      selectedAccount: 'account-1',
      accounts: {
        'account-1': {
          id: 'account-1',
          address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
          type: 'eip155:eoa',
          options: {
            entropy: {
              type: 'mnemonic',
              id: 'entropy:entropy-source-1',
              derivationPath: "m/44'/60'/0'/0/0",
              groupIndex: 0,
            },
          },
          metadata: {
            name: 'Account 1',
            lastSelected: Date.now(),
            importTime: Date.now(),
            keyring: { type: 'hd' },
          },
          scopes: ['eip155:1'],
          methods: [
            'eth_sendTransaction',
            'eth_signTransaction',
            'eth_sign',
            'personal_sign',
            'eth_signTypedData',
          ],
        },
        'account-2': {
          id: 'account-2',
          address: '0x8e5f8c9a2b1e3d4f5a6b7c8d9e0f1a2b3c4d5e6f',
          type: 'eip155:eoa',
          options: {
            entropy: {
              type: 'mnemonic',
              id: 'entropy:entropy-source-1',
              derivationPath: "m/44'/60'/0'/0/1",
              groupIndex: 0,
            },
          },
          metadata: {
            name: 'Account 2',
            lastSelected: Date.now() - 1000,
            importTime: Date.now(),
            keyring: { type: 'hd' },
          },
          scopes: ['eip155:1'],
          methods: [
            'eth_sendTransaction',
            'eth_signTransaction',
            'eth_sign',
            'personal_sign',
            'eth_signTypedData',
          ],
        },
        'account-3': {
          id: 'account-3',
          address: 'FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc',
          type: SolAccountType.DataAccount,
          options: {
            entropy: {
              type: 'mnemonic',
              id: 'entropy:entropy-source-1',
              derivationPath: "m/44'/501'/0'/0/0",
              groupIndex: 1,
            },
          },
          metadata: {
            name: 'Solana Account',
            lastSelected: Date.now() - 2000,
            importTime: Date.now(),
            keyring: { type: 'hd' },
          },
          scopes: ['bip122:000000000019d6689c085ae165831e93'],
          methods: ['solana_signTransaction', 'solana_signMessage'],
        },
        'account-4': {
          id: 'account-4',
          address: '0x456...another-address',
          type: 'eip155:eoa',
          options: {
            entropy: {
              type: 'mnemonic',
              id: 'entropy:entropy-source-2',
              derivationPath: "m/44'/60'/0'/0/0",
              groupIndex: 0,
            },
          },
          metadata: {
            name: 'Wallet 2 Account',
            lastSelected: Date.now() - 3000,
            importTime: Date.now(),
            keyring: { type: 'hd' },
          },
          scopes: ['eip155:1'],
          methods: [
            'eth_sendTransaction',
            'eth_signTransaction',
            'eth_sign',
            'personal_sign',
            'eth_signTypedData',
          ],
        },
      },
    },
  },
  TokenBalancesController: {
    tokenBalances: {
      // Account 1: 1 TOKA + 2000 USDT
      '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5': {
        '0x1': {
          '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5': '0xde0b6b3a7640000', // 1 TOKA (18 decimals)
          '0xdAC17F958D2ee523a2206206994597C13D831ec7': '0x77359400', // 2000 USDT (6 decimals)
        },
      },
      // Account 2: 0.5 TOKA
      '0x8e5f8c9a2b1e3d4f5a6b7c8d9e0f1a2b3c4d5e6f': {
        '0x1': {
          '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5': '0x6f05b59d3b20000', // 0.5 TOKA (18 decimals)
        },
      },
      // Account 4: 10 TOKA
      '0x456...another-address': {
        '0x1': {
          '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5': '0x8ac7230489e80000', // 10 TOKA (18 decimals)
        },
      },
    },
  },
  TokenRatesController: {
    marketData: {
      '0x1': {
        // TOKA: 1 TOKA = 2 ETH
        '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5': {
          tokenAddress: '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5',
          price: 2,
          currency: 'ETH',
          pricePercentChange1d: 0,
          priceChange1d: 0,
          marketCap: 1000000,
          allTimeHigh: 3,
          allTimeLow: 1,
          totalVolume: 50000,
          high1d: 2.1,
          low1d: 1.9,
          circulatingSupply: 500000,
          dilutedMarketCap: 1200000,
          marketCapPercentChange1d: 0,
          pricePercentChange1h: 0,
          pricePercentChange1y: 0,
          pricePercentChange7d: 0,
          pricePercentChange14d: 0,
          pricePercentChange30d: 0,
          pricePercentChange200d: 0,
        },
        // USDT: 1 USDT = 0.0005 ETH
        '0xdAC17F958D2ee523a2206206994597C13D831ec7': {
          tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          price: 0.0005,
          currency: 'ETH',
          pricePercentChange1d: 0,
          priceChange1d: 0,
          marketCap: 80000000000,
          allTimeHigh: 0.0006,
          allTimeLow: 0.0004,
          totalVolume: 1000000000,
          high1d: 0.00051,
          low1d: 0.00049,
          circulatingSupply: 80000000000,
          dilutedMarketCap: 80000000000,
          marketCapPercentChange1d: 0,
          pricePercentChange1h: 0,
          pricePercentChange1y: 0,
          pricePercentChange7d: 0,
          pricePercentChange14d: 0,
          pricePercentChange30d: 0,
          pricePercentChange200d: 0,
        },
      },
    },
  },
  CurrencyRateController: {
    currentCurrency: 'USD',
    currencyRates: {
      ETH: {
        conversionDate: Date.now(),
        conversionRate: 2000, // 1 ETH = $2000 USD
        usdConversionRate: 2000,
      },
    },
  },
  MultichainAssetsRatesController: {
    conversionRates: {
      'bip122:000000000019d6689c085ae165831e93/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc':
        {
          rate: '150', // $150 per token
          conversionTime: Date.now(),
        },
    },
    historicalPrices: {},
  },
  MultichainBalancesController: {
    balances: {
      'account-3': {
        'bip122:000000000019d6689c085ae165831e93/solana:FzQ4QJBjRA9p7kqpGgWGEYYhYqF8r2VG3vR2CzPq8dYc':
          {
            amount: '10.0', // 10 tokens
            unit: 'SOL',
          },
      },
    },
  },
  TokensController: {
    allTokens: {
      '0x1': {
        '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5': [
          {
            address: '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5',
            symbol: 'TOKA',
            decimals: 18,
            name: 'Token A',
          },
          {
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            symbol: 'USDT',
            decimals: 6,
            name: 'Tether USD',
          },
        ],
        '0x8e5f8c9a2b1e3d4f5a6b7c8d9e0f1a2b3c4d5e6f': [
          {
            address: '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5',
            symbol: 'TOKA',
            decimals: 18,
            name: 'Token A',
          },
        ],
        '0x456...another-address': [
          {
            address: '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5',
            symbol: 'TOKA',
            decimals: 18,
            name: 'Token A',
          },
        ],
      },
    },
    allDetectedTokens: {},
    allIgnoredTokens: {},
  },
});

// Helper function to create minimal state for error testing
const createEmptyState = (): RootState => ({
  ...createMockState(),
  AccountTreeController: {
    accountTree: {
      selectedAccountGroup: '',
      wallets: {},
    },
  },
});

// Helper function to create state with missing data
const createStateWithMissingData = (missingData: string): RootState => {
  const state = createMockState();

  switch (missingData) {
    case 'balances':
      return {
        ...state,
        TokenBalancesController: { tokenBalances: {} },
        MultichainBalancesController: { balances: {} },
      };
    case 'rates':
      return {
        ...state,
        TokenRatesController: { marketData: {} },
        MultichainAssetsRatesController: {
          conversionRates: {},
          historicalPrices: {},
        },
      };
    case 'tokens':
      return {
        ...state,
        TokensController: {
          allTokens: {},
          allDetectedTokens: {},
          allIgnoredTokens: {},
        },
      };
    default:
      return state;
  }
};

describe('selectBalancesByAccountGroup', () => {
  describe('when aggregating EVM and Solana balances', () => {
    it('calculates correct balance for mixed account types', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesByAccountGroup(
        'entropy:entropy-source-1',
        0,
      );

      // Act
      const result = selector(state);

      // Assert
      // Account 1: (1 TOKA * 2 ETH * $2000/ETH) + (2000 USDT * 0.0005 ETH * $2000/ETH) = $4000 + $2000 = $6000
      // Account 2: (0.5 TOKA * 2 ETH * $2000/ETH) = $2000
      // Total: $6000 + $2000 = $8000
      expect(result).toStrictEqual({
        groupId: 'entropy:entropy-source-1-0',
        aggregatedBalance: 8000,
        currency: 'USD',
      });
    });

    it('calculates correct balance for Solana-only group', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesByAccountGroup(
        'entropy:entropy-source-1',
        1,
      );

      // Act
      const result = selector(state);

      // Assert
      // Solana account: 10 tokens * $150 = $1500
      expect(result).toStrictEqual({
        groupId: 'entropy:entropy-source-1-1',
        aggregatedBalance: 1500,
        currency: 'USD',
      });
    });

    it('converts balance to user selected currency', () => {
      // Arrange
      const state = {
        ...createMockState(),
        CurrencyRateController: {
          currentCurrency: 'EUR',
          currencyRates: {
            ETH: {
              conversionDate: Date.now(),
              conversionRate: 1800, // 1 ETH = €1800
              usdConversionRate: 2000, // 1 ETH = $2000
            },
          },
        },
      };
      const selector = selectBalancesByAccountGroup(
        'entropy:entropy-source-1',
        0,
      );

      // Act
      const result = selector(state);

      // Assert
      // USD balance: $8000, EUR conversion: $8000 * (€1800/$2000) = €7200
      expect(result).toStrictEqual({
        groupId: 'entropy:entropy-source-1-0',
        aggregatedBalance: 7200,
        currency: 'EUR',
      });
    });
  });

  describe('when handling edge cases', () => {
    it('returns zero balance for non-existent wallet', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesByAccountGroup('non-existent', 0);

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        groupId: 'non-existent-0',
        aggregatedBalance: 0,
        currency: 'USD',
      });
    });

    it('returns zero balance for non-existent group', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesByAccountGroup(
        'entropy:entropy-source-1',
        99,
      );

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        groupId: 'entropy:entropy-source-1-99',
        aggregatedBalance: 0,
        currency: 'USD',
      });
    });

    it('returns zero balance when no balance data exists', () => {
      // Arrange
      const state = createStateWithMissingData('balances');
      const selector = selectBalancesByAccountGroup(
        'entropy:entropy-source-1',
        0,
      );

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        groupId: 'entropy:entropy-source-1-0',
        aggregatedBalance: 0,
        currency: 'USD',
      });
    });

    it('returns zero balance when no rate data exists', () => {
      // Arrange
      const state = createStateWithMissingData('rates');
      const selector = selectBalancesByAccountGroup(
        'entropy:entropy-source-1',
        0,
      );

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        groupId: 'entropy:entropy-source-1-0',
        aggregatedBalance: 0,
        currency: 'USD',
      });
    });

    it('returns zero balance when no token metadata exists', () => {
      // Arrange
      const state = {
        ...createStateWithMissingData('tokens'),
        // Also remove the balances since without token metadata, balances can't be processed
        TokenBalancesController: { tokenBalances: {} },
      };
      const selector = selectBalancesByAccountGroup(
        'entropy:entropy-source-1',
        0,
      );

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        groupId: 'entropy:entropy-source-1-0',
        aggregatedBalance: 0,
        currency: 'USD',
      });
    });

    it('handles malformed account tree gracefully', () => {
      // Arrange
      const state = {
        ...createMockState(),
        AccountTreeController: {
          accountTree: {
            selectedAccountGroup: '' as const,
            wallets: {
              'malformed-wallet': null,
            },
          },
        },
      };
      const selector = selectBalancesByAccountGroup('malformed-wallet', 0);

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        groupId: 'malformed-wallet-0',
        aggregatedBalance: 0,
        currency: 'USD',
      });
    });
  });

  describe('when testing memoization', () => {
    it('returns same reference for identical state', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesByAccountGroup(
        'entropy:entropy-source-1',
        0,
      );

      // Act
      const result1 = selector(state);
      const result2 = selector(state);

      // Assert
      expect(result1).toBe(result2);
    });

    it('returns different reference when state changes', () => {
      // Arrange
      const state1 = createMockState();
      const state2 = {
        ...state1,
        CurrencyRateController: {
          ...state1.CurrencyRateController,
          currentCurrency: 'EUR',
        },
      };
      const selector = selectBalancesByAccountGroup(
        'entropy:entropy-source-1',
        0,
      );

      // Act
      const result1 = selector(state1);
      const result2 = selector(state2);

      // Assert
      expect(result1).not.toBe(result2);
      expect(result1.currency).toBe('USD');
      expect(result2.currency).toBe('EUR');
    });
  });
});

describe('selectBalancesByWallet', () => {
  describe('when aggregating all groups in wallet', () => {
    it('returns correct balances for all groups', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesByWallet('entropy:entropy-source-1');

      // Act
      const result = selector(state);

      // Assert
      expect(result.walletId).toBe('entropy:entropy-source-1');
      expect(result.currency).toBe('USD');
      expect(result.groups).toHaveLength(2);

      // Group 0: EVM accounts = $8000
      expect(result.groups[0]).toStrictEqual({
        groupId: 'entropy:entropy-source-1-0',
        aggregatedBalance: 8000,
        currency: 'USD',
      });

      // Group 1: Solana account = $1500
      expect(result.groups[1]).toStrictEqual({
        groupId: 'entropy:entropy-source-1-1',
        aggregatedBalance: 1500,
        currency: 'USD',
      });

      // Total: $8000 + $1500 = $9500
      expect(result.totalBalance).toBe(9500);
    });

    it('returns correct balance for single-group wallet', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesByWallet('entropy:entropy-source-2');

      // Act
      const result = selector(state);

      // Assert
      expect(result.walletId).toBe('entropy:entropy-source-2');
      expect(result.groups).toHaveLength(1);
      // Account 4: 10 TOKA * 2 ETH * $2000/ETH = $40000
      expect(result.totalBalance).toBe(40000);
    });
  });

  describe('when handling edge cases', () => {
    it('returns empty wallet for non-existent wallet', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesByWallet('non-existent');

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        walletId: 'non-existent',
        groups: [],
        totalBalance: 0,
        currency: 'USD',
      });
    });

    it('handles wallet with no groups', () => {
      // Arrange
      const state = {
        ...createMockState(),
        AccountTreeController: {
          accountTree: {
            selectedAccountGroup: '' as const,
            wallets: {
              'empty-wallet': {
                type: AccountWalletType.Entropy,
                id: 'empty-wallet',
                groups: {},
                metadata: {
                  name: 'Empty Wallet',
                  entropy: {
                    id: 'empty-source',
                    index: 0,
                  },
                },
              },
            },
          },
        },
      };
      const selector = selectBalancesByWallet('empty-wallet');

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        walletId: 'empty-wallet',
        groups: [],
        totalBalance: 0,
        currency: 'USD',
      });
    });

    it('handles wallet with malformed groups', () => {
      // Arrange
      const state = {
        ...createMockState(),
        AccountTreeController: {
          accountTree: {
            selectedAccountGroup: '' as const,
            wallets: {
              'malformed-wallet': {
                type: AccountWalletType.Entropy,
                id: 'malformed-wallet',
                groups: null,
                metadata: {
                  name: 'Malformed Wallet',
                  entropy: {
                    id: 'malformed-source',
                    index: 0,
                  },
                },
              },
            },
          },
        },
      };
      const selector = selectBalancesByWallet('malformed-wallet');

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        walletId: 'malformed-wallet',
        groups: [],
        totalBalance: 0,
        currency: 'USD',
      });
    });
  });
});

describe('selectBalancesForAllWallets', () => {
  describe('when aggregating all wallets', () => {
    it('returns balances for all wallets', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesForAllWallets();

      // Act
      const result = selector(state);

      // Assert
      expect(result).toHaveLength(2);

      const wallet1 = result.find(
        (w) => w.walletId === 'entropy:entropy-source-1',
      );
      expect(wallet1).toStrictEqual(
        expect.objectContaining({
          walletId: 'entropy:entropy-source-1',
          totalBalance: 9500, // $8000 + $1500
          currency: 'USD',
        }),
      );

      const wallet2 = result.find(
        (w) => w.walletId === 'entropy:entropy-source-2',
      );
      expect(wallet2).toStrictEqual(
        expect.objectContaining({
          walletId: 'entropy:entropy-source-2',
          totalBalance: 40000, // 10 TOKA * 2 ETH * $2000/ETH
          currency: 'USD',
        }),
      );
    });

    it('sorts wallets consistently', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesForAllWallets();

      // Act
      const result1 = selector(state);
      const result2 = selector(state);

      // Assert
      expect(result1.map((w) => w.walletId)).toStrictEqual(
        result2.map((w) => w.walletId),
      );
    });
  });

  describe('when handling edge cases', () => {
    it('returns empty array when no wallets exist', () => {
      // Arrange
      const state = createEmptyState();
      const selector = selectBalancesForAllWallets();

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual([]);
    });

    it('handles malformed wallet data', () => {
      // Arrange
      const state = {
        ...createMockState(),
        AccountTreeController: {
          accountTree: {
            selectedAccountGroup: '' as const,
            wallets: {
              'valid-wallet':
                createMockState().AccountTreeController.accountTree.wallets[
                  'entropy:entropy-source-1'
                ],
              'malformed-wallet': null,
            },
          },
        },
      };
      const selector = selectBalancesForAllWallets();

      // Act
      const result = selector(state);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.some((w) => w.walletId === 'valid-wallet')).toBe(true);
      expect(result.some((w) => w.walletId === 'malformed-wallet')).toBe(true);
    });
  });
});

describe('selectBalancesByCurrentlySelectedGroup', () => {
  describe('when getting currently selected group balance', () => {
    it('returns balance for currently selected account group', () => {
      // Arrange
      const state = createMockState(); // account-1 is selected by default
      const selector = selectBalancesByCurrentlySelectedGroup();

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        groupId: 'entropy:entropy-source-1-0',
        aggregatedBalance: 8000, // Group 0 balance
        currency: 'USD',
      });
    });

    it('returns balance for different selected account', () => {
      // Arrange
      const state = {
        ...createMockState(),
        AccountsController: {
          ...createMockState().AccountsController,
          internalAccounts: {
            ...createMockState().AccountsController.internalAccounts,
            selectedAccount: 'account-3', // Solana account in group 1
          },
        },
      };
      const selector = selectBalancesByCurrentlySelectedGroup();

      // Act
      const result = selector(state);

      // Assert
      expect(result).toStrictEqual({
        groupId: 'entropy:entropy-source-1-1',
        aggregatedBalance: 1500, // Solana group balance
        currency: 'USD',
      });
    });
  });

  describe('when handling edge cases', () => {
    it('returns null when no account is selected', () => {
      // Arrange
      const state = {
        ...createMockState(),
        AccountsController: {
          ...createMockState().AccountsController,
          internalAccounts: {
            ...createMockState().AccountsController.internalAccounts,
            selectedAccount: '',
          },
        },
      };
      const selector = selectBalancesByCurrentlySelectedGroup();

      // Act
      const result = selector(state);

      // Assert
      expect(result).toBeNull();
    });

    it('returns null when selected account does not exist', () => {
      // Arrange
      const state = {
        ...createMockState(),
        AccountsController: {
          ...createMockState().AccountsController,
          internalAccounts: {
            ...createMockState().AccountsController.internalAccounts,
            selectedAccount: 'non-existent-account',
          },
        },
      };
      const selector = selectBalancesByCurrentlySelectedGroup();

      // Act
      const result = selector(state);

      // Assert
      expect(result).toBeNull();
    });

    it('returns null when selected account has no entropy', () => {
      // Arrange
      const state = {
        ...createMockState(),
        AccountsController: {
          ...createMockState().AccountsController,
          internalAccounts: {
            ...createMockState().AccountsController.internalAccounts,
            accounts: {
              ...createMockState().AccountsController.internalAccounts.accounts,
              'account-1': {
                ...createMockState().AccountsController.internalAccounts
                  .accounts['account-1'],
                options: {}, // No entropy
              },
            },
          },
        },
      };
      const selector = selectBalancesByCurrentlySelectedGroup();

      // Act
      const result = selector(state);

      // Assert
      expect(result).toBeNull();
    });

    it('returns null when selected account has malformed entropy', () => {
      // Arrange
      const state = {
        ...createMockState(),
        AccountsController: {
          ...createMockState().AccountsController,
          internalAccounts: {
            ...createMockState().AccountsController.internalAccounts,
            accounts: {
              ...createMockState().AccountsController.internalAccounts.accounts,
              'account-1': {
                ...createMockState().AccountsController.internalAccounts
                  .accounts['account-1'],
                options: {
                  // Malformed entropy - missing entropy property
                },
              },
            },
          },
        },
      };
      const selector = selectBalancesByCurrentlySelectedGroup();

      // Act
      const result = selector(state);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('when testing memoization behavior', () => {
    it('returns same reference when selected account unchanged', () => {
      // Arrange
      const state = createMockState();
      const selector = selectBalancesByCurrentlySelectedGroup();

      // Act
      const result1 = selector(state);
      const result2 = selector(state);

      // Assert
      expect(result1).toBe(result2);
    });

    it('returns different reference when selected account changes', () => {
      // Arrange
      const state1 = createMockState();
      const state2 = {
        ...state1,
        AccountsController: {
          ...state1.AccountsController,
          internalAccounts: {
            ...state1.AccountsController.internalAccounts,
            selectedAccount: 'account-3',
          },
        },
      };
      const selector = selectBalancesByCurrentlySelectedGroup();

      // Act
      const result1 = selector(state1);
      const result2 = selector(state2);

      // Assert
      expect(result1).not.toBe(result2);
      expect(result1?.groupId).toBe('entropy:entropy-source-1-0');
      expect(result2?.groupId).toBe('entropy:entropy-source-1-1');
    });
  });
});
