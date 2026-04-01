/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SocialService } from './SocialService';

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
 * Fetches the list of traders a user is following.
 *
 * Calls `GET ${baseUrl}/users/${addressOrUid}/following`.
 *
 * @param options - Options bag.
 * @param options.addressOrUid - Wallet address or Clicker profile ID.
 * @returns The following response.
 */
export type SocialServiceFetchFollowingAction = {
  type: `SocialService:fetchFollowing`;
  handler: SocialService['fetchFollowing'];
};

/**
 * Follows one or more traders.
 *
 * Calls `PUT ${baseUrl}/users/${addressOrUid}/follows`.
 *
 * @param options - Options bag.
 * @param options.addressOrUid - Wallet address or Clicker profile ID of the user.
 * @param options.targets - Array of wallet addresses or profile IDs to follow.
 * @returns The follow response with confirmed follows.
 */
export type SocialServiceFollowAction = {
  type: `SocialService:follow`;
  handler: SocialService['follow'];
};

/**
 * Unfollows one or more traders.
 *
 * Calls `DELETE ${baseUrl}/users/${addressOrUid}/follows?targets=...`.
 * Targets are sent as query params because Fastify does not parse
 * request bodies on DELETE requests per RFC 9110.
 *
 * @param options - Options bag.
 * @param options.addressOrUid - Wallet address or Clicker profile ID of the user.
 * @param options.targets - Array of wallet addresses or profile IDs to unfollow.
 * @returns The unfollow response with confirmed unfollows.
 */
export type SocialServiceUnfollowAction = {
  type: `SocialService:unfollow`;
  handler: SocialService['unfollow'];
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
  | SocialServiceFetchFollowingAction
  | SocialServiceFollowAction
  | SocialServiceUnfollowAction;
