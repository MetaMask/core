import { describe, expect, it } from 'vitest';

import {
  normalizeRealtimeFeedItem,
  parseRealtimeFeedItem,
} from './realtime-feed-item.js';

const fullHydratedPosition = {
  itemId: 'position-1',
  timestamp: 100,
  cardLatestTradeAt: 101,
  actor: {
    type: 'user',
    address: '0xactor',
    name: 'Trader',
    images: { raw: 'raw-avatar', xs: null, sm: 'small-avatar' },
    profile: {
      id: 'profile-1',
      metadata: {
        winRate30d: 0.75,
        pnl30d: 120,
        tradeCount30d: 8,
      },
    },
    followerCount: 4,
  },
  metadata: {
    tokenChain: 'base',
    tokenSymbol: 'TKN',
    tokenName: 'Token',
    tokenAddress: '0xtoken',
    positionAmount: 2,
    positionStats: {
      boughtUSD: 100,
      soldUSD: 20,
      realizedGainsUSD: 5,
      holdingsCostBasisUSD: 60,
      receivedCostBasisUSD: 10,
      holdingReceivedCostBasisUSD: 3,
      isOpen: true,
    },
    perpPositionType: null,
    perpLeverage: null,
    positionAmountWithLeverage: 2,
    trades: [
      {
        tokenAmount: -1,
        usdCost: -20,
        marketCap: null,
        timestamp: 90,
        transactionHash: '0xexit',
        direction: 'sell',
        classification: null,
        intent: 'exit',
        perpPositionType: null,
        perpLeverage: null,
        comments: [],
      },
      {
        tokenAmount: 2,
        usdCost: 100,
        marketCap: 1000,
        timestamp: 100,
        transactionHash: '0xenter',
        direction: 'buy',
        classification: 'spot',
        intent: 'enter',
        perpPositionType: null,
        perpLeverage: null,
        comments: [
          {
            uid: 'comment-0',
            commentText: 'Earlier',
            timestamp: 99,
            metrics: null,
            replies: null,
          },
          {
            uid: 'comment-1',
            commentText: 'Hello',
            timestamp: 100,
            metrics: {
              reactions: [
                null,
                { emotion: 1, count: 'invalid' },
                { emotion: 'Invalid count', count: 'invalid' },
                { emotion: 'No profiles', count: 1, profiles: null },
                {
                  emotion: '👍',
                  count: 2,
                  profiles: [
                    { id: 'profile-2', name: 'Reacting trader' },
                    { id: 1, name: 'Invalid profile' },
                  ],
                },
              ],
              userReaction: '👍',
              replyCount: 2,
            },
            replies: [{}],
          },
        ],
      },
      {
        tokenAmount: 1,
        usdCost: 10,
        marketCap: null,
        timestamp: 95,
        transactionHash: '0xenter-earlier',
        direction: 'buy',
        classification: 'spot',
        intent: 'enter',
        perpPositionType: null,
        perpLeverage: null,
        comments: [],
      },
    ],
  },
  metrics: {
    reactions: [],
    userReaction: null,
    commentCount: 1,
    replyCount: 1,
    copyCount: 3,
  },
  imageUrl: 'token-image',
  firstTradeAt: 80,
  holdTimeMs: null,
  entryPriceUsd: 40,
};

const compactFeedItem = {
  itemId: 'position-compact',
  timestamp: 100,
  cardLatestTradeAt: 101,
  actor: {
    type: 'user',
    address: '0xactor',
    name: 'Trader',
    images: {},
    profile: { id: 'profile-1', metadata: {} },
  },
  metadata: {
    tokenChain: 'base',
    tokenAddress: '0xtoken',
    trades: [{ intent: 'enter', comments: [] }],
  },
};

describe('parseRealtimeFeedItem', () => {
  it('normalizes a full hydrated position into a feed item', () => {
    const item = normalizeRealtimeFeedItem(fullHydratedPosition);
    const parsed = parseRealtimeFeedItem(fullHydratedPosition);

    expect(item).toMatchObject({
      positionId: 'position-1',
      tokenSymbol: 'TKN',
      chain: 'base',
      positionAmount: 2,
      boughtUsd: 110,
      costBasis: 63,
      lastTradeAt: 101,
      actor: {
        profileId: 'profile-1',
        imageUrl: 'small-avatar',
        winRate30d: 0.75,
      },
      authorComment: {
        uid: 'comment-1',
        text: 'Hello',
        engagement: {
          replyCount: 2,
        },
      },
    });
    expect(item?.authorComment?.engagement.reactions).toContainEqual(
      expect.objectContaining({ emotion: '👍', count: 2 }),
    );
    expect(item?.trades[1]).toMatchObject({
      category: 'spot',
      classification: 'spot',
      marketCap: 1000,
    });
    expect(parsed).toMatchObject({ positionId: 'position-1' });
  });

  it('rejects compact event payloads', () => {
    expect(parseRealtimeFeedItem(compactFeedItem)).toBeUndefined();
  });

  it('handles optional perp metadata and malformed comments', () => {
    const value = {
      ...fullHydratedPosition,
      metadata: {
        ...fullHydratedPosition.metadata,
        perpPositionType: 'short',
        perpLeverage: 5,
        positionAmountWithLeverage: 10,
        trades: [
          {
            ...fullHydratedPosition.metadata.trades[0],
            classification: 'perp',
            perpPositionType: 'short',
            perpLeverage: 5,
            comments: [
              null,
              {
                uid: 'comment-invalid-metrics',
                commentText: 'Invalid metrics',
                timestamp: 98,
                metrics: {
                  reactions: null,
                  userReaction: 1,
                  replyCount: 'invalid',
                },
                replies: [],
              },
              { uid: 1 },
            ],
          },
        ],
      },
    };

    expect(normalizeRealtimeFeedItem(value)).toMatchObject({
      authorComment: {
        uid: 'comment-invalid-metrics',
        engagement: {
          reactions: [],
          userReaction: null,
          replyCount: 0,
        },
      },
      perpPositionType: 'short',
      perpLeverage: 5,
      positionAmountWithLeverage: 10,
    });
  });

  it('rejects incomplete event data', () => {
    expect(parseRealtimeFeedItem({ itemId: 'missing-fields' })).toBeUndefined();
  });

  it('rejects incomplete normalized feed items', () => {
    expect(
      parseRealtimeFeedItem({
        positionId: 'position-1',
        tokenSymbol: 'TKN',
        tokenName: 'Token',
        tokenAddress: '0xtoken',
        chain: 'base',
        trades: [],
        actor: {},
      }),
    ).toBeUndefined();
  });

  it('normalizes a full position without optional comments or metrics', () => {
    const value = {
      ...fullHydratedPosition,
      actor: {
        ...fullHydratedPosition.actor,
        images: { raw: null, xs: null, sm: null },
        profile: { id: 'profile-1', metadata: {} },
        followerCount: undefined,
      },
      metadata: {
        ...fullHydratedPosition.metadata,
        positionAmountWithLeverage: undefined,
        trades: [
          {
            ...fullHydratedPosition.metadata.trades[0],
            comments: [],
          },
        ],
        positionStats: {
          ...fullHydratedPosition.metadata.positionStats,
          receivedCostBasisUSD: 0,
          holdingReceivedCostBasisUSD: 0,
        },
      },
      metrics: {
        reactions: [],
        userReaction: null,
        commentCount: 0,
        replyCount: 0,
      },
      imageUrl: undefined,
      firstTradeAt: undefined,
      holdTimeMs: undefined,
      entryPriceUsd: undefined,
    };

    expect(normalizeRealtimeFeedItem(value)).toMatchObject({
      authorComment: null,
      actor: {
        imageUrl: null,
        winRate30d: null,
      },
      copyCount: 0,
      firstTradeAt: null,
      holdTimeMs: null,
      entryPriceUsd: null,
      trades: [{ intent: 'exit' }],
    });
  });

  it('normalizes nullable hydrated position fields', () => {
    const value = {
      ...fullHydratedPosition,
      actor: {
        ...fullHydratedPosition.actor,
        followerCount: null,
      },
      metadata: {
        ...fullHydratedPosition.metadata,
        positionAmountWithLeverage: null,
        positionStats: {
          ...fullHydratedPosition.metadata.positionStats,
          boughtUSD: null,
          soldUSD: null,
          realizedGainsUSD: null,
          holdingsCostBasisUSD: null,
          receivedCostBasisUSD: null,
          holdingReceivedCostBasisUSD: null,
        },
      },
      metrics: {
        ...fullHydratedPosition.metrics,
        copyCount: null,
      },
      imageUrl: null,
    };

    expect(normalizeRealtimeFeedItem(value)).toMatchObject({
      boughtUsd: null,
      soldUsd: null,
      realizedPnl: null,
      costBasis: null,
      tokenImageUrl: null,
      positionAmountWithLeverage: null,
      actor: { followerCount: null },
      copyCount: 0,
    });
    expect(parseRealtimeFeedItem(value)).toMatchObject({
      positionId: 'position-1',
      boughtUsd: null,
    });
  });

  it('returns no author comment for an empty trade history', () => {
    const value = {
      ...fullHydratedPosition,
      metadata: {
        ...fullHydratedPosition.metadata,
        trades: [],
      },
    };

    expect(normalizeRealtimeFeedItem(value)?.authorComment).toBeNull();
  });
});
