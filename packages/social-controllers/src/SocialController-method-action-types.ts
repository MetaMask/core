/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SocialController } from './SocialController';

/**
 * Fetches the leaderboard and persists the entries to state.
 */
export type SocialControllerUpdateLeaderboardAction = {
  type: `SocialController:updateLeaderboard`;
  handler: SocialController['updateLeaderboard'];
};

/**
 * Follows one or more traders and updates the following list in state.
 */
export type SocialControllerFollowTraderAction = {
  type: `SocialController:followTrader`;
  handler: SocialController['followTrader'];
};

/**
 * Unfollows one or more traders and updates the following list in state.
 */
export type SocialControllerUnfollowTraderAction = {
  type: `SocialController:unfollowTrader`;
  handler: SocialController['unfollowTrader'];
};

/**
 * Fetches the following list and replaces addresses in state.
 */
export type SocialControllerUpdateFollowingAction = {
  type: `SocialController:updateFollowing`;
  handler: SocialController['updateFollowing'];
};

/**
 * Union of all SocialController method action types.
 */
export type SocialControllerMethodActions =
  | SocialControllerUpdateLeaderboardAction
  | SocialControllerFollowTraderAction
  | SocialControllerUnfollowTraderAction
  | SocialControllerUpdateFollowingAction;
