import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import {
  array,
  assert,
  boolean,
  enums,
  nullable,
  optional,
  string,
  type as structType,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import type { ProfileServiceMethodActions } from './ProfileService-method-action-types.js';

export const serviceName = 'ProfileService';

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

export const ProfileServiceErrorMessage = {
  GET_PROFILE_FAILED: 'ProfileService: failed to fetch profile',
  CREATE_PROFILE_FAILED: 'ProfileService: failed to create profile',
  REPLACE_PROFILE_FAILED: 'ProfileService: failed to replace profile',
  UPDATE_PROFILE_FAILED: 'ProfileService: failed to update profile',
  DELETE_PROFILE_FAILED: 'ProfileService: failed to delete profile',
  CHECK_USERNAME_AVAILABILITY_FAILED:
    'ProfileService: failed to check username availability',
  GET_X_AUTH_URL_FAILED: 'ProfileService: failed to get X authentication URL',
  CONNECT_X_FAILED: 'ProfileService: failed to connect X account',
  GET_X_ACCOUNT_FAILED: 'ProfileService: failed to get X account',
} as const;

// ---------------------------------------------------------------------------
// Superstruct schemas
// ---------------------------------------------------------------------------

const ProfileApiResponseStruct = structType({
  profile_id: string(),
  username: string(),
  display_name: string(),
  bio: nullable(string()),
  linked_addresses: array(string()),
  avatar_url: nullable(string()),
  trading_privacy: enums(['public', 'private'] as const),
  connected_to_x: boolean(),
  created_at: string(),
  updated_at: string(),
});

const UsernameAvailabilityErrorStruct = structType({
  code: string(),
  message: string(),
});

const UsernameAvailabilityResponseStruct = structType({
  username: string(),
  available: boolean(),
  valid: boolean(),
  normalized: string(),
  errors: array(UsernameAvailabilityErrorStruct),
});

const XAuthUrlResponseStruct = structType({
  url: string(),
  state: string(),
});

const XConnectResponseStruct = structType({
  x_user_id: string(),
  x_profile_url: string(),
  username: string(),
  display_name: string(),
  avatar_url: string(),
  created_at: string(),
  updated_at: string(),
});

const ConnectXParamsStruct = structType({
  code: string(),
  state: string(),
});

const CreateProfileParamsStruct = structType({
  profile_id: string(),
  username: string(),
  display_name: string(),
  bio: optional(nullable(string())),
  linked_addresses: optional(array(string())),
  avatar_url: optional(string()),
});

const ReplaceProfileParamsStruct = structType({
  username: string(),
  display_name: string(),
  bio: optional(nullable(string())),
  linked_addresses: array(string()),
  avatar_url: optional(string()),
  trading_privacy: optional(enums(['public', 'private'] as const)),
});

const UpdateProfileParamsStruct = structType({
  username: optional(string()),
  display_name: optional(string()),
  bio: optional(string()),
  linked_addresses: optional(array(string())),
  avatar_url: optional(string()),
  trading_privacy: optional(enums(['public', 'private'] as const)),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const MESSENGER_EXPOSED_METHODS = [
  'getProfile',
  'createProfile',
  'replaceProfile',
  'updateProfile',
  'deleteProfile',
  'checkUsernameAvailability',
  'getXAuthUrl',
  'connectX',
  'getXAccount',
] as const;

export type ProfileApiResponse = Infer<typeof ProfileApiResponseStruct>;

export type UsernameAvailabilityResponse = Infer<
  typeof UsernameAvailabilityResponseStruct
>;

export type XConnectResponse = Infer<typeof XConnectResponseStruct>;

export type XAuthUrlResponse = Infer<typeof XAuthUrlResponseStruct>;

export type XAccountResponse = XConnectResponse;

export type CreateProfileParams = Infer<typeof CreateProfileParamsStruct>;

export type ReplaceProfileParams = Infer<typeof ReplaceProfileParamsStruct>;

export type UpdateProfileParams = Infer<typeof UpdateProfileParamsStruct>;

export type ConnectXParams = Infer<typeof ConnectXParamsStruct>;

// ---------------------------------------------------------------------------
// Messenger types
// ---------------------------------------------------------------------------

export type ProfileServiceActions =
  | ProfileServiceMethodActions
  | DataServiceInvalidateQueriesAction<typeof serviceName>;

export type ProfileServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

export type ProfileServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

export type ProfileServiceEvents =
  | ProfileServiceCacheUpdatedEvent
  | ProfileServiceGranularCacheUpdatedEvent;

type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerTokenAction;

type AllowedEvents = never;

export type ProfileServiceMessenger = Messenger<
  typeof serviceName,
  ProfileServiceActions | AllowedActions,
  ProfileServiceEvents | AllowedEvents
>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProfileService extends BaseDataService<
  typeof serviceName,
  ProfileServiceMessenger
> {
  readonly #baseUrl: string;

  get #v1Url(): string {
    return `${this.#baseUrl}/v1`;
  }

  constructor({
    messenger,
    baseUrl,
    policyOptions,
  }: {
    messenger: ProfileServiceMessenger;
    baseUrl: string;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({ name: serviceName, messenger, policyOptions });
    this.#baseUrl = baseUrl;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  #throwIfNotOk(response: Response, message: string): void {
    if (!response.ok) {
      throw new HttpError(response.status, `${message}: ${response.status}`);
    }
  }

  async #getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.messenger.call(
      'AuthenticationController:getBearerToken',
    );
    return { Authorization: `Bearer ${token}` };
  }

  async getProfile(profileId: string): Promise<ProfileApiResponse> {
    assert(profileId, string());
    const authHeaders = await this.#getAuthHeaders();
    return this.fetchQuery({
      queryKey: [`${this.name}:getProfile`, profileId],
      responseStruct: ProfileApiResponseStruct,
      queryFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/${encodeURIComponent(profileId)}`,
        );
        const response = await fetch(url.toString(), { headers: authHeaders });
        this.#throwIfNotOk(
          response,
          ProfileServiceErrorMessage.GET_PROFILE_FAILED,
        );
        return response.json();
      },
    });
  }

  async createProfile(
    params: CreateProfileParams,
  ): Promise<ProfileApiResponse> {
    assert(params, CreateProfileParamsStruct);
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:createProfile`],
      responseStruct: ProfileApiResponseStruct,
      mutationFn: async () => {
        const url = new URL(`${this.#v1Url}/profiles`);
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        this.#throwIfNotOk(
          response,
          ProfileServiceErrorMessage.CREATE_PROFILE_FAILED,
        );
        return response.json();
      },
    });
  }

  async replaceProfile(
    profileId: string,
    params: ReplaceProfileParams,
  ): Promise<ProfileApiResponse> {
    assert(profileId, string());
    assert(params, ReplaceProfileParamsStruct);
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:replaceProfile`, profileId],
      responseStruct: ProfileApiResponseStruct,
      mutationFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/${encodeURIComponent(profileId)}`,
        );
        const response = await fetch(url.toString(), {
          method: 'PUT',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        this.#throwIfNotOk(
          response,
          ProfileServiceErrorMessage.REPLACE_PROFILE_FAILED,
        );
        return response.json();
      },
    });
  }

  async updateProfile(
    profileId: string,
    params: UpdateProfileParams,
  ): Promise<ProfileApiResponse> {
    assert(profileId, string());
    assert(params, UpdateProfileParamsStruct);
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:updateProfile`, profileId],
      responseStruct: ProfileApiResponseStruct,
      mutationFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/${encodeURIComponent(profileId)}`,
        );
        const response = await fetch(url.toString(), {
          method: 'PATCH',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        this.#throwIfNotOk(
          response,
          ProfileServiceErrorMessage.UPDATE_PROFILE_FAILED,
        );
        return response.json();
      },
    });
  }

  async deleteProfile(profileId: string): Promise<void> {
    assert(profileId, string());
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:deleteProfile`, profileId],
      mutationFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/${encodeURIComponent(profileId)}`,
        );
        const response = await fetch(url.toString(), {
          method: 'DELETE',
          headers: authHeaders,
        });
        this.#throwIfNotOk(
          response,
          ProfileServiceErrorMessage.DELETE_PROFILE_FAILED,
        );
        return null;
      },
    });
  }

  async checkUsernameAvailability(
    username: string,
  ): Promise<UsernameAvailabilityResponse> {
    assert(username, string());
    const authHeaders = await this.#getAuthHeaders();
    return this.fetchQuery({
      queryKey: [`${this.name}:checkUsernameAvailability`, username],
      staleTime: 0,
      responseStruct: UsernameAvailabilityResponseStruct,
      queryFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/username/${encodeURIComponent(username)}/availability`,
        );
        const response = await fetch(url.toString(), { headers: authHeaders });
        this.#throwIfNotOk(
          response,
          ProfileServiceErrorMessage.CHECK_USERNAME_AVAILABILITY_FAILED,
        );
        return response.json();
      },
    });
  }

  async getXAuthUrl(): Promise<{ url: string; state: string }> {
    const authHeaders = await this.#getAuthHeaders();
    return this.fetchQuery({
      queryKey: [`${this.name}:getXAuthUrl`],
      staleTime: 0,
      responseStruct: XAuthUrlResponseStruct,
      queryFn: async () => {
        const url = new URL(`${this.#v1Url}/profiles/x/authentication-url`);
        const response = await fetch(url.toString(), { headers: authHeaders });
        this.#throwIfNotOk(
          response,
          ProfileServiceErrorMessage.GET_X_AUTH_URL_FAILED,
        );
        return response.json();
      },
    });
  }

  async connectX(params: ConnectXParams): Promise<XConnectResponse> {
    assert(params, ConnectXParamsStruct);
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:connectX`],
      responseStruct: XConnectResponseStruct,
      mutationFn: async () => {
        const url = new URL(`${this.#v1Url}/profiles/x/connect`);
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        this.#throwIfNotOk(
          response,
          ProfileServiceErrorMessage.CONNECT_X_FAILED,
        );
        return response.json();
      },
    });
  }

  async getXAccount(): Promise<XAccountResponse> {
    const authHeaders = await this.#getAuthHeaders();
    return this.fetchQuery({
      queryKey: [`${this.name}:getXAccount`],
      staleTime: 0,
      responseStruct: XConnectResponseStruct,
      queryFn: async () => {
        const url = new URL(`${this.#v1Url}/profiles/x/account`);
        const response = await fetch(url.toString(), { headers: authHeaders });
        this.#throwIfNotOk(
          response,
          ProfileServiceErrorMessage.GET_X_ACCOUNT_FAILED,
        );
        return response.json();
      },
    });
  }
}
