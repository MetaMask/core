import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { CaipAccountId } from '@metamask/utils';

import type { ProfileControllerMethodActions } from './ProfileController-method-action-types.js';
import type {
  ProfileServiceCheckUsernameAvailabilityAction,
  ProfileServiceConnectXAction,
  ProfileServiceCreateProfileAction,
  ProfileServiceDeleteProfileAction,
  ProfileServiceDisconnectXAction,
  ProfileServiceGetProfileAction,
  ProfileServiceGetXAccountAction,
  ProfileServiceGetXAuthUrlAction,
  ProfileServiceReplaceProfileAction,
  ProfileServiceUpdateProfileAction,
} from './ProfileService-method-action-types.js';
import type {
  CreateProfileParams,
  CreateProfileResponse,
  ProfileApiResponse,
  ReplaceProfileParams,
  UpdateProfileParams,
  UsernameAvailabilityResponse,
  ConnectXResponse,
} from './ProfileService.js';

const controllerName = 'ProfileController';

// === TYPES ===

/** Representation of a profile stored in controller state. */
export type Profile = {
  /** The canonical profile ID connected to the profile. */
  profileId: string;
  /** The username for the profile. */
  username: string;
  /** The display name for the profile. */
  displayName: string;
  /** The bio for the profile. */
  bio: string;
  /** The linked addresses for the profile. */
  linkedAddresses: CaipAccountId[];
  /** The avatar URL for the profile. */
  avatarUrl: string;
  /** Whether the profile's trading activity is visible to the public. */
  tradingPrivacy: 'public' | 'private';
  /** Whether the profile is connected to X. */
  connectedToX: boolean;
  /** The date and time the profile was created. */
  createdAt: string;
  /** The date and time the profile was updated. */
  updatedAt: string;
};

/** Representation of a linked X (Twitter) profile stored in controller state. */
export type XProfile = {
  /** The unique identifier for the X profile. This is the user ID of the X profile. */
  xUserId: string;
  /** The URL for the X profile. */
  xProfileUrl: string;
  /** The username for the X profile. */
  username: string;
  /** The display name for the X profile. */
  displayName: string;
  /** The avatar URL for the X profile. */
  avatarUrl: string;
  /** The date and time the X profile was created. */
  createdAt: string;
  /** The date and time the X profile was updated. */
  updatedAt: string;
};

/** Ephemeral session data for initiating the X OAuth flow. Not stored in controller state. */
export type ConnectXSession = {
  /** The X authorization URL to open in a system browser. */
  authorizationUrl: string;
  /** The OAuth state parameter to compare against the X redirect callback. */
  state: string;
};

/** State managed by ProfileController. */
export type ProfileControllerState = {
  profile: Profile;
  xProfile?: XProfile;
};

// === MESSENGER ===

/** The `ProfileController:getState` action type. */
export type ProfileControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ProfileControllerState
>;

/** Union of all actions exposed by ProfileController. */
export type ProfileControllerActions =
  | ProfileControllerGetStateAction
  | ProfileControllerMethodActions;

/** The `ProfileController:stateChanged` event type. */
export type ProfileControllerChangeEvent = ControllerStateChangedEvent<
  typeof controllerName,
  ProfileControllerState
>;

/** Union of all events emitted by ProfileController. */
export type ProfileControllerEvents = ProfileControllerChangeEvent;

type AllowedActions =
  | ProfileServiceCreateProfileAction
  | ProfileServiceReplaceProfileAction
  | ProfileServiceUpdateProfileAction
  | ProfileServiceDeleteProfileAction
  | ProfileServiceCheckUsernameAvailabilityAction
  | ProfileServiceConnectXAction
  | ProfileServiceGetXAccountAction
  | ProfileServiceGetXAuthUrlAction
  | ProfileServiceDisconnectXAction
  | ProfileServiceGetProfileAction;

export type AllowedEvents = never;

/** Messenger type for ProfileController, scoped to its actions, events, and allowed service calls. */
export type ProfileControllerMessenger = Messenger<
  typeof controllerName,
  ProfileControllerActions | AllowedActions,
  ProfileControllerEvents | AllowedEvents
>;

// === STATE ===

const profileControllerMetadata = {
  profile: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  xProfile: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
} satisfies StateMetadata<ProfileControllerState>;

/**
 * Returns the default initial state for ProfileController.
 *
 * @returns A ProfileControllerState with empty profile fields and no X profile.
 */
export function getDefaultProfileControllerState(): ProfileControllerState {
  return {
    profile: {
      profileId: '',
      username: '',
      displayName: '',
      bio: '',
      linkedAddresses: [],
      avatarUrl: '',
      tradingPrivacy: 'public',
      connectedToX: false,
      createdAt: '',
      updatedAt: '',
    },
  };
}

const MESSENGER_EXPOSED_METHODS = [
  'getProfile',
  'getXProfile',
  'createProfile',
  'replaceProfile',
  'updateProfile',
  'deleteProfile',
  'checkUsernameAvailability',
  'connectX',
  'fetchAndUpdateXAccount',
  'fetchAndUpdateProfile',
  'getXAuthorizationUrl',
  'disconnectX',
  'clearState',
] as const;

// === CONTROLLER ===

/** Manages MetaMask profile state and delegates API operations to ProfileService. */
export class ProfileController extends BaseController<
  typeof controllerName,
  ProfileControllerState,
  ProfileControllerMessenger
> {
  /**
   * Creates a new ProfileController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - The messenger scoped to ProfileController.
   * @param options.state - Optional partial initial state to merge with defaults.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: ProfileControllerMessenger;
    state?: Partial<ProfileControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: profileControllerMetadata,
      state: {
        ...getDefaultProfileControllerState(),
        ...state,
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Returns true if a profile has been created and exists in state.
   *
   * @returns True if a profile exists, false otherwise.
   */
  #hasProfile(): boolean {
    return this.state.profile.profileId !== '';
  }

  /**
   * Returns the profile ID from state, throwing if no profile exists yet.
   *
   * @returns The current profile ID.
   * @throws If no profile has been created.
   */
  #getProfileIdOrThrow(): string {
    const { profileId } = this.state.profile;
    if (!profileId) {
      throw new Error('ProfileController: no profile found in state');
    }
    return profileId;
  }

  /**
   * Maps an API response to a MetaMask profile.
   *
   * @param response - The API response to map.
   * @returns The mapped MetaMask profile.
   */
  #mapApiResponseToProfile(response: ProfileApiResponse): Profile {
    return {
      profileId: response.profile_id,
      username: response.username,
      displayName: response.display_name,
      bio: response.bio ?? '',
      linkedAddresses: response.linked_addresses,
      avatarUrl: response.avatar_url,
      tradingPrivacy: response.trading_privacy,
      connectedToX: response.connected_to_x,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
    };
  }

  /**
   * Maps an API response to an X profile.
   *
   * @param response - The API response to map.
   * @returns The mapped X profile.
   */
  #mapXResponseToXProfile(response: ConnectXResponse): XProfile {
    return {
      xUserId: response.x_user_id,
      xProfileUrl: response.x_profile_url,
      username: response.username,
      displayName: response.display_name,
      avatarUrl: response.avatar_url,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
    };
  }

  /**
   * Returns the current MetaMask profile from state, or undefined if none has been created.
   *
   * @returns The MetaMask profile, or undefined.
   */
  getProfile(): Profile | undefined {
    if (!this.#hasProfile()) {
      return undefined;
    }
    return this.state.profile;
  }

  /**
   * Returns the currently linked X profile from state, or undefined if none has been connected.
   *
   * @returns The X profile, or undefined.
   */
  getXProfile(): XProfile | undefined {
    return this.state.xProfile;
  }

  /**
   * Creates a new MetaMask profile, updates state, and returns the created profile.
   *
   * @param params - The profile creation parameters.
   * @returns The created MetaMask profile.
   */
  async createProfile(params: CreateProfileParams): Promise<Profile> {
    const response: CreateProfileResponse = await this.messenger.call(
      'ProfileService:createProfile',
      params,
    );
    const mapped = this.#mapApiResponseToProfile(response);
    this.update((state) => {
      state.profile = mapped;
    });
    return mapped;
  }

  /**
   * Fully replaces the current profile and updates state.
   *
   * @param input - The replacement profile data.
   * @throws If no profile has been created yet.
   */
  async replaceProfile(input: ReplaceProfileParams): Promise<void> {
    const profileId = this.#getProfileIdOrThrow();
    const response = await this.messenger.call(
      'ProfileService:replaceProfile',
      profileId,
      input,
    );
    this.update((state) => {
      state.profile = this.#mapApiResponseToProfile(response);
    });
  }

  /**
   * Partially updates the current profile and updates state.
   *
   * @param input - The fields to update.
   * @throws If no profile has been created yet.
   */
  async updateProfile(input: UpdateProfileParams): Promise<void> {
    const profileId = this.#getProfileIdOrThrow();
    const response = await this.messenger.call(
      'ProfileService:updateProfile',
      profileId,
      input,
    );
    this.update((state) => {
      state.profile = this.#mapApiResponseToProfile(response);
    });
  }

  /**
   * Deletes the current profile and resets state, including clearing any linked X profile.
   *
   * @throws If no profile has been created yet.
   */
  async deleteProfile(): Promise<void> {
    const profileId = this.#getProfileIdOrThrow();
    await this.messenger.call('ProfileService:deleteProfile', profileId);
    this.update((state) => {
      state.profile = getDefaultProfileControllerState().profile;
      state.xProfile = undefined;
    });
  }

  /**
   * Checks whether a username is available.
   *
   * @param username - The username to check.
   * @returns Availability details including validity and normalized form.
   */
  async checkUsernameAvailability(
    username: string,
  ): Promise<UsernameAvailabilityResponse> {
    return await this.messenger.call(
      'ProfileService:checkUsernameAvailability',
      username,
    );
  }

  /**
   * Completes the X OAuth flow for the profile in state and returns the
   * linked X profile. Updates controller state with the linked X profile.
   *
   * @param params - The parameters for the X OAuth flow.
   * @param params.code - The OAuth authorization code from the X redirect.
   * @param params.state - The state parameter returned by the X redirect.
   * @returns The linked X profile.
   */
  async connectX(params: { code: string; state: string }): Promise<XProfile> {
    const response = await this.messenger.call('ProfileService:connectX', {
      code: params.code,
      state: params.state,
    });
    const mapped = this.#mapXResponseToXProfile(response);
    this.update((state) => {
      state.xProfile = mapped;
    });
    return mapped;
  }

  /**
   * Fetches the X account linked to the authenticated profile, updates state,
   * and returns the X profile. The profile is resolved server-side from the
   * verified bearer token.
   *
   * @returns The linked X profile.
   */
  async fetchAndUpdateXAccount(): Promise<XProfile> {
    const response = await this.messenger.call('ProfileService:getXAccount');
    const mapped = this.#mapXResponseToXProfile(response);
    this.update((state) => {
      state.xProfile = mapped;
    });
    return mapped;
  }

  /**
   * Fetches a profile by its identifier and updates state.
   *
   * @param profileId - The profile identifier to fetch.
   * @returns The fetched profile.
   */
  async fetchAndUpdateProfile(profileId: string): Promise<Profile> {
    const response = await this.messenger.call(
      'ProfileService:getProfile',
      profileId,
    );
    const mapped = this.#mapApiResponseToProfile(response);
    this.update((state) => {
      state.profile = mapped;
    });
    return mapped;
  }

  /**
   * Initiates the X OAuth flow by fetching the authorization URL from the backend.
   * The profile is resolved server-side from the verified bearer token.
   * Returns session data for the caller to use; nothing is stored in controller state.
   *
   * @returns The X authorization URL and state parameter.
   */
  async getXAuthorizationUrl(): Promise<ConnectXSession> {
    const response = await this.messenger.call('ProfileService:getXAuthUrl');
    return { authorizationUrl: response.url, state: response.state };
  }

  /**
   * Disconnects the X account linked to the given profile. If the given
   * profile matches the profile in state, clears `xProfile` from state and
   * marks the profile in state as no longer connected to X.
   *
   * @param profileId - The ID of the profile to disconnect the linked X account
   * from (sourced from {@link getProfile}).
   */
  async disconnectX(profileId: string): Promise<void> {
    await this.messenger.call('ProfileService:disconnectX', profileId);
    this.update((state) => {
      if (state.profile.profileId === profileId) {
        state.xProfile = undefined;
        state.profile.connectedToX = false;
      }
    });
  }

  /**
   * Clears the controller state, including the profile and X profile.
   */
  clearState(): void {
    this.update((state) => getDefaultProfileControllerState());
  }
}
