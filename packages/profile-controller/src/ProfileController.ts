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
  ProfileApiResponse,
  ReplaceProfileParams,
  UpdateProfileParams,
  UsernameAvailabilityResponse,
  XAuthUrlResponse,
  XConnectResponse,
} from './ProfileService.js';

const controllerName = 'ProfileController';

// === TYPES ===

export type MetaMaskProfile = {
  profileId: string;
  username: string;
  displayName: string;
  bio: string;
  linkedAddresses: CaipAccountId[];
  avatarUrl: string;
  tradingPrivacy: 'public' | 'private';
  connectedToX: boolean;
  createdAt: string;
  updatedAt: string;
};

export type XProfile = {
  xUserId: string;
  xProfileUrl: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type ProfileControllerState = {
  metamaskProfile: MetaMaskProfile;
  xProfile?: XProfile;
};

// === MESSENGER ===

export type ProfileControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ProfileControllerState
>;

export type ProfileControllerActions =
  | ProfileControllerGetStateAction
  | ProfileControllerMethodActions;

export type ProfileControllerChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  ProfileControllerState
>;

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
  'getXAccount',
] as const;

// === CONTROLLER ===

export class ProfileController extends BaseController<
  typeof controllerName,
  ProfileControllerState,
  ProfileControllerMessenger
> {
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

  #hasProfile(): boolean {
    return this.state.metamaskProfile.profileId !== '';
  }

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

  getMetaMaskProfile(): MetaMaskProfile | undefined {
    if (!this.#hasProfile()) {
      return undefined;
    }
    return this.state.metamaskProfile;
  }

  getXprofile(): XProfile | undefined {
    return this.state.xProfile;
  }

  async createProfile(input: CreateProfileParams): Promise<void> {
    const response = await this.messenger.call(
      'ProfileService:createProfile',
      input,
    );
    this.update((state) => {
      state.metamaskProfile = this.#mapApiResponseToProfile(response);
    });
  }

  async replaceProfile(
    identifier: string,
    input: ReplaceProfileParams,
  ): Promise<void> {
    const response = await this.messenger.call(
      'ProfileService:replaceProfile',
      identifier,
      input,
    );
    this.update((state) => {
      state.metamaskProfile = this.#mapApiResponseToProfile(response);
    });
  }

  async updateProfile(
    identifier: string,
    input: UpdateProfileParams,
  ): Promise<void> {
    const response = await this.messenger.call(
      'ProfileService:updateProfile',
      identifier,
      input,
    );
    this.update((state) => {
      state.metamaskProfile = this.#mapApiResponseToProfile(response);
    });
  }

  async deleteProfile(identifier: string): Promise<void> {
    await this.messenger.call('ProfileService:deleteProfile', identifier);
    this.update((state) => {
      state.metamaskProfile =
        getDefaultProfileControllerState().metamaskProfile;
      state.xProfile = undefined;
    });
  }

  async checkUsernameAvailability(
    username: string,
  ): Promise<UsernameAvailabilityResponse> {
    return this.messenger.call(
      'ProfileService:checkUsernameAvailability',
      username,
    );
  }

  async getXAuthUrl(): Promise<XAuthUrlResponse> {
    return this.messenger.call('ProfileService:getXAuthUrl');
  }

  async connectX(code: string, xState: string): Promise<void> {
    const response = await this.messenger.call('ProfileService:connectX', {
      code,
      state: xState,
    });
    this.update((state) => {
      state.xProfile = this.#mapXResponseToXProfile(response);
    });
  }

  async getXAccount(): Promise<void> {
    const response = await this.messenger.call('ProfileService:getXAccount');
    this.update((state) => {
      state.xProfile = this.#mapXResponseToXProfile(response);
    });
  }
}
