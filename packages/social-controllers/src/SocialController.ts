import type {
  StateMetadata,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { SocialControllerMethodActions } from './SocialController-method-action-types';
import { controllerName } from './social-constants';
import type {
  FetchFollowingOptions,
  FetchLeaderboardOptions,
  FollowOptions,
  FollowResponse,
  FollowingResponse,
  LeaderboardResponse,
  SocialControllerState,
  SocialDataService,
  UnfollowOptions,
  UnfollowResponse,
} from './social-types';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'fetchLeaderboard',
  'followTrader',
  'unfollowTrader',
  'fetchFollowing',
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

// === MESSENGER TYPE ===

export type SocialControllerMessenger = Messenger<
  typeof controllerName,
  SocialControllerActions,
  SocialControllerEvents
>;

// === OPTIONS ===

export type SocialControllerOptions = {
  messenger: SocialControllerMessenger;
  state?: Partial<SocialControllerState>;
  socialService: SocialDataService;
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
  readonly #socialService: SocialDataService;

  constructor({ messenger, state, socialService }: SocialControllerOptions) {
    super({
      name: controllerName,
      metadata: socialControllerMetadata,
      state: {
        ...getDefaultSocialControllerState(),
        ...state,
      },
      messenger,
    });

    this.#socialService = socialService;

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
  async fetchLeaderboard(
    options?: FetchLeaderboardOptions,
  ): Promise<LeaderboardResponse> {
    const response = await this.#socialService.fetchLeaderboard(options);

    this.update((state) => {
      state.leaderboardEntries = response.traders;
    });

    return response;
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
    const response = await this.#socialService.follow(options);

    const newAddresses = response.followed.map((profile) => profile.address);

    this.update((state) => {
      const combined = new Set([...state.followingAddresses, ...newAddresses]);
      state.followingAddresses = [...combined];
    });

    return response;
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
    const response = await this.#socialService.unfollow(options);

    const removedAddresses = new Set(
      response.unfollowed.map((profile) => profile.address),
    );

    this.update((state) => {
      state.followingAddresses = state.followingAddresses.filter(
        (address) => !removedAddresses.has(address),
      );
    });

    return response;
  }

  /**
   * Fetches the list of traders the current user follows and replaces
   * the following addresses in state.
   *
   * @param options - Options bag.
   * @param options.addressOrUid - Wallet address or Clicker profile ID of the current user.
   * @returns The following response.
   */
  async fetchFollowing(
    options: FetchFollowingOptions,
  ): Promise<FollowingResponse> {
    const response = await this.#socialService.fetchFollowing(options);

    this.update((state) => {
      state.followingAddresses = response.following.map(
        (profile) => profile.address,
      );
    });

    return response;
  }
}
