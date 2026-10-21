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
  union,
} from '@metamask/superstruct';

import { TRADER_RANKING_TAGS, TradeStruct } from './social-types.js';
import type { FeedItem, FeedResponse } from './social-types.js';

export const SocialHandlesStruct = structType({
  twitter: optional(nullable(string())),
  farcaster: optional(nullable(string())),
  ens: optional(nullable(string())),
  lens: optional(nullable(string())),
});

export const ProfileSummaryStruct = structType({
  profileId: string(),
  address: string(),
  name: string(),
  imageUrl: optional(nullable(string())),
});

const FeedActorStruct = assign(
  ProfileSummaryStruct,
  structType({
    winRate30d: optional(nullable(number())),
    pnl30d: optional(nullable(number())),
    tradeCount30d: optional(nullable(number())),
    followerCount: optional(nullable(number())),
  }),
);

export const PositionStruct = structType({
  positionId: string(),
  tokenSymbol: string(),
  tokenName: string(),
  tokenAddress: string(),
  chain: string(),
  positionAmount: number(),
  isOpen: optional(boolean()),
  // Incomplete Clicker metrics serialize these as `null`.
  boughtUsd: nullable(number()),
  soldUsd: nullable(number()),
  realizedPnl: nullable(number()),
  costBasis: nullable(number()),
  trades: array(TradeStruct),
  lastTradeAt: number(),
  tokenImageUrl: optional(nullable(string())),
  currentValueUSD: optional(nullable(number())),
  pnlValueUsd: optional(nullable(number())),
  pnlPercent: optional(nullable(number())),
  copyCount: optional(number()),
  perpPositionType: optional(nullable(enums(['long', 'short']))),
  perpLeverage: optional(nullable(number())),
  positionAmountWithLeverage: optional(nullable(number())),
});

export const CommentReactionProfileStruct = structType({
  id: string(),
  name: string(),
});

export const CommentEngagementStruct = structType({
  reactions: array(
    structType({
      emotion: string(),
      count: number(),
      profiles: array(CommentReactionProfileStruct),
    }),
  ),
  userReaction: nullable(string()),
  replyCount: optional(number()),
});

const AuthorCommentStruct = structType({
  uid: string(),
  text: string(),
  timestamp: number(),
  engagement: CommentEngagementStruct,
});

const SwapCommentAuthorStruct = structType({
  id: string(),
  name: string(),
  images: optional(
    structType({
      raw: nullable(string()),
      xs: nullable(string()),
      sm: nullable(string()),
    }),
  ),
  addresses: optional(array(string())),
  externalId: optional(string()),
});

export const SwapCommentResponseStruct = structType({
  uid: string(),
  transactionHash: string(),
  chain: string(),
  tokenAddress: string(),
  commentText: string(),
  author: SwapCommentAuthorStruct,
  timestamp: number(),
  isAppUserComment: boolean(),
  metrics: CommentEngagementStruct,
});

export const FeedItemStruct = assign(
  PositionStruct,
  structType({
    actor: FeedActorStruct,
    timestamp: number(),
    authorComment: optional(nullable(AuthorCommentStruct)),
    commentCount: optional(number()),
    replyCount: optional(number()),
    copyCount: optional(number()),
    firstTradeAt: optional(nullable(number())),
    holdTimeMs: optional(nullable(number())),
    entryPriceUsd: optional(nullable(number())),
    eventId: optional(string()),
    revision: optional(number()),
    occurredAt: optional(string()),
  }),
);

const FeedPaginationStruct = structType({
  olderCursor: nullable(string()),
  newerCursor: nullable(string()),
});

const FeedResponseStruct = structType({
  items: array(FeedItemStruct),
  pagination: FeedPaginationStruct,
});

/**
 * One malformed feed item must not blank the page or a realtime batch.
 * The envelope remains invalid only when its top-level shape is unusable.
 *
 * @param feedData - Parsed JSON response or realtime batch payload.
 * @param invalidMessage - Error message for an unusable response envelope.
 * @returns The validated response with malformed items removed.
 */
export const parseFeedResponse = (
  feedData: unknown,
  invalidMessage: string,
): FeedResponse => {
  if (is(feedData, FeedResponseStruct)) {
    return feedData;
  }

  if (
    typeof feedData !== 'object' ||
    feedData === null ||
    !('items' in feedData) ||
    !('pagination' in feedData)
  ) {
    throw new Error(invalidMessage);
  }

  const { items, pagination } = feedData;

  if (!Array.isArray(items) || !is(pagination, FeedPaginationStruct)) {
    throw new Error(invalidMessage);
  }

  return {
    items: items.filter((item): item is FeedItem => is(item, FeedItemStruct)),
    pagination,
  };
};

export {
  normalizeRealtimeFeedItem,
  parseRealtimeFeedItem,
} from './realtime-feed-item.js';
export type { RealtimeFeedEventData } from './realtime-feed-item.js';

export const TraderProfileStruct = structType({
  profileId: string(),
  address: string(),
  allAddresses: array(string()),
  name: string(),
  imageUrl: optional(nullable(string())),
  createdAt: optional(nullable(string())),
});

export const TraderStatsStruct = structType({
  pnl30d: optional(nullable(number())),
  winRate30d: optional(nullable(number())),
  roiPercent30d: optional(nullable(number())),
  tradeCount30d: optional(nullable(number())),
  volumeUsd30d: optional(nullable(number())),
  pnl7d: optional(nullable(number())),
  winRate7d: optional(nullable(number())),
  roiPercent7d: optional(nullable(number())),
  tradeCount7d: optional(nullable(number())),
  medianHoldMinutes: optional(nullable(number())),
});

export const PerChainBreakdownStruct = structType({
  perChainPnl: record(string(), number()),
  perChainRoi: record(string(), nullable(number())),
  perChainVolume: record(string(), number()),
  perChainPnl7d: optional(record(string(), number())),
  perChainRoi7d: optional(record(string(), nullable(number()))),
  perChainVolume7d: optional(record(string(), number())),
});

export const CopytradedAllTimeStruct = structType({
  count: number(),
  volumeUSD: number(),
  distinctActors: number(),
});

export const TraderProfileResponseStruct = structType({
  profile: TraderProfileStruct,
  stats: TraderStatsStruct,
  perChainBreakdown: PerChainBreakdownStruct,
  socialHandles: SocialHandlesStruct,
  followerCount: number(),
  followingCount: number(),
  copytradedAllTime: CopytradedAllTimeStruct,
  rankingTag: optional(nullable(enums(TRADER_RANKING_TAGS))),
});

export const PaginationStruct = structType({
  hasMore: boolean(),
  nextPage: optional(number()),
});

const LeaderboardEntryStruct = structType({
  rank: number(),
  addresses: array(string()),
  profileId: string(),
  name: string(),
  imageUrl: optional(nullable(string())),
  pnl30d: number(),
  winRate30d: optional(nullable(number())),
  roiPercent30d: optional(nullable(number())),
  tradeCount30d: optional(nullable(number())),
  pnl7d: optional(nullable(number())),
  winRate7d: optional(nullable(number())),
  roiPercent7d: optional(nullable(number())),
  tradeCount7d: optional(nullable(number())),
  pnlPerChain: record(string(), number()),
  followerCount: number(),
  socialHandles: SocialHandlesStruct,
});

export const LeaderboardResponseStruct = structType({
  traders: array(LeaderboardEntryStruct),
});

const CopyTradeAccountStruct = structType({
  profileId: string(),
  caip10: string(),
});

export const CopyTradeIntentResponseStruct = structType({
  id: string(),
  origin: structType({
    kind: literal('comment'),
    id: string(),
  }),
  copierAccount: CopyTradeAccountStruct,
  sourceAccount: nullable(CopyTradeAccountStruct),
  execution: union([
    structType({ product: literal('swaps'), quoteId: string() }),
    structType({ product: literal('perps'), oid: string() }),
  ]),
  payoutEligibility: structType({
    status: enums(['payable', 'non_payable']),
    reason: string(),
  }),
  createdAt: string(),
});

export const PositionsResponseStruct = structType({
  positions: array(PositionStruct),
  pagination: PaginationStruct,
  computedAt: optional(nullable(string())),
});

export const FollowersResponseStruct = structType({
  followers: array(ProfileSummaryStruct),
  count: number(),
});

export const FollowingResponseStruct = structType({
  following: array(ProfileSummaryStruct),
  count: number(),
});

export const FollowResponseStruct = structType({
  followed: array(ProfileSummaryStruct),
});

export const UnfollowResponseStruct = structType({
  unfollowed: array(ProfileSummaryStruct),
});

const BlockedProfileStruct = structType({
  blockedAt: number(),
  reason: nullable(string()),
  profile: ProfileSummaryStruct,
});

export const BlockedProfilesResponseStruct = structType({
  items: array(BlockedProfileStruct),
  cursor: nullable(string()),
});

const BlockedContentStruct = structType({
  blockedAt: number(),
  reason: nullable(string()),
  type: enums(['comment', 'reply']),
  id: string(),
  text: string(),
  createdAt: number(),
  author: nullable(ProfileSummaryStruct),
});

export const BlockedContentResponseStruct = structType({
  items: array(BlockedContentStruct),
  cursor: nullable(string()),
});
