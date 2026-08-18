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
 * Social media handles attached to a trader profile.
 */
export type SocialHandles = {
  twitter?: string | null;
  farcaster?: string | null;
  ens?: string | null;
  lens?: string | null;
};

export const TradeStruct = structType({
  direction: enums(['buy', 'sell']),
  intent: enums(['enter', 'exit']),
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
  pnl7d?: number | null;
  winRate7d?: number | null;
  roiPercent7d?: number | null;
  tradeCount7d?: number | null;
  /** Median holding time in minutes. */
  medianHoldMinutes?: number | null;
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
 * A single trader-activity feed item: a {@link Position} the trade belongs to,
 * plus the {@link ProfileSummary} of the trader who made it (`actor`) and the
 * item's creation `timestamp` (Unix seconds).
 */
export type FeedItem = Position & {
  /** The trader who made this trade. */
  actor: ProfileSummary;
  /** Unix timestamp (seconds) when the feed item was created. */
  timestamp: number;
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
