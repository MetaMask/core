import {
  array,
  assign,
  boolean,
  enums,
  is,
  literal,
  nullable,
  number,
  optional,
  record,
  string,
  type as structType,
  unknown as unknownStruct,
} from '@metamask/superstruct';

import type {
  AuthorComment,
  CommentEngagement,
  CommentReaction,
  FeedItem,
  FeedActorSummary,
  Trade,
} from './social-types.js';
import { FeedItemStruct } from './structs.js';

const RawTradeStruct = assign(
  structType({
    tokenAmount: number(),
    usdCost: number(),
    marketCap: nullable(number()),
    timestamp: number(),
    transactionHash: string(),
    direction: enums(['buy', 'sell']),
    classification: nullable(enums(['spot', 'perp', 'send', 'receive'])),
    intent: enums(['enter', 'exit']),
    perpPositionType: nullable(enums(['long', 'short'])),
    perpLeverage: nullable(number()),
  }),
  structType({
    comments: array(unknownStruct()),
  }),
);

const RawHydratedPositionStruct = structType({
  itemId: string(),
  timestamp: number(),
  cardLatestTradeAt: number(),
  actor: structType({
    type: literal('user'),
    address: string(),
    name: string(),
    images: structType({
      raw: nullable(string()),
      xs: nullable(string()),
      sm: nullable(string()),
    }),
    profile: structType({
      id: string(),
      metadata: record(string(), unknownStruct()),
    }),
    followerCount: optional(nullable(number())),
  }),
  metadata: structType({
    tokenChain: string(),
    tokenSymbol: string(),
    tokenName: string(),
    tokenAddress: string(),
    positionAmount: number(),
    positionStats: structType({
      boughtUSD: nullable(number()),
      soldUSD: nullable(number()),
      realizedGainsUSD: nullable(number()),
      holdingsCostBasisUSD: nullable(number()),
      receivedCostBasisUSD: nullable(number()),
      holdingReceivedCostBasisUSD: nullable(number()),
      isOpen: boolean(),
    }),
    trades: array(RawTradeStruct),
    perpPositionType: optional(nullable(enums(['long', 'short']))),
    perpLeverage: optional(nullable(number())),
    positionAmountWithLeverage: optional(nullable(number())),
  }),
  metrics: structType({
    reactions: array(unknownStruct()),
    userReaction: nullable(string()),
    commentCount: number(),
    replyCount: number(),
    copyCount: optional(nullable(number())),
  }),
  imageUrl: optional(nullable(string())),
  firstTradeAt: optional(nullable(number())),
  holdTimeMs: optional(nullable(number())),
  entryPriceUsd: optional(nullable(number())),
});

export type RealtimeFeedEventData = FeedItem;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readNullableNumber = (value: unknown): number | null =>
  readNumber(value) ?? null;

const addNullableNumbers = (
  left: number | null,
  right: number | null,
): number | null => (left === null || right === null ? null : left + right);

const toCommentReaction = (value: unknown): CommentReaction | null => {
  if (!isRecord(value)) {
    return null;
  }
  const { emotion, count: rawCount } = value;
  const count = readNumber(rawCount);
  if (typeof emotion !== 'string' || count === undefined) {
    return null;
  }

  const profiles = Array.isArray(value.profiles)
    ? value.profiles.filter(isRecord).flatMap((profile) => {
        const { id, name } = profile;
        return typeof id === 'string' && typeof name === 'string'
          ? [{ id, name }]
          : [];
      })
    : [];

  return { emotion, count, profiles };
};

const toCommentEngagement = (value: unknown): CommentEngagement => {
  if (!isRecord(value)) {
    return { reactions: [], userReaction: null };
  }

  const reactions = Array.isArray(value.reactions)
    ? value.reactions
        .map(toCommentReaction)
        .filter((reaction): reaction is CommentReaction => reaction !== null)
    : [];
  const replyCount = readNumber(value.replyCount);

  return {
    reactions,
    userReaction:
      typeof value.userReaction === 'string' ? value.userReaction : null,
    ...(replyCount === undefined ? {} : { replyCount }),
  };
};

const toAuthorComment = (value: unknown): AuthorComment | null => {
  if (!isRecord(value)) {
    return null;
  }
  const { uid, commentText: text, timestamp: rawTimestamp, replies } = value;
  const timestamp = readNumber(rawTimestamp);
  if (
    typeof uid !== 'string' ||
    typeof text !== 'string' ||
    timestamp === undefined
  ) {
    return null;
  }

  const replyCount = Array.isArray(replies) ? replies.length : 0;
  const engagement = toCommentEngagement(value.metrics);

  return {
    uid,
    text,
    timestamp,
    engagement: {
      ...engagement,
      ...(engagement.replyCount === undefined ? { replyCount } : {}),
    },
  };
};

const toLatestAuthorComment = (
  trades: {
    intent: 'enter' | 'exit';
    timestamp: number;
    comments: unknown[];
  }[],
): AuthorComment | null => {
  if (trades.length === 0) {
    return null;
  }

  const latestTrade = trades.reduce((latest, trade) =>
    trade.timestamp >= latest.timestamp ? trade : latest,
  );
  const candidates = trades
    .filter((trade) => trade.intent === latestTrade.intent)
    .flatMap((trade) =>
      trade.comments
        .map(toAuthorComment)
        .filter((comment): comment is AuthorComment => comment !== null),
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  return candidates[candidates.length - 1] ?? null;
};

const toActor = (actor: {
  address: string;
  name: string;
  images: { raw: string | null; sm: string | null };
  profile: { id: string; metadata: Record<string, unknown> };
  followerCount?: number | null;
}): FeedActorSummary => ({
  profileId: actor.profile.id,
  address: actor.address,
  name: actor.name,
  imageUrl: actor.images.sm ?? actor.images.raw,
  winRate30d: readNullableNumber(actor.profile.metadata.winRate30d),
  pnl30d: readNullableNumber(actor.profile.metadata.pnl30d),
  tradeCount30d: readNullableNumber(actor.profile.metadata.tradeCount30d),
  ...(actor.followerCount === undefined
    ? {}
    : { followerCount: actor.followerCount }),
});

const toTrade = (trade: {
  direction: 'buy' | 'sell';
  intent: 'enter' | 'exit';
  classification: 'spot' | 'perp' | 'send' | 'receive' | null;
  perpPositionType: 'long' | 'short' | null;
  perpLeverage: number | null;
  tokenAmount: number;
  usdCost: number;
  marketCap: number | null;
  timestamp: number;
  transactionHash: string;
}): Trade => ({
  direction: trade.direction,
  intent: trade.intent,
  ...(trade.classification === null ? {} : { category: trade.classification }),
  classification: trade.classification,
  perpPositionType: trade.perpPositionType,
  perpLeverage: trade.perpLeverage,
  tokenAmount: trade.tokenAmount,
  usdCost: trade.usdCost,
  marketCap: trade.marketCap,
  timestamp: trade.timestamp,
  transactionHash: trade.transactionHash,
});

const isNormalizedRealtimeFeedItem = (value: unknown): value is FeedItem =>
  is(value, FeedItemStruct);

export const normalizeRealtimeFeedItem = (
  value: unknown,
): FeedItem | undefined => {
  if (!is(value, RawHydratedPositionStruct)) {
    return undefined;
  }

  const stats = value.metadata.positionStats;
  const receivedCostBasis = stats.receivedCostBasisUSD;
  const holdingReceivedCostBasis = stats.holdingReceivedCostBasisUSD;

  return {
    positionId: value.itemId,
    tokenSymbol: value.metadata.tokenSymbol,
    tokenName: value.metadata.tokenName,
    tokenAddress: value.metadata.tokenAddress,
    chain: value.metadata.tokenChain,
    positionAmount: value.metadata.positionAmount,
    isOpen: stats.isOpen,
    boughtUsd: addNullableNumbers(stats.boughtUSD, receivedCostBasis),
    soldUsd: stats.soldUSD,
    realizedPnl: stats.realizedGainsUSD,
    costBasis: addNullableNumbers(
      stats.holdingsCostBasisUSD,
      holdingReceivedCostBasis,
    ),
    trades: value.metadata.trades.map(toTrade),
    lastTradeAt: value.cardLatestTradeAt,
    tokenImageUrl: value.imageUrl,
    perpPositionType: value.metadata.perpPositionType,
    perpLeverage: value.metadata.perpLeverage,
    positionAmountWithLeverage:
      value.metadata.positionAmountWithLeverage ?? null,
    actor: toActor(value.actor),
    timestamp: value.timestamp,
    authorComment: toLatestAuthorComment(value.metadata.trades),
    commentCount: value.metrics.commentCount,
    replyCount: value.metrics.replyCount,
    copyCount: value.metrics.copyCount ?? 0,
    firstTradeAt: value.firstTradeAt ?? null,
    holdTimeMs: value.holdTimeMs ?? null,
    entryPriceUsd: value.entryPriceUsd ?? null,
  };
};

export const parseRealtimeFeedItem = (
  value: unknown,
): RealtimeFeedEventData | undefined => {
  const normalized = normalizeRealtimeFeedItem(value);
  if (normalized) {
    return normalized;
  }

  return isNormalizedRealtimeFeedItem(value) ? value : undefined;
};
