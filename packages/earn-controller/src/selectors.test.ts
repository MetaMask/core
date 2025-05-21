import type { LendingMarket } from '@metamask/stake-sdk';

import type {
  EarnControllerState,
  LendingPositionWithMarket,
} from './EarnController';
import {
  selectLendingMarkets,
  selectLendingPositions,
  selectLendingMarketsByProtocolAndId,
  selectLendingMarketForProtocolAndId,
  selectLendingMarketsForChainId,
  selectLendingMarketsByChainId,
  selectLendingPositionsWithMarket,
  selectLendingPositionsByChainId,
  selectLendingMarketsWithPosition,
  selectLendingPositionsByProtocol,
  selectLendingMarketByProtocolAndTokenAddress,
  selectLendingMarketForProtocolAndTokenAddress,
} from './selectors';

describe('Earn Controller Selectors', () => {
  const mockMarket1: LendingMarket = {
    id: 'market1',
    protocol: 'aave-v3' as LendingMarket['protocol'],
    chainId: 1,
    name: 'Market 1',
    address: '0x123',
    tvlUnderlying: '1000',
    netSupplyRate: 5,
    totalSupplyRate: 5,
    underlying: {
      address: '0x123',
      chainId: 1,
    },
    outputToken: {
      address: '0x456',
      chainId: 1,
    },
    rewards: [
      {
        token: {
          address: '0x789',
          chainId: 1,
        },
        rate: 0,
      },
    ],
  };

  const mockMarket2: LendingMarket = {
    id: 'market2',
    protocol: 'compound-v3' as LendingMarket['protocol'],
    chainId: 2,
    name: 'Market 2',
    address: '0x456',
    tvlUnderlying: '2000',
    netSupplyRate: 6,
    totalSupplyRate: 6,
    underlying: {
      address: '0x456',
      chainId: 2,
    },
    outputToken: {
      address: '0xabc',
      chainId: 2,
    },
    rewards: [
      {
        token: {
          address: '0xdef',
          chainId: 2,
        },
        rate: 0,
      },
    ],
  };

  const mockPosition1: LendingPositionWithMarket = {
    id: 'position1',
    chainId: 1,
    assets: '100',
    marketId: 'market1',
    marketAddress: '0x123',
    protocol: 'aave-v3' as LendingMarket['protocol'],
    market: mockMarket1,
  };

  const mockPosition2: LendingPositionWithMarket = {
    id: 'position2',
    chainId: 2,
    assets: '200',
    marketId: 'market2',
    marketAddress: '0x456',
    protocol: 'compound-v3' as LendingMarket['protocol'],
    market: mockMarket2,
  };

  const mockState: EarnControllerState = {
    lending: {
      markets: [mockMarket1, mockMarket2],
      positions: [mockPosition1, mockPosition2],
      isEligible: true,
    },
    pooled_staking: {
      '0': {
        pooledStakes: {
          account: '',
          lifetimeRewards: '0',
          assets: '0',
          exitRequests: [],
        },
        exchangeRate: '1',
        vaultMetadata: {
          apy: '0',
          capacity: '0',
          feePercent: 0,
          totalAssets: '0',
          vaultAddress: '0x0000000000000000000000000000000000000000',
        },
        vaultDailyApys: [],
        vaultApyAverages: {
          oneDay: '0',
          oneWeek: '0',
          oneMonth: '0',
          threeMonths: '0',
          sixMonths: '0',
          oneYear: '0',
        },
      },
      isEligible: false,
    },
    lastUpdated: 0,
  };

  describe('selectLendingMarkets', () => {
    it('should return all lending markets', () => {
      const result = selectLendingMarkets(mockState);
      expect(result).toStrictEqual([mockMarket1, mockMarket2]);
    });
  });

  describe('selectLendingPositions', () => {
    it('should return all lending positions', () => {
      const result = selectLendingPositions(mockState);
      expect(result).toStrictEqual([mockPosition1, mockPosition2]);
    });
  });

  describe('selectLendingMarketsByProtocolAndId', () => {
    it('should group markets by protocol and id', () => {
      const result = selectLendingMarketsByProtocolAndId(mockState);
      expect(result).toStrictEqual({
        'aave-v3': {
          market1: mockMarket1,
        },
        'compound-v3': {
          market2: mockMarket2,
        },
      });
    });
  });

  describe('selectLendingMarketForProtocolAndId', () => {
    it('should return market for given protocol and id', () => {
      const result = selectLendingMarketForProtocolAndId(
        'aave-v3',
        'market1',
      )(mockState);
      expect(result).toStrictEqual(mockMarket1);
      const result2 = selectLendingMarketForProtocolAndId(
        'compound-v3',
        'market2',
      )(mockState);
      expect(result2).toStrictEqual(mockMarket2);
      const result3 = selectLendingMarketForProtocolAndId(
        'invalid',
        'invalid',
      )(mockState);
      expect(result3).toBeUndefined();
    });
  });

  describe('selectLendingMarketsForChainId', () => {
    it('should return markets for given chain id', () => {
      const result = selectLendingMarketsForChainId(1)(mockState);
      expect(result).toStrictEqual([mockMarket1]);
      const result2 = selectLendingMarketsForChainId(2)(mockState);
      expect(result2).toStrictEqual([mockMarket2]);
      const result3 = selectLendingMarketsForChainId(999)(mockState);
      expect(result3).toStrictEqual([]);
    });
  });

  describe('selectLendingMarketsByChainId', () => {
    it('should group markets by chain id', () => {
      const result = selectLendingMarketsByChainId(mockState);
      expect(result).toStrictEqual({
        1: [mockMarket1],
        2: [mockMarket2],
      });
    });
  });

  describe('selectLendingPositionsWithMarket', () => {
    it('should return positions with their associated markets', () => {
      const result = selectLendingPositionsWithMarket(mockState);
      expect(result).toStrictEqual([mockPosition1, mockPosition2]);
    });
  });

  describe('selectLendingPositionsByChainId', () => {
    it('should group positions by chain id', () => {
      const result = selectLendingPositionsByChainId(mockState);
      expect(result).toStrictEqual({
        1: [mockPosition1],
        2: [mockPosition2],
      });
    });
  });

  describe('selectLendingMarketsWithPosition', () => {
    it('should return markets with their associated positions', () => {
      const result = selectLendingMarketsWithPosition(mockState);
      expect(result).toHaveLength(2);
      expect(result[0]).toStrictEqual({
        ...mockMarket1,
        position: {
          ...mockPosition1,
          market: undefined,
        },
      });
    });
  });

  describe('selectLendingPositionsByProtocol', () => {
    it('should group positions by protocol', () => {
      const result = selectLendingPositionsByProtocol(mockState);
      expect(result).toStrictEqual({
        'aave-v3': [mockPosition1],
        'compound-v3': [mockPosition2],
      });
    });
  });

  describe('selectLendingMarketByProtocolAndTokenAddress', () => {
    it('should group markets by protocol and token address', () => {
      const result = selectLendingMarketByProtocolAndTokenAddress(mockState);
      expect(result).toStrictEqual({
        'aave-v3': {
          '0x123': {
            ...mockMarket1,
            position: {
              ...mockPosition1,
              market: undefined,
            },
          },
        },
        'compound-v3': {
          '0x456': {
            ...mockMarket2,
            position: {
              ...mockPosition2,
              market: undefined,
            },
          },
        },
      });
    });
  });

  describe('selectLendingMarketForProtocolAndTokenAddress', () => {
    it('should return market for given protocol and token address', () => {
      const result = selectLendingMarketForProtocolAndTokenAddress(
        'aave-v3',
        '0x123',
      )(mockState);
      expect(result).toStrictEqual({
        ...mockMarket1,
        position: {
          ...mockPosition1,
          market: undefined,
        },
      });
      const result2 = selectLendingMarketForProtocolAndTokenAddress(
        'invalid',
        'invalid',
      )(mockState);
      expect(result2).toBeUndefined();
    });
  });
});
