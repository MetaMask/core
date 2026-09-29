import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
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
  XAuthUrlResponse,
  XConnectResponse,
} from './ProfileService.js';

const controllerName = 'ProfileController';

// === TYPES ===

/** Representation of a MetaMask profile stored in controller state. */
export type MetaMaskProfile = {
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

/** State managed by ProfileController. */
export type ProfileControllerState = {
  metamaskProfile: MetaMaskProfile;
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
export type ProfileControllerChangeEvent = ControllerStateChangeEvent<
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
  | ProfileServiceGetXAuthUrlAction
  | ProfileServiceConnectXAction
  | ProfileServiceGetXAccountAction;

export type AllowedEvents = never;

/** Messenger type for ProfileController, scoped to its actions, events, and allowed service calls. */
export type ProfileControllerMessenger = Messenger<
  typeof controllerName,
  ProfileControllerActions | AllowedActions,
  ProfileControllerEvents | AllowedEvents
>;

// === STATE ===

const profileControllerMetadata = {
  metamaskProfile: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  xProfile: {
    includeInStateLogs: true,
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
    metamaskProfile: {
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
  'getMetaMaskProfile',
  'getXprofile',
  'createProfile',
  'replaceProfile',
  'updateProfile',
  'deleteProfile',
  'checkUsernameAvailability',
  'getXAuthUrl',
  'connectX',
  'fetchAndUpdateXAccount',
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
    return this.state.metamaskProfile.profileId !== '';
  }

  /**
   * Returns the profile ID from state, throwing if no profile exists yet.
   *
   * @returns The current profile ID.
   * @throws If no profile has been created.
   */
  #getProfileIdOrThrow(): string {
    const { profileId } = this.state.metamaskProfile;
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
  #mapApiResponseToProfile(response: ProfileApiResponse): MetaMaskProfile {
    return {
      profileId: response.profile_id,
      username: response.username,
      displayName: response.display_name,
      bio: response.bio ?? '',
      linkedAddresses: response.linked_addresses as CaipAccountId[],
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
  getMetaMaskProfile(): MetaMaskProfile | undefined {
    if (!this.#hasProfile()) {
      return undefined;
    }
    return this.state.metamaskProfile;
  }

  /**
   * Returns the currently linked X profile from state, or undefined if none has been connected.
   *
   * @returns The X profile, or undefined.
   */
  getXprofile(): XProfile | undefined {
    return this.state.xProfile;
  }

  /**
   * Creates a new MetaMask profile, updates state, and returns the created profile.
   * If the user had previously connected X, also updates xProfile in state.
   *
   * @param params - The profile creation parameters.
   * @returns The created MetaMask profile.
   */
  async createProfile(params: CreateProfileParams): Promise<MetaMaskProfile> {
    const response = (await this.messenger.call(
      'ProfileService:createProfile',
      params,
    )) as CreateProfileResponse;
    const mapped = this.#mapApiResponseToProfile(response);
    this.update((state) => {
      state.metamaskProfile = mapped;
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
      state.metamaskProfile = this.#mapApiResponseToProfile(response as ProfileApiResponse);
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
      state.metamaskProfile = this.#mapApiResponseToProfile(response as ProfileApiResponse);
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
      state.metamaskProfile =
        getDefaultProfileControllerState().metamaskProfile;
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
    return this.messenger.call(
      'ProfileService:checkUsernameAvailability',
      username,
    ) as UsernameAvailabilityResponse;
  }

  /**
   * Fetches the X OAuth authorization URL to begin the PKCE flow.
   *
   * @returns An object containing the authorization URL and its associated state token.
   */
  async getXAuthUrl(): Promise<XAuthUrlResponse> {
    return this.messenger.call(
      'ProfileService:getXAuthUrl',
    ) as XAuthUrlResponse;
  }

  /**
   * Completes the X OAuth PKCE flow, updates xProfile in state, and returns the X profile.
   *
   * @param params - The parameters for the X OAuth PKCE flow.
   * @param params.code - The OAuth authorization code from the X redirect.
   * @param params.state - The state parameter returned by the X redirect.
   * @returns The linked X profile.
   */
  async connectX(params: { code: string; state: string }): Promise<XProfile> {
    const response = await this.messenger.call(
      'ProfileService:connectX',
      params,
    );
    return this.#mapXResponseToXProfile(response as XConnectResponse);
  }

  /**
   * Fetches the X account linked to the current profile, updates state, and returns the X profile.
   *
   * @returns The linked X profile.
   */
  async fetchAndUpdateXAccount(): Promise<XProfile> {
    const response = (await this.messenger.call(
      'ProfileService:getXAccount',
    )) as XConnectResponse;
    const mapped = this.#mapXResponseToXProfile(response);
    this.update((state) => {
      state.xProfile = mapped;
    });
    return mapped;
  }
}
