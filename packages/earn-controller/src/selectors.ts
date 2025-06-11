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
    return markets.reduce(
      (acc, market) => {
        acc[market.protocol] = acc[market.protocol] || {};
        acc[market.protocol][market.id] = market;
        return acc;
      },
      {} as Record<string, Record<string, LendingMarket>>,
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
    return markets.reduce(
      (acc, market) => {
        acc[market.chainId] = acc[market.chainId] || [];
        acc[market.chainId].push(market);
        return acc;
      },
      {} as Record<number, LendingMarket[]>,
    );
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
    return positionsWithMarket.reduce(
      (acc, position) => {
        const chainId = position.market?.chainId;
        if (chainId) {
          acc[chainId] = acc[chainId] || [];
          acc[chainId].push(position);
        }
        return acc;
      },
      {} as Record<number, LendingPositionWithMarket[]>,
    );
  },
);

export const selectLendingPositionsByProtocolChainIdMarketId = createSelector(
  selectLendingPositionsWithMarket,
  (positionsWithMarket) =>
    positionsWithMarket.reduce(
      (acc, position) => {
        acc[position.protocol] ??= {};
        acc[position.protocol][position.chainId] ??= {};
        acc[position.protocol][position.chainId][position.marketId] = position;
        return acc;
      },
      {} as Record<
        string,
        Record<string, Record<string, LendingPositionWithMarket>>
      >,
    ),
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
    return marketsWithPosition.reduce(
      (acc, market) => {
        if (market.underlying?.address) {
          acc[market.underlying.address] = acc[market.underlying.address] || [];
          acc[market.underlying.address].push(market);
        }
        return acc;
      },
      {} as Record<string, LendingMarketWithPosition[]>,
    );
  },
);

export const selectLendingPositionsByProtocol = createSelector(
  selectLendingPositionsWithMarket,
  (positionsWithMarket) => {
    return positionsWithMarket.reduce(
      (acc, position) => {
        acc[position.protocol] = acc[position.protocol] || [];
        acc[position.protocol].push(position);
        return acc;
      },
      {} as Record<string, LendingPositionWithMarket[]>,
    );
  },
);

export const selectLendingMarketByProtocolAndTokenAddress = createSelector(
  selectLendingMarketsWithPosition,
  (marketsWithPosition) => {
    return marketsWithPosition.reduce(
      (acc, market) => {
        if (market.underlying?.address) {
          acc[market.protocol] = acc[market.protocol] || {};
          acc[market.protocol][market.underlying.address] = market;
        }
        return acc;
      },
      {} as Record<string, Record<string, LendingMarketWithPosition>>,
    );
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
    marketsWithPosition.reduce(
      (acc, market) => {
        if (market.outputToken?.address) {
          acc[market.chainId] = acc?.[market.chainId] || {};
          acc[market.chainId][market.outputToken.address] =
            acc?.[market.chainId]?.[market.outputToken.address] || [];
          acc[market.chainId][market.outputToken.address].push(market);
        }
        return acc;
      },
      {} as Record<string, Record<string, LendingMarketWithPosition[]>>,
    ),
  );

export const selectLendingMarketsByChainIdAndTokenAddress = createSelector(
  selectLendingMarketsWithPosition,
  (marketsWithPosition) =>
    marketsWithPosition.reduce(
      (acc, market) => {
        if (market.underlying?.address) {
          acc[market.chainId] = acc?.[market.chainId] || {};
          acc[market.chainId][market.underlying.address] =
            acc?.[market.chainId]?.[market.underlying.address] || [];
          acc[market.chainId][market.underlying.address].push(market);
        }
        return acc;
      },
      {} as Record<string, Record<string, LendingMarketWithPosition[]>>,
    ),
);

export const selectIsLendingEligible = (state: EarnControllerState) =>
  state.lending.isEligible;
