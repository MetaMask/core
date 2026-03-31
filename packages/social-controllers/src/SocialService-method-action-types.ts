/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SocialService } from './SocialService';

/**
 * Fetches the leaderboard of top traders.
 */
export type SocialServiceFetchLeaderboardAction = {
  type: `SocialService:fetchLeaderboard`;
  handler: SocialService['fetchLeaderboard'];
};

/**
 * Fetches a trader's profile by address or profile ID.
 */
export type SocialServiceFetchTraderProfileAction = {
  type: `SocialService:fetchTraderProfile`;
  handler: SocialService['fetchTraderProfile'];
};

/**
 * Fetches a trader's open positions.
 */
export type SocialServiceFetchOpenPositionsAction = {
  type: `SocialService:fetchOpenPositions`;
  handler: SocialService['fetchOpenPositions'];
};

/**
 * Fetches a trader's closed positions.
 */
export type SocialServiceFetchClosedPositionsAction = {
  type: `SocialService:fetchClosedPositions`;
  handler: SocialService['fetchClosedPositions'];
};

/**
 * Fetches a trader's MetaMask followers.
 */
export type SocialServiceFetchFollowersAction = {
  type: `SocialService:fetchFollowers`;
  handler: SocialService['fetchFollowers'];
};

/**
 * Fetches the list of traders a user is following.
 */
export type SocialServiceFetchFollowingAction = {
  type: `SocialService:fetchFollowing`;
  handler: SocialService['fetchFollowing'];
};

/**
 * Follows one or more traders.
 */
export type SocialServiceFollowAction = {
  type: `SocialService:follow`;
  handler: SocialService['follow'];
};

/**
 * Unfollows one or more traders.
 */
export type SocialServiceUnfollowAction = {
  type: `SocialService:unfollow`;
  handler: SocialService['unfollow'];
};

/**
 * Union of all SocialService method action types.
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
