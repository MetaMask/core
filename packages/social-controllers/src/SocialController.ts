import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import { controllerName } from './social-constants';
import type {
  FetchFollowingOptions,
  FetchLeaderboardOptions,
  FollowOptions,
  FollowResponse,
  FollowingResponse,
  LeaderboardResponse,
  SocialControllerState,
  UnfollowOptions,
  UnfollowResponse,
} from './social-types';
import type { SocialControllerMethodActions } from './SocialController-method-action-types';
import type {
  SocialServiceFetchFollowingAction,
  SocialServiceFetchLeaderboardAction,
  SocialServiceFollowAction,
  SocialServiceUnfollowAction,
} from './SocialService-method-action-types';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'updateLeaderboard',
  'followTrader',
  'unfollowTrader',
  'updateFollowing',
] as const;

// === ACTION TYPES ===

export type SocialControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  SocialControllerState
>;

export type SocialControllerActions =
  | SocialControllerGetStateAction
  | SocialControllerMethodActions;

// === EVENT TYPES ===

export type SocialControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  SocialControllerState
>;

export type SocialControllerEvents = SocialControllerStateChangeEvent;

// === ALLOWED ACTIONS/EVENTS ===

type AllowedActions =
  | SocialServiceFetchLeaderboardAction
  | SocialServiceFollowAction
  | SocialServiceUnfollowAction
  | SocialServiceFetchFollowingAction;

type AllowedEvents = never;

// === MESSENGER TYPE ===

export type SocialControllerMessenger = Messenger<
  typeof controllerName,
  SocialControllerActions | AllowedActions,
  SocialControllerEvents | AllowedEvents
>;

// === OPTIONS ===

export type SocialControllerOptions = {
  messenger: SocialControllerMessenger;
  state?: Partial<SocialControllerState>;
};

// === DEFAULT STATE ===

/**
 * Returns the default state for the SocialController.
 *
 * @returns A fresh default state object.
 */
export function getDefaultSocialControllerState(): SocialControllerState {
  return {
    leaderboardEntries: [],
    followingAddresses: [],
    followingProfileIds: [],
  };
}

// === STATE METADATA ===

const socialControllerMetadata: StateMetadata<SocialControllerState> = {
  leaderboardEntries: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    usedInUi: true,
  },
  followingAddresses: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    usedInUi: true,
  },
  followingProfileIds: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    usedInUi: true,
  },
};

// === CONTROLLER ===

/**
 * Controller that manages social trading state for the extension UI.
 *
 * Acts as a simple store with no TTL or eviction — the UI decides when
 * to re-fetch, and the social-api's own cache layer handles upstream
 * rate-limiting. State is persisted across sessions so the UI can render
 * immediately on startup while a fresh fetch is in flight.
 */
export class SocialController extends BaseController<
  typeof controllerName,
  SocialControllerState,
  SocialControllerMessenger
> {
  constructor({ messenger, state }: SocialControllerOptions) {
    super({
      name: controllerName,
      metadata: socialControllerMetadata,
      state: {
        ...getDefaultSocialControllerState(),
        ...state,
      },
      messenger,
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches the leaderboard and persists the entries to state.
   *
   * @param options - Optional leaderboard query parameters.
   * @returns The leaderboard response from the social-api.
   */
  async updateLeaderboard(
    options?: FetchLeaderboardOptions,
  ): Promise<LeaderboardResponse> {
    const leaderboardResponse = await this.messenger.call(
      'SocialService:fetchLeaderboard',
      options,
    );

    this.update((state) => {
      state.leaderboardEntries = leaderboardResponse.traders;
    });

    return leaderboardResponse;
  }

  /**
   * Follows one or more traders and updates the following list in state.
   *
   * @param options - Options bag.
   * @param options.addressOrUid - Wallet address or Clicker profile ID of the current user.
   * @param options.targets - Addresses or profile IDs to follow.
   * @returns The follow response with confirmed follows.
   */
  async followTrader(options: FollowOptions): Promise<FollowResponse> {
    const followResponse = await this.messenger.call(
      'SocialService:follow',
      options,
    );

    const newAddresses = [
      ...new Set(followResponse.followed.map((profile) => profile.address)),
    ];
    const newProfileIds = [
      ...new Set(followResponse.followed.map((profile) => profile.profileId)),
    ];

    this.update((state) => {
      const existing = new Set(state.followingAddresses);
      const uniqueNewAddresses = newAddresses.filter(
        (address) => !existing.has(address),
      );
      state.followingAddresses.push(...uniqueNewAddresses);

      const existingIds = new Set(state.followingProfileIds);
      const uniqueNewIds = newProfileIds.filter((id) => !existingIds.has(id));
      state.followingProfileIds.push(...uniqueNewIds);
    });

    return followResponse;
  }

  /**
   * Unfollows one or more traders and updates the following list in state.
   *
   * @param options - Options bag.
   * @param options.addressOrUid - Wallet address or Clicker profile ID of the current user.
   * @param options.targets - Addresses or profile IDs to unfollow.
   * @returns The unfollow response with confirmed unfollows.
   */
  async unfollowTrader(options: UnfollowOptions): Promise<UnfollowResponse> {
    const unfollowResponse = await this.messenger.call(
      'SocialService:unfollow',
      options,
    );

    const removedAddresses = new Set(
      unfollowResponse.unfollowed.map((profile) => profile.address),
    );
    const removedProfileIds = new Set(
      unfollowResponse.unfollowed.map((profile) => profile.profileId),
    );

    this.update((state) => {
      state.followingAddresses = state.followingAddresses.filter(
        (address) => !removedAddresses.has(address),
      );
      state.followingProfileIds = state.followingProfileIds.filter(
        (id) => !removedProfileIds.has(id),
      );
    });

    return unfollowResponse;
  }

  /**
   * Fetches the list of traders the current user follows and replaces
   * the following addresses in state.
   *
   * @param options - Options bag.
   * @param options.addressOrUid - Wallet address or Clicker profile ID of the current user.
   * @returns The following response.
   */
  async updateFollowing(
    options: FetchFollowingOptions,
  ): Promise<FollowingResponse> {
    const followingResponse = await this.messenger.call(
      'SocialService:fetchFollowing',
      options,
    );

    this.update((state) => {
      state.followingAddresses = followingResponse.following.map(
        (profile) => profile.address,
      );
      state.followingProfileIds = followingResponse.following.map(
        (profile) => profile.profileId,
      );
    });

    return followingResponse;
  }
}
