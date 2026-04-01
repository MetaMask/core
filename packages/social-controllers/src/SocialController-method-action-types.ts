/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SocialController } from './SocialController';

/**
 * Fetches the leaderboard and persists the entries to state.
 *
 * @param options - Optional leaderboard query parameters.
 * @returns The leaderboard response from the social-api.
 */
export type SocialControllerUpdateLeaderboardAction = {
  type: `SocialController:updateLeaderboard`;
  handler: SocialController['updateLeaderboard'];
};

/**
 * Follows one or more traders and updates the following list in state.
 *
 * @param options - Options bag.
 * @param options.addressOrUid - Wallet address or Clicker profile ID of the current user.
 * @param options.targets - Addresses or profile IDs to follow.
 * @returns The follow response with confirmed follows.
 */
export type SocialControllerFollowTraderAction = {
  type: `SocialController:followTrader`;
  handler: SocialController['followTrader'];
};

/**
 * Unfollows one or more traders and updates the following list in state.
 *
 * @param options - Options bag.
 * @param options.addressOrUid - Wallet address or Clicker profile ID of the current user.
 * @param options.targets - Addresses or profile IDs to unfollow.
 * @returns The unfollow response with confirmed unfollows.
 */
export type SocialControllerUnfollowTraderAction = {
  type: `SocialController:unfollowTrader`;
  handler: SocialController['unfollowTrader'];
};

/**
 * Fetches the list of traders the current user follows and replaces
 * the following addresses in state.
 *
 * @param options - Options bag.
 * @param options.addressOrUid - Wallet address or Clicker profile ID of the current user.
 * @returns The following response.
 */
export type SocialControllerUpdateFollowingAction = {
  type: `SocialController:updateFollowing`;
  handler: SocialController['updateFollowing'];
};

/**
 * Union of all SocialController action types.
 */
export type SocialControllerMethodActions =
  | SocialControllerUpdateLeaderboardAction
  | SocialControllerFollowTraderAction
  | SocialControllerUnfollowTraderAction
  | SocialControllerUpdateFollowingAction;
