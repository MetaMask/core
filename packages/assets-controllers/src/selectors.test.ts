import { selectBalancesByAccountGroup } from './selectors';
import type { AccountGroupBalance } from './selectors';

// Mock reselect
jest.mock('reselect', () => ({
  createSelector: jest.fn((selectors, combiner) => {
    return (state: any) => {
      const selectedValues = selectors.map((selector: any) => selector(state));
      return combiner(...selectedValues);
    };
  }),
}));

describe('selectBalancesByAccountGroup', () => {
  const mockEntropySource = '0x123...entropy-source-1';
  const mockGroupIndex = 0;
  
  let mockMessenger: any;
  let mockState: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock messenger with MultichainAccountService calls
    mockMessenger = {
      call: jest.fn()
    };

    // Create comprehensive mock state
    mockState = {
      messenger: mockMessenger,
      TokenBalancesController: {
        tokenBalances: {
          '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5': {
            '0x1': {
              '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5': '1000000000000000000', // 1 ETH worth of tokens
              '0xdAC17F958D2ee523a2206206994597C13D831ec7': '2000000000' // 2000 USDT (6 decimals)
            },
            '0x89': {
              '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270': '5000000000000000000' // 5 MATIC
            }
          },
          '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6': {
            '0x1': {
              '0xA0b86a33E6842C2dBB8cD9264C1B6bA4E3fB8b5': '500000000000000000' // 0.5 ETH worth
            }
          }
        }
      },
      CurrencyRateController: {
        currentCurrency: 'USD',
        currencyRates: {
          'ETH': {
            conversionRate: 2000,
            conversionDate: Date.now() / 1000,
            usdConversionRate: 2000
          },
          'MATIC': {
            conversionRate: 0.8,
            conversionDate: Date.now() / 1000,
            usdConversionRate: 0.8
          }
        }
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
              currency: 'ETH'
            },
            '0xdAC17F958D2ee523a2206206994597C13D831ec7': {
              price: 0.0005, // USDT price in ETH
              marketCap: 50000000,
              currency: 'ETH'
            }
          },
          '0x89': {
            '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270': {
              price: 1.0, // MATIC price in ETH equivalent
              currency: 'ETH'
            }
          }
        }
      },
      MultichainAssetsRatesController: {
        conversionRates: {
          'bip122:000000000019d6689c085ae165831e93/slip44:501': {
            rate: 150, // SOL to USD
            currency: 'USD'
          },
          'bip122:000000000019d6689c085ae165831e93/slip44:501/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
            rate: 1.0, // USDC to USD
            currency: 'USD'
          }
        }
      },
      MultichainBalancesController: {
        balances: {
          'solana-account-1': {
            'bip122:000000000019d6689c085ae165831e93/slip44:501': {
              amount: '2000000000', // 2 SOL in lamports
              unit: 'lamports'
            },
            'bip122:000000000019d6689c085ae165831e93/slip44:501/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
              amount: '100000000', // 100 USDC
              unit: 'microunits'
            }
          }
        }
      }
    };
  });

  describe('with mixed EVM and Solana accounts', () => {
    beforeEach(() => {
      // Mock MultichainAccountService to return mixed account types
      mockMessenger.call.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' }
            }
          },
          {
            id: 'evm-account-2', 
            address: '0x8ba1c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e6',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' }
            }
          },
          {
            id: 'solana-account-1',
            address: 'So11111111111111111111111111111111111111112',
            type: 'bip122:000000000019d6689c085ae165831e93',
            metadata: {
              keyring: { type: 'Snap Keyring' }
            }
          }
        ]
      });
    });

    it('returns correct aggregated balance for mixed-chain account groups', () => {
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result: AccountGroupBalance = selector(mockState);
      
      expect(result).toEqual({
        groupId: `${mockEntropySource}-${mockGroupIndex}`,
        aggregatedBalance: expect.any(Number),
        currency: 'USD',
      });
      
      expect(mockMessenger.call).toHaveBeenCalledWith(
        'MultichainAccountService:getMultichainAccount',
        { entropySource: mockEntropySource, groupIndex: mockGroupIndex }
      );
      
      // Verify the balance is greater than 0 (should include EVM + Solana balances)
      expect(result.aggregatedBalance).toBeGreaterThan(0);
    });

    it('calculates correct EVM balance conversions', () => {
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      // Expected calculation:
      // Account 1: 
      // - Token A: 1 * 1.5 * 2000 = 3000 USD
      // - USDT: (2000000000 / 10^6) * 0.0005 * 2000 = 2000 USD  
      // Account 2:
      // - Token A: 0.5 * 1.5 * 2000 = 1500 USD
      // Solana Account:
      // - SOL: 2 * 150 = 300 USD
      // - USDC: 100 * 1.0 = 100 USD
      // Total: 6900 USD
      
      expect(result.aggregatedBalance).toBeCloseTo(6900, 0);
    });
  });

  describe('with only EVM accounts', () => {
    beforeEach(() => {
      mockMessenger.call.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' }
            }
          }
        ]
      });
    });

    it('processes EVM accounts correctly', () => {
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      expect(result.aggregatedBalance).toBeGreaterThan(0);
      expect(result.currency).toBe('USD');
    });
  });

  describe('with only Solana accounts', () => {
    beforeEach(() => {
      mockMessenger.call.mockReturnValue({
        getAccounts: () => [
          {
            id: 'solana-account-1',
            address: 'So11111111111111111111111111111111111111112',
            type: 'bip122:000000000019d6689c085ae165831e93',
            metadata: {
              keyring: { type: 'Snap Keyring' }
            }
          }
        ]
      });
    });

    it('processes Solana accounts correctly', () => {
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      // Expected: (2 SOL * 150) + (100 USDC * 1.0) = 400 USD
      expect(result.aggregatedBalance).toBeCloseTo(400, 0);
      expect(result.currency).toBe('USD');
    });
  });

  describe('error handling', () => {
    it('handles empty account groups gracefully', () => {
      mockMessenger.call.mockReturnValue({
        getAccounts: () => []
      });
      
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      expect(result).toEqual({
        groupId: `${mockEntropySource}-${mockGroupIndex}`,
        aggregatedBalance: 0,
        currency: 'USD',
      });
    });

    it('handles MultichainAccountService errors gracefully', () => {
      mockMessenger.call.mockImplementation(() => {
        throw new Error('Group not found');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      expect(result).toEqual({
        groupId: `${mockEntropySource}-${mockGroupIndex}`,
        aggregatedBalance: 0,
        currency: 'USD',
      });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error getting accounts for group:',
        { entropySource: mockEntropySource, groupIndex: mockGroupIndex },
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('handles missing balance data gracefully', () => {
      mockMessenger.call.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-missing',
            address: '0x999999999999999999999999999999999999999',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' }
            }
          }
        ]
      });
      
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      expect(result.aggregatedBalance).toBe(0);
      expect(result.currency).toBe('USD');
    });

    it('handles missing rate data gracefully', () => {
      // Remove rate data
      mockState.TokenRatesController.marketData = {};
      mockState.MultichainAssetsRatesController.conversionRates = {};
      
      mockMessenger.call.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' }
            }
          }
        ]
      });
      
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      expect(result.aggregatedBalance).toBe(0);
      expect(result.currency).toBe('USD');
    });

    it('handles currency conversion errors gracefully', () => {
      // Remove ETH rate data
      mockState.CurrencyRateController.currencyRates = {};
      
      mockMessenger.call.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' }
            }
          }
        ]
      });
      
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      expect(result.aggregatedBalance).toBe(0);
      expect(result.currency).toBe('USD');
    });
  });

  describe('performance and memoization', () => {
    it('returns the same reference when state has not changed', () => {
      mockMessenger.call.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' }
            }
          }
        ]
      });
      
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
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
          keyring: { type: 'HD Key Tree' }
        }
      }));
      
      mockMessenger.call.mockReturnValue({
        getAccounts: () => manyAccounts
      });
      
      const startTime = Date.now();
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
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
      
      mockMessenger.call.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' }
            }
          }
        ]
      });
      
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      expect(result.currency).toBe('EUR');
    });
  });

  describe('data shape validation', () => {
    it('returns correct data shape and types', () => {
      mockMessenger.call.mockReturnValue({
        getAccounts: () => [
          {
            id: 'evm-account-1',
            address: '0x742c15c32e3d1f7ab24b9d1b7e6d8c19e2c3d4e5',
            type: 'eip155:eoa',
            metadata: {
              keyring: { type: 'HD Key Tree' }
            }
          }
        ]
      });
      
      const selector = selectBalancesByAccountGroup(mockEntropySource, mockGroupIndex);
      const result = selector(mockState);
      
      expect(typeof result.groupId).toBe('string');
      expect(typeof result.aggregatedBalance).toBe('number');
      expect(typeof result.currency).toBe('string');
      
      expect(result.groupId).toBe(`${mockEntropySource}-${mockGroupIndex}`);
      expect(Number.isFinite(result.aggregatedBalance)).toBe(true);
      expect(result.currency.length).toBeGreaterThan(0);
    });
  });
});