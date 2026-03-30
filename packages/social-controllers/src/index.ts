export type { SocialServiceConfig } from './SocialService';
export { SocialService } from './SocialService';

export type {
  FetchFollowersOptions,
  FetchFollowingOptions,
  FetchLeaderboardOptions,
  FetchPositionsOptions,
  FetchTraderProfileOptions,
  FollowersResponse,
  FollowOptions,
  FollowingResponse,
  FollowResponse,
  LeaderboardEntry,
  LeaderboardResponse,
  Pagination,
  PerChainBreakdown,
  Position,
  PositionsResponse,
  ProfileSummary,
  SocialDataService,
  SocialHandles,
  Trade,
  TraderProfile,
  TraderProfileResponse,
  TraderStats,
  UnfollowOptions,
  UnfollowResponse,
} from './social-types';

export {
  serviceName as socialServiceName,
  SocialServiceErrorMessage,
} from './social-constants';
