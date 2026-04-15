import type { Infer } from '@metamask/superstruct';
import {
  enums,
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
  tokenAmount: number(),
  usdCost: number(),
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
 * Response from `GET /v1/users/:addressOrUid/following`.
 */
export type FollowingResponse = {
  following: ProfileSummary[];
  count: number;
};

// ---------------------------------------------------------------------------
// Follow / Unfollow
// ---------------------------------------------------------------------------

/**
 * Response from `PUT /v1/users/:addressOrUid/follows`.
 */
export type FollowResponse = {
  followed: ProfileSummary[];
};

/**
 * Response from `DELETE /v1/users/:addressOrUid/follows`.
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

export type FetchFollowingOptions = {
  /** Wallet address or Clicker profile ID. */
  addressOrUid: string;
};

export type FollowOptions = {
  /** Wallet address or Clicker profile ID of the user. */
  addressOrUid: string;
  /** Array of wallet addresses or profile IDs to follow. */
  targets: string[];
};

export type UnfollowOptions = {
  /** Wallet address or Clicker profile ID of the user. */
  addressOrUid: string;
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
