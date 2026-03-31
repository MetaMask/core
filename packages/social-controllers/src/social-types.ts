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
  imageUrl?: string;
};

/**
 * Social media handles attached to a trader profile.
 */
export type SocialHandles = {
  twitter?: string;
  farcaster?: string;
  ens?: string;
  lens?: string;
};

/**
 * A single trade within a position.
 */
export type Trade = {
  /** "buy" or "sell". */
  direction: string;
  /** Quantity traded. */
  tokenAmount: number;
  /** USD value of the trade. */
  usdCost: number;
  /** Unix timestamp. */
  timestamp: number;
  /** On-chain transaction hash. */
  transactionHash: string;
};

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
  imageUrl?: string;
  pnl30d: number;
  winRate30d?: number;
  roi30d?: number;
  tradeCount?: number;
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
  imageUrl?: string;
};

export type TraderStats = {
  pnl30d?: number;
  winRate30d?: number;
  roi30d?: number;
  tradeCount?: number;
};

export type PerChainBreakdown = {
  perChainPnl: Record<string, number>;
  perChainRoi: Record<string, number>;
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

