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
  XConnectResponse,
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
export type XConnectSession = {
  /** The X authorization URL to open in a system browser. */
  authorizationUrl: string;
  /** The OAuth state parameter to compare against the X redirect callback. */
  state: string;
};

/** Result of completing the X connect flow. */
export type XConnectResult = {
  /** The MetaMask profile, refreshed from the backend after the connect. */
  profile: Profile;
  /** The linked X profile. */
  xProfile: XProfile;
  /** Whether the backend created the MetaMask profile during the connect. */
  profileCreated: boolean;
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
  | ProfileServiceGetProfileAction
  | ProfileServiceGetXAccountAction
  | ProfileServiceGetXAuthUrlAction
  | ProfileServiceDisconnectXAction;

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
  'startXConnect',
  'disconnectX',
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
      avatarUrl: response.avatar_url ?? '',
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
  #mapXResponseToXProfile(response: XConnectResponse): XProfile {
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
   * If the user had previously connected X, also updates xProfile in state.
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
      if (response.x_profile) {
        state.xProfile = this.#mapXResponseToXProfile(response.x_profile);
      }
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
   * Completes the X OAuth flow, updates xProfile and profile in state, and
   * returns the connect result. The backend creates the profile if it does
   * not exist yet (username derived from the X handle), so the profile is
   * always fetched from the backend after a successful connect.
   *
   * The linked X profile is persisted in state immediately after the connect
   * succeeds. If the follow-up profile fetch fails, the X link remains
   * persisted, the profile in state is left unchanged, and a clear error is
   * thrown. `connectX` must not be retried because the OAuth code is
   * single-use.
   *
   * @param params - The parameters for the X OAuth flow.
   * @param params.code - The OAuth authorization code from the X redirect.
   * @param params.state - The state parameter returned by the X redirect.
   * @param params.profileId - The canonical profile ID the X account is
   * linked to (sourced from the auth session).
   * @returns The refreshed profile, the linked X profile, and whether the
   * backend created the profile during the connect.
   */
  async connectX(params: {
    code: string;
    state: string;
    profileId: string;
  }): Promise<XConnectResult> {
    const response = await this.messenger.call('ProfileService:connectX', {
      code: params.code,
      state: params.state,
    });
    const profileCreated = response.profile_created ?? false;
    const xProfile = this.#mapXResponseToXProfile(response);
    this.update((state) => {
      state.xProfile = xProfile;
    });

    let profile: Profile;
    try {
      const profileResponse = await this.messenger.call(
        'ProfileService:getProfile',
        params.profileId,
      );
      profile = this.#mapApiResponseToProfile(profileResponse);
    } catch (error) {
      throw new Error(
        'ProfileController: connected the X account, but failed to fetch the profile afterwards; the X link is persisted and the profile in state was not updated, so do not retry connectX (the OAuth code is single-use)',
        { cause: error },
      );
    }
    this.update((state) => {
      state.profile = profile;
    });

    return { profile, xProfile, profileCreated };
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
   * Initiates the X OAuth flow by fetching the authorization URL from the backend.
   * The profile is resolved server-side from the verified bearer token.
   * Returns session data for the caller to use; nothing is stored in controller state.
   *
   * @param params - Optional parameters for initiating the X OAuth flow.
   * @param params.linkedAddress - Optional CAIP-10 account ID to link to the
   * profile when it does not exist yet.
   * @returns The X authorization URL and state parameter.
   */
  async startXConnect(params?: {
    linkedAddress?: CaipAccountId;
  }): Promise<XConnectSession> {
    const { linkedAddress } = params ?? {};
    const response =
      linkedAddress === undefined
        ? await this.messenger.call('ProfileService:getXAuthUrl')
        : await this.messenger.call(
            'ProfileService:getXAuthUrl',
            linkedAddress,
          );
    return { authorizationUrl: response.url, state: response.state };
  }

  /**
   * Disconnects the X account linked to the given profile, clears xProfile from
   * state, and marks the profile in state as no longer connected to X.
   *
   * @param profileId - The ID of the profile to disconnect the linked X account
   * from (sourced from {@link getProfile}).
   */
  async disconnectX(profileId: string): Promise<void> {
    await this.messenger.call('ProfileService:disconnectX', profileId);
    this.update((state) => {
      state.xProfile = undefined;
      if (state.profile.profileId === profileId) {
        state.profile.connectedToX = false;
      }
    });
  }
}
