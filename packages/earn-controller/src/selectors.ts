import type { LendingMarket } from '@metamask/stake-sdk';
import { createSelector } from 'reselect';

import type {
  EarnControllerState,
  LendingMarketWithPosition,
  LendingPositionWithMarket,
} from './EarnController';

export const selectLendingMarkets = (state: EarnControllerState) =>
  state.lending.markets;

export const selectLendingPositions = (state: EarnControllerState) =>
  state.lending.positions;

export const selectLendingMarketsForChainId = (chainId: number) =>
  createSelector(selectLendingMarkets, (markets) =>
    markets.filter((market) => market.chainId === chainId),
  );

export const selectLendingMarketsByProtocolAndId = createSelector(
  selectLendingMarkets,
  (markets) => {
    return markets.reduce<Record<string, Record<string, LendingMarket>>>(
      (acc, market) => {
        acc[market.protocol] = acc[market.protocol] || {};
        acc[market.protocol][market.id] = market;
        return acc;
      },
      {},
    );
  },
);

export const selectLendingMarketForProtocolAndId = (
  protocol: string,
  id: string,
) =>
  createSelector(
    selectLendingMarketsByProtocolAndId,
    (marketsByProtocolAndId) => marketsByProtocolAndId?.[protocol]?.[id],
  );

export const selectLendingMarketsByChainId = createSelector(
  selectLendingMarkets,
  (markets) => {
    return markets.reduce<Record<number, LendingMarket[]>>((acc, market) => {
      acc[market.chainId] = acc[market.chainId] || [];
      acc[market.chainId].push(market);
      return acc;
    }, {});
  },
);

export const selectLendingPositionsWithMarket = createSelector(
  selectLendingPositions,
  selectLendingMarketsByProtocolAndId,
  (positions, marketsByProtocolAndId): LendingPositionWithMarket[] => {
    return positions.map((position) => {
      return {
        ...position,
        market:
          marketsByProtocolAndId?.[position.protocol]?.[position.marketId],
      };
    });
  },
);

export const selectLendingPositionsByChainId = createSelector(
  selectLendingPositionsWithMarket,
  (positionsWithMarket) => {
    return positionsWithMarket.reduce<
      Record<number, LendingPositionWithMarket[]>
    >((acc, position) => {
      const chainId = position.market?.chainId;
      if (chainId) {
        acc[chainId] = acc[chainId] || [];
        acc[chainId].push(position);
      }
      return acc;
    }, {});
  },
);

export const selectLendingPositionsByProtocolChainIdMarketId = createSelector(
  selectLendingPositionsWithMarket,
  (positionsWithMarket) =>
    positionsWithMarket.reduce<
      Record<string, Record<string, Record<string, LendingPositionWithMarket>>>
    >((acc, position) => {
      acc[position.protocol] ??= {};
      acc[position.protocol][position.chainId] ??= {};
      acc[position.protocol][position.chainId][position.marketId] = position;
      return acc;
    }, {}),
);

export const selectLendingMarketsWithPosition = createSelector(
  selectLendingPositionsByProtocolChainIdMarketId,
  selectLendingMarkets,
  (positionsByProtocolChainIdMarketId, lendingMarkets) =>
    lendingMarkets.map((market) => {
      const position =
        positionsByProtocolChainIdMarketId?.[market.protocol]?.[
          market.chainId
        ]?.[market.id];
      return {
        ...market,
        position: position || null,
      };
    }),
);

export const selectLendingMarketsByTokenAddress = createSelector(
  selectLendingMarketsWithPosition,
  (marketsWithPosition) => {
    return marketsWithPosition.reduce<
      Record<string, LendingMarketWithPosition[]>
    >((acc, market) => {
      if (market.underlying?.address) {
        acc[market.underlying.address] = acc[market.underlying.address] || [];
        acc[market.underlying.address].push(market);
      }
      return acc;
    }, {});
  },
);

export const selectLendingPositionsByProtocol = createSelector(
  selectLendingPositionsWithMarket,
  (positionsWithMarket) => {
    return positionsWithMarket.reduce<
      Record<string, LendingPositionWithMarket[]>
    >((acc, position) => {
      acc[position.protocol] = acc[position.protocol] || [];
      acc[position.protocol].push(position);
      return acc;
    }, {});
  },
);

export const selectLendingMarketByProtocolAndTokenAddress = createSelector(
  selectLendingMarketsWithPosition,
  (marketsWithPosition) => {
    return marketsWithPosition.reduce<
      Record<string, Record<string, LendingMarketWithPosition>>
    >((acc, market) => {
      if (market.underlying?.address) {
        acc[market.protocol] = acc[market.protocol] || {};
        acc[market.protocol][market.underlying.address] = market;
      }
      return acc;
    }, {});
  },
);

export const selectLendingMarketForProtocolAndTokenAddress = (
  protocol: string,
  tokenAddress: string,
) =>
  createSelector(
    selectLendingMarketByProtocolAndTokenAddress,
    (marketsByProtocolAndTokenAddress) =>
      marketsByProtocolAndTokenAddress?.[protocol]?.[tokenAddress],
  );

export const selectLendingMarketsByChainIdAndOutputTokenAddress =
  createSelector(selectLendingMarketsWithPosition, (marketsWithPosition) =>
    marketsWithPosition.reduce<
      Record<string, Record<string, LendingMarketWithPosition[]>>
    >((acc, market) => {
      if (market.outputToken?.address) {
        acc[market.chainId] = acc?.[market.chainId] || {};
        acc[market.chainId][market.outputToken.address] =
          acc?.[market.chainId]?.[market.outputToken.address] || [];
        acc[market.chainId][market.outputToken.address].push(market);
      }
      return acc;
    }, {}),
  );

export const selectLendingMarketsByChainIdAndTokenAddress = createSelector(
  selectLendingMarketsWithPosition,
  (marketsWithPosition) =>
    marketsWithPosition.reduce<
      Record<string, Record<string, LendingMarketWithPosition[]>>
    >((acc, market) => {
      if (market.underlying?.address) {
        acc[market.chainId] = acc?.[market.chainId] || {};
        acc[market.chainId][market.underlying.address] =
          acc?.[market.chainId]?.[market.underlying.address] || [];
        acc[market.chainId][market.underlying.address].push(market);
      }
      return acc;
    }, {}),
);

export const selectIsLendingEligible = (state: EarnControllerState) =>
  state.lending.isEligible;
