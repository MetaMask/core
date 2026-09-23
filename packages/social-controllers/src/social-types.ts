import type { Infer } from '@metamask/superstruct';
import {
  enums,
  nullable,
  number,
  optional,
  string,
  type as structType,
} from '@metamask/superstruct';

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

/**
 * Minimal profile summary used across follow/follower responses.
 */
export type ProfileSummary = {
  /** Clicker profile ID (UUID). */
  profileId: string;
  /** Primary wallet address. */
  address: string;
  /** Display name or truncated address. */
  name: string;
  /** Profile avatar URL. */
  imageUrl?: string | null;
};

/**
 * Trader attached to a feed item. Extends {@link ProfileSummary} with the
 * profile stats the feed hydrator already loaded and used to drop.
 *
 * Every field is optional: a social-api that predates them omits the keys,
 * and `null` means the window has no data (distinct from "not sent").
 */
export type FeedActorSummary = ProfileSummary & {
  /** 30-day win rate as a 0–1 ratio. */
  winRate30d?: number | null;
  /** 30-day realized PnL in USD. */
  pnl30d?: number | null;
  /** 30-day sell count behind `winRate30d`. */
  tradeCount30d?: number | null;
  /** Profiles following this trader. */
  followerCount?: number | null;
};

/**
 * Social media handles attached to a trader profile.
 */
export type SocialHandles = {
  twitter?: string | null;
  farcaster?: string | null;
  ens?: string | null;
  lens?: string | null;
};

/**
 * Where a fill sits in its position's lifecycle.
 *
 * Deliberately asset-agnostic so the classification is computed once, upstream:
 * clients render `opened / added / reduced / closed` for perps and
 * `bought / bought more / sold some / sold all` for spot from the same value.
 *
 * Distinct from `intent`, which only says whether the fill grew or shrank the
 * position — `intent: 'exit'` covers both a partial trim and a full close.
 */
export type TradeAction = 'opened' | 'added' | 'reduced' | 'closed';

export const TradeStruct = structType({
  direction: enums(['buy', 'sell']),
  intent: enums(['enter', 'exit']),
  /**
   * Lifecycle stage of this fill. Absent on responses from a social-api that
   * predates the field, so treat it as a hint and keep a client-side fallback.
   */
  action: optional(enums(['opened', 'added', 'reduced', 'closed'])),
  category: optional(string()),
  /** High-level trade classification. `null` when Clicker does not classify. */
  classification: optional(
    nullable(enums(['spot', 'perp', 'send', 'receive'])),
  ),
  /** Perp side for this fill. `null` for spot trades. */
  perpPositionType: optional(nullable(enums(['long', 'short']))),
  /** Leverage multiplier for perp trades (e.g. `5` for 5x). `null` for spot. */
  perpLeverage: optional(nullable(number())),
  tokenAmount: number(),
  usdCost: number(),
  /** Token market cap in USD at trade time. `null` when Clicker has no mark. */
  marketCap: optional(nullable(number())),
  timestamp: number(),
  transactionHash: string(),
});

export type Trade = Infer<typeof TradeStruct>;

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/**
 * A single entry in the leaderboard response.
 */
export type LeaderboardEntry = {
  rank: number;
  addresses: string[];
  profileId: string;
  name: string;
  imageUrl?: string | null;
  pnl30d: number;
  winRate30d?: number | null;
  /** Renamed from roi30d. */
  roiPercent30d?: number | null;
  /** Renamed from tradeCount. */
  tradeCount30d?: number | null;
  pnl7d?: number | null;
  winRate7d?: number | null;
  roiPercent7d?: number | null;
  tradeCount7d?: number | null;
  pnlPerChain: Record<string, number>;
  followerCount: number;
  socialHandles: SocialHandles;
};

/**
 * Response from `GET /v1/leaderboard`.
 */
export type LeaderboardResponse = {
  traders: LeaderboardEntry[];
};

// ---------------------------------------------------------------------------
// Trader profile
// ---------------------------------------------------------------------------

/** Values for `TraderProfileResponse.rankingTag` from social-api. */
export const TRADER_RANKING_TAGS = ['shrimp', 'dolphin', 'whale'] as const;

export type TraderRankingTag = (typeof TRADER_RANKING_TAGS)[number];

export type TraderProfile = {
  profileId: string;
  address: string;
  allAddresses: string[];
  name: string;
  imageUrl?: string | null;
};

export type TraderStats = {
  pnl30d?: number | null;
  winRate30d?: number | null;
  /** Renamed from roi30d. */
  roiPercent30d?: number | null;
  /** Renamed from tradeCount. */
  tradeCount30d?: number | null;
  /** 30-day trading volume in USD. */
  volumeUsd30d?: number | null;
  pnl7d?: number | null;
  winRate7d?: number | null;
  roiPercent7d?: number | null;
  tradeCount7d?: number | null;
  /** Median holding time in minutes. */
  medianHoldMinutes?: number | null;
};

export type CopytradedAllTime = {
  count: number;
  volumeUSD: number;
  distinctActors: number;
};

export type PerChainBreakdown = {
  perChainPnl: Record<string, number>;
  /** ROI can be null for chains with no trading activity (zero cost-basis). */
  perChainRoi: Record<string, number | null>;
  perChainVolume: Record<string, number>;
  /**
   * 7-day per-chain PnL in USD. Optional: older social-api versions only
   * return the 30-day breakdown (`perChainPnl`). The unsuffixed fields above
   * remain the 30-day window for backward compatibility.
   */
  perChainPnl7d?: Record<string, number>;
  /** 7-day per-chain ROI. Null for chains with no trading activity. */
  perChainRoi7d?: Record<string, number | null>;
  /** 7-day per-chain volume in USD. */
  perChainVolume7d?: Record<string, number>;
};

/**
 * Response from `GET /v1/traders/:addressOrId/profile`.
 */
export type TraderProfileResponse = {
  profile: TraderProfile;
  stats: TraderStats;
  perChainBreakdown: PerChainBreakdown;
  socialHandles: SocialHandles;
  followerCount: number;
  followingCount: number;
  /**
   * Linked copy-swap stats for this trader. Social-api always sends zeros
   * when there are none.
   */
  copytradedAllTime: CopytradedAllTime;
  /**
   * Backend-derived tier from the Auth primary account 30d PnL. Omitted on older
   * social-api builds; `null` when unclaimed or activity is insufficient.
   */
  rankingTag?: TraderRankingTag | null;
};

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export type Position = {
  positionId: string;
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  chain: string;
  positionAmount: number;
  /**
   * Whether the position still carries exposure. Clicker's own verdict, which
   * beats a `positionAmount === 0` check: it survives precision dust and
   * distinguishes "no position" from "a position of size ~0". Absent on
   * responses from a social-api that predates the field.
   */
  isOpen?: boolean;
  boughtUsd: number;
  soldUsd: number;
  realizedPnl: number;
  costBasis: number;
  trades: Trade[];
  lastTradeAt: number;
  /** Daylight-hosted token image URL. */
  tokenImageUrl?: string | null;
  /** Current USD value of the remaining position (open positions only). */
  currentValueUSD?: number | null;
  /** Unrealized + realized PnL in USD. */
  pnlValueUsd?: number | null;
  /** PnL as a percentage of cost basis. */
  pnlPercent?: number | null;
  /** Perp side of the position. `null`/absent for spot positions. */
  perpPositionType?: 'long' | 'short' | null;
  /** Leverage multiplier for perp positions. `null`/absent for spot. */
  perpLeverage?: number | null;
  /**
   * Leveraged/notional position size as reported by Clicker. NOT necessarily
   * `positionAmount` × `perpLeverage` — the ratio varies for positions built
   * across fills at different leverage, so use this field directly rather than
   * deriving it, and treat `perpLeverage` as the authoritative leverage. This is
   * notional exposure, not capital at risk (the margin/capital at risk is
   * `costBasis`). Hyperliquid/perp positions only; absent for spot.
   */
  positionAmountWithLeverage?: number | null;
};

export type Pagination = {
  hasMore: boolean;
  nextPage?: number;
};

/**
 * Response from `GET /v1/traders/:addressOrId/positions/open`
 * and `GET /v1/traders/:addressOrId/positions/closed`.
 */
export type PositionsResponse = {
  positions: Position[];
  pagination: Pagination;
  /** ISO 8601 timestamp indicating when the response was computed server-side. */
  computedAt?: string | null;
};

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

/**
 * One emotion's aggregated count on a Call (swap comment), plus an optional
 * facepile sample. `profiles` is always present on the wire and is often empty.
 */
export type CommentReaction = {
  emotion: string;
  count: number;
  profiles: CommentReactionProfile[];
};

export type CommentReactionProfile = {
  id: string;
  name: string;
};

/**
 * Engagement on a Call. Counts live on `reactions`; do not read deprecated
 * `likeCount` / `isLikedByUser` even if the social-api still emits them as 0/false.
 */
export type CommentEngagement = {
  reactions: CommentReaction[];
  /** Viewer's own emotion, when the hydrator was given their profile. */
  userReaction: string | null;
  /** Reply count on the comment. Present on feed `authorComment`, not on write responses. */
  replyCount?: number;
};

/**
 * Position thesis for the feed big card. `null` when that intent phase has no Call.
 */
export type AuthorComment = {
  uid: string;
  text: string;
  /** Unix timestamp (seconds) when the comment was created. */
  timestamp: number;
  engagement: CommentEngagement;
};

/**
 * A single trader-activity feed item: a {@link Position} the trade belongs to,
 * plus the {@link FeedActorSummary} of the trader who made it (`actor`) and the
 * item's creation `timestamp` (Unix seconds).
 */
export type FeedItem = Position & {
  /** The trader who made this trade. */
  actor: FeedActorSummary;
  /** Unix timestamp (seconds) when the feed item was created. */
  timestamp: number;
  /**
   * Latest author Call in the current intent phase. Absent on older social-api
   * builds; `null` when that phase has no comment.
   */
  authorComment?: AuthorComment | null;
  /** Author comments on this position. Absent on older social-api builds. */
  commentCount?: number;
  /** Replies across those comments. Absent on older social-api builds. */
  replyCount?: number;
  /**
   * How long the position has been held, in milliseconds. A closed position
   * is measured from its first fill to its last; an open one is measured to
   * the time the response was built, so it keeps growing between requests.
   * `null` when the first fill is unknown. Absent on older social-api builds.
   */
  holdTimeMs?: number | null;
  /**
   * Average entry price in USD from remaining cost basis / remaining holding.
   * `null` when the position is flat. Absent on older social-api builds.
   */
  entryPriceUsd?: number | null;
};

export type ReactToCommentOptions = {
  commentId: string;
  /** Emoji or short code (1–64 chars), e.g. `👍`. */
  emotion: string;
};

export type RemoveCommentReactionOptions = {
  commentId: string;
};

/**
 * Cursor pagination for the feed. Pass `olderCursor` back as `olderThan` to
 * load older items (infinite scroll), and `newerCursor` as `newerThan` to
 * fetch newer items. `null` when there are no items in that direction.
 */
export type FeedPagination = {
  olderCursor: string | null;
  newerCursor: string | null;
};

/**
 * Response from `GET /v1/feed`.
 */
export type FeedResponse = {
  items: FeedItem[];
  pagination: FeedPagination;
};

// ---------------------------------------------------------------------------
// Followers
// ---------------------------------------------------------------------------

/**
 * Response from `GET /v1/traders/:addressOrId/followers`.
 */
export type FollowersResponse = {
  followers: ProfileSummary[];
  count: number;
};

// ---------------------------------------------------------------------------
// Following
// ---------------------------------------------------------------------------

/**
 * Response from `GET /v1/users/me/following`.
 */
export type FollowingResponse = {
  following: ProfileSummary[];
  count: number;
};

// ---------------------------------------------------------------------------
// Follow / Unfollow
// ---------------------------------------------------------------------------

/**
 * Response from `PUT /v1/users/me/follows`.
 */
export type FollowResponse = {
  followed: ProfileSummary[];
};

/**
 * Response from `DELETE /v1/users/me/follows`.
 */
export type UnfollowResponse = {
  unfollowed: ProfileSummary[];
};

// ---------------------------------------------------------------------------
// Fetch options
// ---------------------------------------------------------------------------

export type FetchLeaderboardOptions = {
  sort?: 'pnl' | 'winRate' | 'roi';
  chains?: string[];
  limit?: number;
};

export type FetchTraderProfileOptions = {
  /** Wallet address or Clicker profile ID. */
  addressOrId: string;
};

export type FetchPositionsOptions = {
  /** Wallet address or Clicker profile ID. */
  addressOrId: string;
  chain?: string;
  sort?: 'value' | 'latest';
  limit?: number;
  page?: number;
};

export type FetchFollowersOptions = {
  /** Wallet address or Clicker profile ID. */
  addressOrId: string;
};

export type FetchFeedOptions = {
  /**
   * Which feed to fetch: `following` (personalized to the current user,
   * identified server-side from the JWT) or `leaderboard` (generic, shared by
   * all users). Defaults to `following` server-side when omitted.
   */
  scope?: 'following' | 'leaderboard';
  /**
   * Filter by one or more chains, given as CAIP-2 chain ids (e.g.
   * `eip155:8453`). Omit for the server defaults.
   */
  chains?: string[];
  /** Number of results to return. */
  limit?: number;
  /** Cursor for older items (infinite scroll). Use `pagination.olderCursor`. */
  olderThan?: string;
  /** Cursor for newer items (pull to refresh). Use `pagination.newerCursor`. */
  newerThan?: string;
};

export type FetchPositionByIdOptions = {
  /** Unique position ID (UUID). */
  positionId: string;
};

export type FollowOptions = {
  /** Array of wallet addresses or profile IDs to follow. */
  targets: string[];
};

export type UnfollowOptions = {
  /** Array of wallet addresses or profile IDs to unfollow. */
  targets: string[];
};

// ---------------------------------------------------------------------------
// Controller state
// ---------------------------------------------------------------------------

/**
 * State managed by the SocialController.
 *
 * The controller acts as a simple store — no TTL or eviction logic.
 * The UI decides when to re-fetch; the social-api's own cache layer
 * handles upstream rate-limiting.
 */
export type SocialControllerState = {
  /** Cached ranked trader list from the last `updateLeaderboard` call. */
  leaderboardEntries: LeaderboardEntry[];
  /** Wallet addresses the current user follows. */
  followingAddresses: string[];
  /** Clicker profile IDs the current user follows — used by mobile UI. */
  followingProfileIds: string[];
};
