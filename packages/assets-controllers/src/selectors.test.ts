import {
  selectBalancesByAccountGroup,
  selectBalancesByWallet,
  selectBalancesForAllWallets,
  selectBalancesByCurrentlySelectedGroup,
} from './selectors';
import type { AccountGroupBalance } from './selectors';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Don't mock reselect - test the actual implementation

describe('selectBalancesByAccountGroup', () => {
  const mockEntropySource = '0x123...entropy-source-1';
  const mockGroupIndex = 0;

  let mockMultichainAccountService: any;
  let mockAccountsController: any;
  let mockState: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock MultichainAccountService with direct method calls
    mockMultichainAccountService = {
      getMultichainAccountGroup: jest.fn(),
      getMultichainAccountGroups: jest.fn(),
      getMultichainAccountWallets: jest.fn(),
    };

    // Mock AccountsController with direct method calls
    mockAccountsController = {
      getSelectedMultichainAccount: jest.fn(),
    };

    // Create comprehensive mock state with realistic balance and rate data
    mockState = {
      MultichainAccountService: mockMultichainAccountService,
      AccountsController: mockAccountsController,
      TokenBalancesController: {
        tokenBalances: {
          // Account 1: 0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5
          '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5': {
            // Ethereum Mainnet (0x1)
            '0x1': {
              // Token A: 1 token worth (18 decimals)
              '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5': '0xde0b6b3a7640000', // 1 * 10^18 = 1 token (hex string)
              // USDT: 2000 USDT (6 decimals)
              '0xdAC17F958D2ee523a2206206994597C13D831ec7': '0x77359400', // 2000 * 10^6 = 2000 USDT (hex string)
            },
            // Polygon (0x89)
            '0x89': {
              // MATIC: 5 MATIC (18 decimals)
              '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270':
                '0x4563918244f40000', // 5 * 10^18 = 5 MATIC (hex string)
            },
          },
          // Account 2: 0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6
          '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6': {
            // Ethereum Mainnet (0x1)
            '0x1': {
              // Token A: 0.5 token worth (18 decimals)
              '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5': '0x6f05b59d3b20000', // 0.5 * 10^18 = 0.5 token (hex string)
            },
          },
        },
      },
      CurrencyRateController: {
        currentCurrency: 'USD',
        currencyRates: {
          ETH: {
            conversionRate: 2000,
            conversionDate: Date.now() / 1000,
            usdConversionRate: 2000,
          },
          MATIC: {
            conversionRate: 0.8,
            conversionDate: Date.now() / 1000,
            usdConversionRate: 0.8,
          },
        },
      },
      TokenRatesController: {
        marketData: {
          '0x1': {
            '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5': {
              price: 1.5, // 1.5 ETH per token
              marketCap: 1000000,
              allTimeHigh: 2.0,
              allTimeLow: 0.5,
              totalSupply: 1000000,
              dilutedMarketCap: 1500000,
              currency: 'ETH',
            },
            '0xdAC17F958D2ee523a2206206994597C13D831ec7': {
              price: 0.0005, // USDT price in ETH (0.0005 ETH per USDT)
              marketCap: 50000000,
              currency: 'ETH',
            },
          },
          '0x89': {
            '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270': {
              price: 1.0, // MATIC price in ETH equivalent
              currency: 'ETH',
            },
          },
        },
      },
      MultichainAssetsRatesController: {
        conversionRates: {
          'bip122:000000000019d6689c085ae165831e93/slip44:501': {
            rate: '150', // SOL to USD (string format like controller tests)
          },
          'bip122:000000000019d6689c085ae165831e93/slip44:501/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':
            {
              rate: '1.0', // USDC to USD (string format like controller tests)
            },
        },
      },
      MultichainBalancesController: {
        balances: {
          'solana-account-1': {
            'bip122:000000000019d6689c085ae165831e93/slip44:501': {
              amount: '2.00000000', // 2 SOL (decimal format like controller tests)
              unit: 'SOL',
            },
            'bip122:000000000019d6689c085ae165831e93/slip44:501/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':
              {
                amount: '100.000000', // 100 USDC (decimal format like controller tests)
                unit: 'USDC',
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
            '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6': [
              {
                address: '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5',
                symbol: 'TOKA',
                decimals: 18,
                name: 'Token A',
              },
            ],
          },
          '0x89': {
            '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5': [
              {
                address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
                symbol: 'MATIC',
                decimals: 18,
                name: 'Polygon',
              },
            ],
          },
        },
        allDetectedTokens: {},
        allIgnoredTokens: {},
        suggestedAssets: [],
      },
    };
  });

  describe('with mixed EVM and Solana accounts', () => {
    beforeEach(() => {
      // Arrange: Mock MultichainAccountService to return mixed account types
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
          {
            id: 'evm-account-2',
            address: '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
          {
            id: 'solana-account-1',
            address: 'So11111111111111111111111111111111111111112',
            type: 'bip122:000000000019d6689c085ae165831e93',
            metadata: {
              keyring: { type: 'Snap Keyring' },
            },
          },
        ],
      });
    });

    it('aggregates balances from mixed EVM and Solana accounts', () => {
      // Arrange
      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );

      // Act
      const result: AccountGroupBalance = selector(mockState);

      // Assert
      expect(result).toStrictEqual({
        groupId: `${mockEntropySource}-${mockGroupIndex}`,
        aggregatedBalance: expect.any(Number),
        currency: 'USD',
      });

      expect(
        mockMultichainAccountService.getMultichainAccountGroup,
      ).toHaveBeenCalledWith({
        entropySource: mockEntropySource,
        groupIndex: mockGroupIndex,
      });

      // Verify the balance is greater than 0 (should include EVM + Solana balances)
      expect(result.aggregatedBalance).toBeGreaterThan(0);
    });

    it('calculates accurate balance values for mixed account types', () => {
      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      // Expected calculation breakdown:
      // Account 1 (0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5):
      // - Token A: (0xde0b6b3a7640000 = 1000000000000000000 / 10^18) * 1.5 * 2000 = 1 * 1.5 * 2000 = 3000 USD
      // - USDT: (0x77359400 = 2000000000 / 10^6) * 0.0005 * 2000 = 2000 * 0.0005 * 2000 = 2000 USD
      // - MATIC: (0x4563918244f40000 = 5000000000000000000 / 10^18) * 1.0 * 2000 = 5 * 1.0 * 2000 = 10000 USD
      // Account 2 (0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6):
      // - Token A: (0x6f05b59d3b20000 = 500000000000000000 / 10^18) * 1.5 * 2000 = 0.5 * 1.5 * 2000 = 1500 USD
      // Solana Account:
      // - SOL: 2.00000000 * 150 = 2 * 150 = 300 USD (decimal format, no conversion needed)
      // - USDC: 100.000000 * 1.0 = 100 * 1.0 = 100 USD (decimal format, no conversion needed)
      // Total: 3000 + 2000 + 10000 + 1500 + 300 + 100 = 16900 USD
      expect(result.aggregatedBalance).toBe(16900);
      expect(typeof result.aggregatedBalance).toBe('number');
    });
  });

  describe('with only EVM accounts', () => {
    beforeEach(() => {
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
        ],
      });
    });

    it('aggregates balances from EVM accounts only', () => {
      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      // Expected calculation for EVM accounts only:
      // Account 1 (0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5):
      // - Token A: (0xde0b6b3a7640000 = 1000000000000000000 / 10^18) * 1.5 * 2000 = 1 * 1.5 * 2000 = 3000 USD
      // - USDT: (0x77359400 = 2000000000 / 10^6) * 0.0005 * 2000 = 2000 * 0.0005 * 2000 = 2000 USD
      // - MATIC: (0x4563918244f40000 = 5000000000000000000 / 10^18) * 1.0 * 2000 = 5 * 1.0 * 2000 = 10000 USD
      // Total: 3000 + 2000 + 10000 = 15000 USD
      expect(result.aggregatedBalance).toBe(15000);
      expect(typeof result.aggregatedBalance).toBe('number');
      expect(result.currency).toBe('USD');
    });
  });

  describe('with only Solana accounts', () => {
    beforeEach(() => {
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'solana-account-1',
            address: 'So11111111111111111111111111111111111111112',
            type: 'bip122:000000000019d6689c085ae165831e93',
            metadata: {
              keyring: { type: 'Snap Keyring' },
            },
          },
        ],
      });
    });

    it('aggregates balances from Solana accounts only', () => {
      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      // Expected calculation for Solana accounts only:
      // Solana Account (solana-account-1):
      // - SOL: 2.00000000 * 150 USD/SOL = 2 SOL * 150 = 300 USD (decimal format, no conversion needed)
      // - USDC: 100.000000 * 1.0 USD/USDC = 100 USDC * 1.0 = 100 USD (decimal format, no conversion needed)
      // Total: 300 + 100 = 400 USD
      expect(result.aggregatedBalance).toBe(400);
      expect(typeof result.aggregatedBalance).toBe('number');
      expect(result.currency).toBe('USD');
    });

    it('handles string rate formats from controller', () => {
      // Test with rate format exactly like MultichainAssetsRatesController tests
      const stringRateState = {
        ...mockState,
        MultichainAssetsRatesController: {
          conversionRates: {
            'bip122:000000000019d6689c085ae165831e93/slip44:501': {
              rate: '202.11', // String format like controller tests
            },
            'bip122:000000000019d6689c085ae165831e93/slip44:501/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':
              {
                rate: '0.9995', // String format like controller tests
              },
          },
        },
        MultichainBalancesController: {
          balances: {
            'solana-account-1': {
              'bip122:000000000019d6689c085ae165831e93/slip44:501': {
                amount: '1.00000000', // 1 SOL
                unit: 'SOL',
              },
              'bip122:000000000019d6689c085ae165831e93/slip44:501/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':
                {
                  amount: '50.000000', // 50 USDC
                  unit: 'USDC',
                },
            },
          },
        },
      };

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(stringRateState);

      // Expected calculation:
      // - SOL: 1.00000000 * 202.11 = 1 * 202.11 = 202.11 USD
      // - USDC: 50.000000 * 0.9995 = 50 * 0.9995 = 49.975 USD
      // Total: 202.11 + 49.975 = 252.085 USD
      expect(result.aggregatedBalance).toBe(252.085);
      expect(result.currency).toBe('USD');
    });
  });

  describe('error handling', () => {
    it('handles empty account groups gracefully', () => {
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [],
      });

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      expect(result).toStrictEqual({
        groupId: `${mockEntropySource}-${mockGroupIndex}`,
        aggregatedBalance: 0,
        currency: 'USD',
      });
    });

    it('handles MultichainAccountService errors gracefully', () => {
      mockMultichainAccountService.getMultichainAccountGroups.mockImplementation(
        () => {
          throw new Error('Group not found');
        },
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      expect(result).toStrictEqual({
        groupId: `${mockEntropySource}-${mockGroupIndex}`,
        aggregatedBalance: 0,
        currency: 'USD',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error getting accounts for group:',
        { entropySource: mockEntropySource, groupIndex: mockGroupIndex },
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('handles missing balance data gracefully', () => {
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-missing',
            address: '0x999999999999999999999999999999999999999',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
        ],
      });

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      expect(result.aggregatedBalance).toBe(0);
      expect(result.currency).toBe('USD');
    });

    it('handles missing rate data gracefully', () => {
      // Remove rate data
      mockState.TokenRatesController.marketData = {};
      mockState.MultichainAssetsRatesController.conversionRates = {};

      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
        ],
      });

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      expect(result.aggregatedBalance).toBe(0);
      expect(result.currency).toBe('USD');
    });

    it('handles currency conversion errors gracefully', () => {
      // Remove ETH rate data
      mockState.CurrencyRateController.currencyRates = {};

      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
        ],
      });

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      expect(result.aggregatedBalance).toBe(0);
      expect(result.currency).toBe('USD');
    });
  });

  describe('performance and memoization', () => {
    it('returns the same reference when state has not changed', () => {
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
        ],
      });

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result1 = selector(mockState);
      const result2 = selector(mockState);

      // Due to createSelector memoization, results should be the same reference
      expect(result1).toBe(result2);
    });

    it('handles large numbers of accounts efficiently', () => {
      // Create many accounts
      const manyAccounts = Array.from({ length: 100 }, (_, i) => ({
        id: `evm-account-${i}`,
        address: `0x${i.toString(16).padStart(40, '0')}`,
        type: 'eip155:eoa',
        metadata: {
          keyring: { type: 'HD Key Tree' },
        },
      }));

      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => manyAccounts,
      });

      const startTime = Date.now();
      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);
      const endTime = Date.now();

      // Should complete within reasonable time (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100);
      expect(result).toBeDefined();
      expect(result.currency).toBe('USD');
    });
  });

  describe('currency support', () => {
    it('respects user selected currency', () => {
      mockState.CurrencyRateController.currentCurrency = 'EUR';

      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
        ],
      });

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      expect(result.currency).toBe('EUR');
    });

    it('converts balance to user selected currency (EUR)', () => {
      // Create state with EUR currency and proper conversion rates
      const eurState = {
        ...mockState,
        CurrencyRateController: {
          currentCurrency: 'EUR',
          currencyRates: {
            ETH: {
              conversionRate: 1800, // 1 ETH = 1800 EUR
              conversionDate: Date.now() / 1000,
              usdConversionRate: 2000, // 1 ETH = 2000 USD
            },
            MATIC: {
              conversionRate: 0.72, // 1 MATIC = 0.72 EUR
              conversionDate: Date.now() / 1000,
              usdConversionRate: 0.8, // 1 MATIC = 0.8 USD
            },
          },
        },
      };

      // Use the same mock setup as the main test to get consistent results
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
          {
            id: 'evm-account-2',
            address: '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
          {
            id: 'solana-account-1',
            address: 'So11111111111111111111111111111111111111112',
            type: 'bip122:000000000019d6689c085ae165831e93',
            metadata: {
              keyring: { type: 'Snap Keyring' },
            },
          },
        ],
      });

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(eurState);

      // USD to EUR rate = 1800/2000 = 0.9
      // Expected USD balance: 16900 (from previous test)
      // Expected EUR balance: 16900 * 0.9 = 15210
      expect(result.aggregatedBalance).toBe(15210);
      expect(result.currency).toBe('EUR');
    });

    it('handles USD currency without conversion', () => {
      // Use the same mock setup as the main test to get consistent results
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
          {
            id: 'evm-account-2',
            address: '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
          {
            id: 'solana-account-1',
            address: 'So11111111111111111111111111111111111111112',
            type: 'bip122:000000000019d6689c085ae165831e93',
            metadata: {
              keyring: { type: 'Snap Keyring' },
            },
          },
        ],
      });

      const result = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      )(mockState);

      // Should be same as calculated balance since no conversion needed
      expect(result.aggregatedBalance).toBe(16900);
      expect(result.currency).toBe('USD');
    });
  });

  describe('data shape validation', () => {
    it('returns correct data shape and types', () => {
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' },
            },
          },
        ],
      });

      const selector = selectBalancesByAccountGroup(
        mockEntropySource,
        mockGroupIndex,
      );
      const result = selector(mockState);

      expect(typeof result.groupId).toBe('string');
      expect(typeof result.aggregatedBalance).toBe('number');
      expect(typeof result.currency).toBe('string');

      expect(result.groupId).toBe(`${mockEntropySource}-${mockGroupIndex}`);
      expect(Number.isFinite(result.aggregatedBalance)).toBe(true);
      expect(result.currency.length).toBeGreaterThan(0);
    });
  });

  describe('selectBalancesByWallet', () => {
    beforeEach(() => {
      // Mock MultichainAccountService to return multiple groups for wallet
      mockMultichainAccountService.getMultichainAccountGroups.mockReturnValue([
        { index: 0 },
        { index: 1 },
      ]);

      // Mock getMultichainAccountGroup to return accounts for group 0 only
      mockMultichainAccountService.getMultichainAccountGroup.mockImplementation(
        ({ groupIndex }: { groupIndex: number }) => {
          if (groupIndex === 0) {
            return {
              getAccounts: () => [
                {
                  id: 'evm-account-1',
                  address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
                  type: 'eip155:eoa',
                  metadata: { keyring: { type: 'HD Key Tree' } },
                },
                {
                  id: 'evm-account-2',
                  address: '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6',
                  type: 'eip155:eoa',
                  metadata: { keyring: { type: 'HD Key Tree' } },
                },
                {
                  id: 'solana-account-1',
                  address: 'So11111111111111111111111111111111111111112',
                  type: 'bip122:000000000019d6689c085ae165831e93',
                  metadata: { keyring: { type: 'Snap Keyring' } },
                },
              ],
            };
          }
          return { getAccounts: () => [] };
        },
      );
    });

    it('aggregates exact balances from all groups in a wallet', () => {
      const selector = selectBalancesByWallet(mockEntropySource);
      const result = selector(mockState);

      expect(result.walletId).toBe(mockEntropySource);
      expect(result.groups).toHaveLength(2);
      expect(result.currency).toBe('USD');

      // Group 0: Should have the full balance (16900 USD from original test)
      // This group has the mock account data we set up
      expect(result.groups[0].groupId).toBe(`${mockEntropySource}-0`);
      expect(result.groups[0].aggregatedBalance).toBe(16900);
      expect(result.groups[0].currency).toBe('USD');

      // Group 1: Should have 0 balance (no accounts in mock for group 1)
      // This group has no account data, so balance should be 0
      expect(result.groups[1].groupId).toBe(`${mockEntropySource}-1`);
      expect(result.groups[1].aggregatedBalance).toBe(0);
      expect(result.groups[1].currency).toBe('USD');

      // Total should be sum of all group balances
      expect(result.totalBalance).toBe(16900);
    });

    it('handles wallet with no groups gracefully', () => {
      const createEmptyWalletMock = () => (action: any) => {
        /* eslint-disable jest/no-conditional-in-test */
        if (action === 'MultichainAccountService:getMultichainAccountGroups') {
          return [];
        }
        return { getAccounts: () => [] };
        /* eslint-enable jest/no-conditional-in-test */
      };

      mockMultichainAccountService.getMultichainAccountGroups.mockImplementation(
        createEmptyWalletMock(),
      );

      const selector = selectBalancesByWallet(mockEntropySource);
      const result = selector(mockState);

      expect(result.walletId).toBe(mockEntropySource);
      expect(result.groups).toHaveLength(0);
      expect(result.totalBalance).toBe(0);
      expect(result.currency).toBe('USD');
    });

    it('converts total balance to user selected currency (EUR)', () => {
      const eurState = {
        ...mockState,
        CurrencyRateController: {
          currentCurrency: 'EUR',
          currencyRates: {
            ETH: {
              conversionRate: 1800, // 1 ETH = 1800 EUR
              conversionDate: Date.now() / 1000,
              usdConversionRate: 2000, // 1 ETH = 2000 USD
            },
          },
        },
      };

      const selector = selectBalancesByWallet(mockEntropySource);
      const result = selector(eurState);

      expect(result.currency).toBe('EUR');

      // USD to EUR conversion: 16900 USD * (1800 EUR/ETH) / (2000 USD/ETH) = 16900 * 0.9 = 15210 EUR
      expect(result.groups[0].aggregatedBalance).toBe(15210);
      expect(result.groups[0].currency).toBe('EUR');
      expect(result.totalBalance).toBe(15210);
    });

    it('handles MultichainAccountService errors gracefully', () => {
      mockMultichainAccountService.getMultichainAccountGroups.mockImplementation(
        () => {
          throw new Error('Service error');
        },
      );

      const selector = selectBalancesByWallet(mockEntropySource);
      const result = selector(mockState);

      expect(result.walletId).toBe(mockEntropySource);
      expect(result.groups).toHaveLength(0);
      expect(result.totalBalance).toBe(0);
      expect(result.currency).toBe('USD');
    });

    it('returns the same reference when state has not changed', () => {
      const selector = selectBalancesByWallet(mockEntropySource);
      const result1 = selector(mockState);
      const result2 = selector(mockState);

      expect(result1).toBe(result2);
    });
  });

  describe('selectBalancesForAllWallets', () => {
    beforeEach(() => {
      // Mock getMultichainAccountWallets to return multiple wallets
      mockMultichainAccountService.getMultichainAccountWallets.mockReturnValue([
        { entropySource: mockEntropySource }, // wallet with balance data
        { entropySource: 'empty-wallet' }, // wallet with no balance data
      ]);

      // Mock getMultichainAccountGroups based on entropy source
      mockMultichainAccountService.getMultichainAccountGroups.mockImplementation(
        ({ entropySource }: { entropySource: string }) => {
          if (entropySource === mockEntropySource) {
            return [{ index: 0 }];
          }
          if (entropySource === 'empty-wallet') {
            return [{ index: 0 }];
          }
          return [];
        },
      );

      // Mock getMultichainAccountGroup to return accounts only for mockEntropySource
      mockMultichainAccountService.getMultichainAccountGroup.mockImplementation(
        ({
          entropySource,
          groupIndex,
        }: {
          entropySource: string;
          groupIndex: number;
        }) => {
          if (entropySource === mockEntropySource && groupIndex === 0) {
            return {
              getAccounts: () => [
                {
                  id: 'evm-account-1',
                  address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
                  type: 'eip155:eoa',
                  metadata: { keyring: { type: 'HD Key Tree' } },
                },
                {
                  id: 'evm-account-2',
                  address: '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6',
                  type: 'eip155:eoa',
                  metadata: { keyring: { type: 'HD Key Tree' } },
                },
                {
                  id: 'solana-account-1',
                  address: 'So11111111111111111111111111111111111111112',
                  type: 'bip122:000000000019d6689c085ae165831e93',
                  metadata: { keyring: { type: 'Snap Keyring' } },
                },
              ],
            };
          }
          return { getAccounts: () => [] };
        },
      );
    });

    it('returns exact balances for all wallets', () => {
      const selector = selectBalancesForAllWallets();
      const result = selector(mockState);

      expect(result).toHaveLength(2);

      // First wallet (has balance data)
      expect(result[0].walletId).toBe(mockEntropySource);
      expect(result[0].groups).toHaveLength(1);
      expect(result[0].groups[0].aggregatedBalance).toBe(16900);
      expect(result[0].totalBalance).toBe(16900);
      expect(result[0].currency).toBe('USD');

      // Second wallet (empty)
      expect(result[1].walletId).toBe('empty-wallet');
      expect(result[1].groups).toHaveLength(1);
      expect(result[1].groups[0].aggregatedBalance).toBe(0);
      expect(result[1].totalBalance).toBe(0);
      expect(result[1].currency).toBe('USD');
    });

    it('handles no wallets gracefully', () => {
      // Override the mock to return no wallets
      mockMultichainAccountService.getMultichainAccountWallets.mockReturnValue(
        [],
      );

      const selector = selectBalancesForAllWallets();
      const result = selector(mockState);

      expect(result).toHaveLength(0);
    });

    it('handles service errors gracefully', () => {
      // Mock getMultichainAccountWallets to throw an error
      mockMultichainAccountService.getMultichainAccountWallets.mockImplementation(
        () => {
          throw new Error('Service error');
        },
      );

      const selector = selectBalancesForAllWallets();
      const result = selector(mockState);

      expect(result).toHaveLength(0);
    });

    it('returns the same reference when state has not changed', () => {
      const selector = selectBalancesForAllWallets();
      const result1 = selector(mockState);
      const result2 = selector(mockState);

      expect(result1).toBe(result2);
    });
  });

  describe('selectBalancesByCurrentlySelectedGroup', () => {
    beforeEach(() => {
      // Mock AccountsController to return a selected account
      mockAccountsController.getSelectedMultichainAccount.mockReturnValue({
        id: 'account-2',
        options: { entropy: { id: mockEntropySource, groupIndex: 0 } },
      });

      // Mock MultichainAccountService for the selected group
      mockMultichainAccountService.getMultichainAccountGroup.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: { keyring: { type: 'HD Key Tree' } },
          },
          {
            id: 'evm-account-2',
            address: '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6',
            type: 'eip155:eoa',
            metadata: { keyring: { type: 'HD Key Tree' } },
          },
          {
            id: 'solana-account-1',
            address: 'So11111111111111111111111111111111111111112',
            type: 'bip122:000000000019d6689c085ae165831e93',
            metadata: { keyring: { type: 'Snap Keyring' } },
          },
        ],
      });
    });

    it('returns balance for currently selected account group', () => {
      const selector = selectBalancesByCurrentlySelectedGroup();
      const result = selector(mockState);

      expect(result).not.toBeNull();
      expect(result?.groupId).toBe(`${mockEntropySource}-0`);
      expect(typeof result?.aggregatedBalance).toBe('number');
      expect(result?.currency).toBe('USD');
    });

    it('returns null when no account is selected', () => {
      // Override the mock to return null (no selected account)
      mockAccountsController.getSelectedMultichainAccount.mockReturnValue(null);

      const selector = selectBalancesByCurrentlySelectedGroup();
      const result = selector(mockState);

      expect(result).toBeNull();
    });

    it('returns null when selected account has no entropy', () => {
      // Override the mock to return an account without entropy
      mockAccountsController.getSelectedMultichainAccount.mockReturnValue({
        id: 'account-1',
        options: {}, // No entropy
      });

      const selector = selectBalancesByCurrentlySelectedGroup();
      const result = selector(mockState);

      expect(result).toBeNull();
    });

    it('handles service errors gracefully', () => {
      // Mock AccountsController to throw an error
      mockAccountsController.getSelectedMultichainAccount.mockImplementation(
        () => {
          throw new Error('Service error');
        },
      );

      const selector = selectBalancesByCurrentlySelectedGroup();
      const result = selector(mockState);

      expect(result).toBeNull();
    });

    it('returns the same reference when state has not changed', () => {
      const selector = selectBalancesByCurrentlySelectedGroup();
      const result1 = selector(mockState);
      const result2 = selector(mockState);

      expect(result1).toBe(result2);
    });

    it('respects user selected currency', () => {
      const eurState = {
        ...mockState,
        CurrencyRateController: {
          currentCurrency: 'EUR',
          currencyRates: {
            ETH: {
              conversionRate: 1800,
              conversionDate: Date.now() / 1000,
              usdConversionRate: 2000,
            },
          },
        },
      };

      const selector = selectBalancesByCurrentlySelectedGroup();
      const result = selector(eurState);

      expect(result?.currency).toBe('EUR');
    });
  });
});
