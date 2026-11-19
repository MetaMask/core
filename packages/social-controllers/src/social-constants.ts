export const serviceName = 'SocialService';

export const controllerName = 'SocialController';

export const SocialServiceErrorMessage = {
  FETCH_LEADERBOARD_FAILED: 'SocialService: Leaderboard request failed',
  FETCH_TRADER_PROFILE_FAILED: 'SocialService: Trader profile request failed',
  FETCH_OPEN_POSITIONS_FAILED: 'SocialService: Open positions request failed',
  FETCH_CLOSED_POSITIONS_FAILED:
    'SocialService: Closed positions request failed',
  FETCH_FOLLOWERS_FAILED: 'SocialService: Followers request failed',
  FETCH_FOLLOWING_FAILED: 'SocialService: Following request failed',
  FETCH_TRADER_FOLLOWING_FAILED:
    'SocialService: Trader following request failed',
  FETCH_MY_FOLLOWERS_FAILED: 'SocialService: My followers request failed',
  FOLLOW_FAILED: 'SocialService: Follow request failed',
  UNFOLLOW_FAILED: 'SocialService: Unfollow request failed',
  FETCH_POSITION_BY_ID_FAILED: 'SocialService: Position request failed',
  LEADERBOARD_OPT_OUT_FAILED:
    'SocialService: Leaderboard opt-out request failed',
  LEADERBOARD_OPT_IN_FAILED: 'SocialService: Leaderboard opt-in request failed',
  FETCH_FEED_FAILED: 'SocialService: Feed request failed',
  FETCH_TRADER_FEED_FAILED: 'SocialService: Trader feed request failed',
  FETCH_TOKEN_FEED_FAILED: 'SocialService: Token feed request failed',
  REACT_TO_COMMENT_FAILED: 'SocialService: Comment reaction request failed',
  REMOVE_COMMENT_REACTION_FAILED:
    'SocialService: Comment reaction removal request failed',
  CREATE_SWAP_COMMENT_FAILED: 'SocialService: Swap comment request failed',
  TRANSLATE_COMMENT_FAILED: 'SocialService: Comment translation request failed',
  CREATE_COPY_TRADE_INTENT_FAILED:
    'SocialService: Copy-trade intent request failed',
  NOTIFICATION_PREFERENCES_CACHE_REFRESH_FAILED:
    'SocialService: Notification preferences cache refresh request failed',
  BLOCK_FAILED: 'SocialService: Block request failed',
  UNBLOCK_PROFILE_FAILED: 'SocialService: Unblock profile request failed',
  FETCH_BLOCKED_PROFILES_FAILED:
    'SocialService: Blocked profiles request failed',
  FETCH_BLOCKED_CONTENT_FAILED: 'SocialService: Blocked content request failed',
  FETCH_MODERATION_STATUS_FAILED:
    'SocialService: Moderation status request failed',
  FETCH_QUOTE_TOKENS_FAILED: 'SocialService: Quote tokens request failed',
  FETCH_TRENDING_GIFS_FAILED: 'SocialService: Trending GIFs request failed',
  FETCH_SEARCH_GIFS_FAILED: 'SocialService: GIF search request failed',
} as const;
