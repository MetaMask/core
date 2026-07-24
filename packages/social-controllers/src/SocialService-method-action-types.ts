/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SocialService } from './SocialService.js';

/**
 * Fetches the leaderboard of top traders.
 *
 * Calls `GET ${baseUrl}/leaderboard`.
 *
 * @param options - Optional query parameters for sorting, chain filtering, and limit.
 * @returns The leaderboard response with ranked traders.
 */
export type SocialServiceFetchLeaderboardAction = {
  type: `SocialService:fetchLeaderboard`;
  handler: SocialService['fetchLeaderboard'];
};

/**
 * Fetches a trader's profile by address or profile ID.
 *
 * Calls `GET ${baseUrl}/traders/${addressOrId}/profile`.
 *
 * @param options - Options bag.
 * @param options.addressOrId - Wallet address or Clicker profile ID.
 * @returns The trader profile response.
 */
export type SocialServiceFetchTraderProfileAction = {
  type: `SocialService:fetchTraderProfile`;
  handler: SocialService['fetchTraderProfile'];
};

/**
 * Fetches a trader's open positions.
 *
 * Calls `GET ${baseUrl}/traders/${addressOrId}/positions/open`.
 *
 * @param options - Options bag.
 * @param options.addressOrId - Wallet address or Clicker profile ID.
 * @param options.chain - Filter by chain.
 * @param options.sort - Sort by 'value' or 'latest'.
 * @param options.limit - Number of results per page.
 * @param options.page - Page number (1-based).
 * @returns The positions response.
 */
export type SocialServiceFetchOpenPositionsAction = {
  type: `SocialService:fetchOpenPositions`;
  handler: SocialService['fetchOpenPositions'];
};

/**
 * Fetches a trader's closed positions.
 *
 * Calls `GET ${baseUrl}/traders/${addressOrId}/positions/closed`.
 *
 * @param options - Options bag.
 * @param options.addressOrId - Wallet address or Clicker profile ID.
 * @param options.chain - Filter by chain.
 * @param options.sort - Sort by 'value' or 'latest'.
 * @param options.limit - Number of results per page.
 * @param options.page - Page number (1-based).
 * @returns The positions response.
 */
export type SocialServiceFetchClosedPositionsAction = {
  type: `SocialService:fetchClosedPositions`;
  handler: SocialService['fetchClosedPositions'];
};

/**
 * Fetches a trader's MetaMask followers.
 *
 * Calls `GET ${baseUrl}/traders/${addressOrId}/followers`.
 *
 * @param options - Options bag.
 * @param options.addressOrId - Wallet address or Clicker profile ID.
 * @returns The followers response.
 */
export type SocialServiceFetchFollowersAction = {
  type: `SocialService:fetchFollowers`;
  handler: SocialService['fetchFollowers'];
};

/**
 * Fetches a single position by its unique ID.
 *
 * Calls `GET ${baseUrl}/traders/position/${positionId}`.
 *
 * @param options - Options bag.
 * @param options.positionId - Unique position ID (UUID).
 * @returns The position.
 */
export type SocialServiceFetchPositionByIdAction = {
  type: `SocialService:fetchPositionById`;
  handler: SocialService['fetchPositionById'];
};

/**
 * Fetches a page of the trader-activity feed.
 *
 * Calls `GET ${baseUrl}/feed`. For the `following` scope the current user is
 * identified server-side from the JWT sub claim carried in the Authorization
 * header; the `leaderboard` scope is generic and shared by all users.
 *
 * Cursor pagination supports infinite scroll: pass `pagination.olderCursor`
 * from a prior response back as `olderThan` to load older items, and
 * `pagination.newerCursor` as `newerThan` to fetch newer items.
 *
 * @param options - Options bag.
 * @param options.scope - `following` (default) or `leaderboard`.
 * @param options.chains - Filter by one or more chains.
 * @param options.limit - Number of results per page.
 * @param options.olderThan - Cursor for older items (scroll down).
 * @param options.newerThan - Cursor for newer items (refresh).
 * @returns The feed response with items and pagination cursors.
 */
export type SocialServiceFetchFeedAction = {
  type: `SocialService:fetchFeed`;
  handler: SocialService['fetchFeed'];
};

/**
 * Fetches the list of traders the current user is following.
 *
 * Calls `GET ${baseUrl}/users/me/following`. The caller is identified
 * server-side from the JWT sub claim carried in the Authorization header.
 *
 * @returns The following response.
 */
export type SocialServiceFetchFollowingAction = {
  type: `SocialService:fetchFollowing`;
  handler: SocialService['fetchFollowing'];
};

/**
 * Follows one or more traders on behalf of the current user.
 *
 * Calls `PUT ${baseUrl}/users/me/follows`. The caller is identified
 * server-side from the JWT sub claim carried in the Authorization header.
 *
 * @param options - Options bag.
 * @param options.targets - Array of wallet addresses or profile IDs to follow.
 * @returns The follow response with confirmed follows.
 */
export type SocialServiceFollowAction = {
  type: `SocialService:follow`;
  handler: SocialService['follow'];
};

/**
 * Unfollows one or more traders on behalf of the current user.
 *
 * Calls `DELETE ${baseUrl}/users/me/follows?targets=...`. Targets are sent
 * as query params because Fastify does not parse request bodies on DELETE
 * requests per RFC 9110. The caller is identified server-side from the JWT
 * sub claim carried in the Authorization header.
 *
 * @param options - Options bag.
 * @param options.targets - Array of wallet addresses or profile IDs to unfollow.
 * @returns The unfollow response with confirmed unfollows.
 */
export type SocialServiceUnfollowAction = {
  type: `SocialService:unfollow`;
  handler: SocialService['unfollow'];
};

/**
 * Opts the current user out of the PnL leaderboard.
 */
export type SocialServiceOptOutOfLeaderboardAction = {
  type: `SocialService:optOutOfLeaderboard`;
  handler: SocialService['optOutOfLeaderboard'];
};

/**
 * Opts the current user back into the PnL leaderboard.
 */
export type SocialServiceOptInToLeaderboardAction = {
  type: `SocialService:optInToLeaderboard`;
  handler: SocialService['optInToLeaderboard'];
};

/**
 * Union of all SocialService action types.
 */
export type SocialServiceMethodActions =
  | SocialServiceFetchLeaderboardAction
  | SocialServiceFetchTraderProfileAction
  | SocialServiceFetchOpenPositionsAction
  | SocialServiceFetchClosedPositionsAction
  | SocialServiceFetchFollowersAction
  | SocialServiceFetchPositionByIdAction
  | SocialServiceFetchFeedAction
  | SocialServiceFetchFollowingAction
  | SocialServiceFollowAction
  | SocialServiceUnfollowAction
  | SocialServiceOptOutOfLeaderboardAction
  | SocialServiceOptInToLeaderboardAction;
