export const serviceName = 'SocialService';

export const controllerName = 'SocialController';

export const SocialServiceErrorMessage = {
  FETCH_LEADERBOARD_FAILED: 'SocialService: Leaderboard request failed',
  FETCH_LEADERBOARD_INVALID_RESPONSE:
    'SocialService: Leaderboard returned invalid response',
  FETCH_TRADER_PROFILE_FAILED: 'SocialService: Trader profile request failed',
  FETCH_TRADER_PROFILE_INVALID_RESPONSE:
    'SocialService: Trader profile returned invalid response',
  FETCH_OPEN_POSITIONS_FAILED: 'SocialService: Open positions request failed',
  FETCH_OPEN_POSITIONS_INVALID_RESPONSE:
    'SocialService: Open positions returned invalid response',
  FETCH_CLOSED_POSITIONS_FAILED:
    'SocialService: Closed positions request failed',
  FETCH_CLOSED_POSITIONS_INVALID_RESPONSE:
    'SocialService: Closed positions returned invalid response',
  FETCH_FOLLOWERS_FAILED: 'SocialService: Followers request failed',
  FETCH_FOLLOWERS_INVALID_RESPONSE:
    'SocialService: Followers returned invalid response',
  FETCH_FOLLOWING_FAILED: 'SocialService: Following request failed',
  FETCH_FOLLOWING_INVALID_RESPONSE:
    'SocialService: Following returned invalid response',
  FOLLOW_FAILED: 'SocialService: Follow request failed',
  FOLLOW_INVALID_RESPONSE: 'SocialService: Follow returned invalid response',
  UNFOLLOW_FAILED: 'SocialService: Unfollow request failed',
  UNFOLLOW_INVALID_RESPONSE:
    'SocialService: Unfollow returned invalid response',
} as const;
