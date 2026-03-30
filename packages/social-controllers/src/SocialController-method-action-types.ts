/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SocialController } from './SocialController';

/**
 * Fetches the leaderboard and persists the entries to state.
 *
 * @param args - The arguments to the function.
 * @param args.options - Optional leaderboard query parameters.
 */
export type SocialControllerFetchLeaderboardAction = {
  type: `SocialController:fetchLeaderboard`;
  handler: SocialController['fetchLeaderboard'];
};

/**
 * Follows one or more traders and updates the following list in state.
 *
 * @param args - The arguments to the function.
 * @param args.options - Options bag with addressOrUid and targets.
 */
export type SocialControllerFollowTraderAction = {
  type: `SocialController:followTrader`;
  handler: SocialController['followTrader'];
};

/**
 * Unfollows one or more traders and updates the following list in state.
 *
 * @param args - The arguments to the function.
 * @param args.options - Options bag with addressOrUid and targets.
 */
export type SocialControllerUnfollowTraderAction = {
  type: `SocialController:unfollowTrader`;
  handler: SocialController['unfollowTrader'];
};

/**
 * Fetches the list of traders the current user follows and replaces
 * the following addresses in state.
 *
 * @param args - The arguments to the function.
 * @param args.options - Options bag with addressOrUid.
 */
export type SocialControllerFetchFollowingAction = {
  type: `SocialController:fetchFollowing`;
  handler: SocialController['fetchFollowing'];
};

/**
 * Union of all SocialController action types.
 */
export type SocialControllerMethodActions =
  | SocialControllerFetchLeaderboardAction
  | SocialControllerFollowTraderAction
  | SocialControllerUnfollowTraderAction
  | SocialControllerFetchFollowingAction;
