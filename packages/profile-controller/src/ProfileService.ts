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
  boolean,
  enums,
  is,
  nullable,
  string,
  type as structType,
} from '@metamask/superstruct';

import type { ProfileServiceMethodActions } from './ProfileService-method-action-types.js';

export const serviceName = 'ProfileService';

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

export const ProfileServiceErrorMessage = {
  GET_PROFILE_FAILED: 'ProfileService: failed to fetch profile',
  GET_PROFILE_INVALID_RESPONSE: 'ProfileService: invalid response for getProfile',
  CREATE_PROFILE_FAILED: 'ProfileService: failed to create profile',
  CREATE_PROFILE_INVALID_RESPONSE: 'ProfileService: invalid response for createProfile',
  REPLACE_PROFILE_FAILED: 'ProfileService: failed to replace profile',
  REPLACE_PROFILE_INVALID_RESPONSE: 'ProfileService: invalid response for replaceProfile',
  UPDATE_PROFILE_FAILED: 'ProfileService: failed to update profile',
  UPDATE_PROFILE_INVALID_RESPONSE: 'ProfileService: invalid response for updateProfile',
  DELETE_PROFILE_FAILED: 'ProfileService: failed to delete profile',
  CHECK_USERNAME_AVAILABILITY_FAILED: 'ProfileService: failed to check username availability',
  CHECK_USERNAME_AVAILABILITY_INVALID_RESPONSE: 'ProfileService: invalid response for checkUsernameAvailability',
  GET_X_AUTH_URL_FAILED: 'ProfileService: failed to get X authentication URL',
  GET_X_AUTH_URL_INVALID_RESPONSE: 'ProfileService: invalid response for getXAuthUrl',
  CONNECT_X_FAILED: 'ProfileService: failed to connect X account',
  CONNECT_X_INVALID_RESPONSE: 'ProfileService: invalid response for connectX',
  GET_X_ACCOUNT_FAILED: 'ProfileService: failed to get X account',
  GET_X_ACCOUNT_INVALID_RESPONSE: 'ProfileService: invalid response for getXAccount',
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

export type ProfileApiResponse = {
  profile_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  linked_addresses: string[];
  avatar_url: string | null;
  trading_privacy: 'public' | 'private';
  connected_to_x: boolean;
  created_at: string;
  updated_at: string;
};

export type UsernameAvailabilityResponse = {
  username: string;
  available: boolean;
  valid: boolean;
  normalized: string;
  errors: { code: string; message: string }[];
};

export type CreateProfileInput = {
  profile_id: string;
  username: string;
  display_name: string;
  bio?: string | null;
  linked_addresses?: string[];
  avatar_url?: string;
};

export type ReplaceProfileInput = {
  username: string;
  display_name: string;
  linked_addresses: string[];
};

export type UpdateProfileInput = {
  username?: string;
  display_name?: string;
  bio?: string;
  linked_addresses?: string[];
  avatar_url?: string;
  trading_privacy?: 'public' | 'private';
};

export type XConnectResponse = {
  x_user_id: string;
  x_profile_url: string;
  username: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
};

export type XAccountResponse = XConnectResponse;

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

  async #getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.messenger.call(
      'AuthenticationController:getBearerToken',
    );
    return { Authorization: `Bearer ${token}` };
  }

  async getProfile(identifier: string): Promise<ProfileApiResponse> {
    const authHeaders = await this.#getAuthHeaders();
    return this.fetchQuery({
      queryKey: [`${this.name}:getProfile`, identifier],
      queryFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/${encodeURIComponent(identifier)}`,
        );
        const response = await fetch(url.toString(), { headers: authHeaders });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${ProfileServiceErrorMessage.GET_PROFILE_FAILED}: ${response.status}`,
          );
        }
        const data = await response.json();
        if (!is(data, ProfileApiResponseStruct)) {
          throw new Error(ProfileServiceErrorMessage.GET_PROFILE_INVALID_RESPONSE);
        }
        return data as ProfileApiResponse;
      },
    });
  }

  async createProfile(input: CreateProfileInput): Promise<ProfileApiResponse> {
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:createProfile`],
      mutationFn: async () => {
        const url = new URL(`${this.#v1Url}/profiles`);
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${ProfileServiceErrorMessage.CREATE_PROFILE_FAILED}: ${response.status}`,
          );
        }
        const data = await response.json();
        if (!is(data, ProfileApiResponseStruct)) {
          throw new Error(ProfileServiceErrorMessage.CREATE_PROFILE_INVALID_RESPONSE);
        }
        return data as ProfileApiResponse;
      },
    });
  }

  async replaceProfile(
    identifier: string,
    input: ReplaceProfileInput,
  ): Promise<ProfileApiResponse> {
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:replaceProfile`, identifier],
      mutationFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/${encodeURIComponent(identifier)}`,
        );
        const response = await fetch(url.toString(), {
          method: 'PUT',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${ProfileServiceErrorMessage.REPLACE_PROFILE_FAILED}: ${response.status}`,
          );
        }
        const data = await response.json();
        if (!is(data, ProfileApiResponseStruct)) {
          throw new Error(ProfileServiceErrorMessage.REPLACE_PROFILE_INVALID_RESPONSE);
        }
        return data as ProfileApiResponse;
      },
    });
  }

  async updateProfile(
    identifier: string,
    input: UpdateProfileInput,
  ): Promise<ProfileApiResponse> {
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:updateProfile`, identifier],
      mutationFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/${encodeURIComponent(identifier)}`,
        );
        const response = await fetch(url.toString(), {
          method: 'PATCH',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${ProfileServiceErrorMessage.UPDATE_PROFILE_FAILED}: ${response.status}`,
          );
        }
        const data = await response.json();
        if (!is(data, ProfileApiResponseStruct)) {
          throw new Error(ProfileServiceErrorMessage.UPDATE_PROFILE_INVALID_RESPONSE);
        }
        return data as ProfileApiResponse;
      },
    });
  }

  async deleteProfile(identifier: string): Promise<void> {
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:deleteProfile`, identifier],
      mutationFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/${encodeURIComponent(identifier)}`,
        );
        const response = await fetch(url.toString(), {
          method: 'DELETE',
          headers: authHeaders,
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${ProfileServiceErrorMessage.DELETE_PROFILE_FAILED}: ${response.status}`,
          );
        }
        return null;
      },
    });
  }

  async checkUsernameAvailability(
    username: string,
  ): Promise<UsernameAvailabilityResponse> {
    const authHeaders = await this.#getAuthHeaders();
    return this.fetchQuery({
      queryKey: [`${this.name}:checkUsernameAvailability`, username],
      staleTime: 0,
      queryFn: async () => {
        const url = new URL(
          `${this.#v1Url}/profiles/username/${encodeURIComponent(username)}/availability`,
        );
        const response = await fetch(url.toString(), { headers: authHeaders });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${ProfileServiceErrorMessage.CHECK_USERNAME_AVAILABILITY_FAILED}: ${response.status}`,
          );
        }
        const data = await response.json();
        if (!is(data, UsernameAvailabilityResponseStruct)) {
          throw new Error(
            ProfileServiceErrorMessage.CHECK_USERNAME_AVAILABILITY_INVALID_RESPONSE,
          );
        }
        return data as UsernameAvailabilityResponse;
      },
    });
  }

  async getXAuthUrl(): Promise<{ url: string; state: string }> {
    const authHeaders = await this.#getAuthHeaders();
    return this.fetchQuery({
      queryKey: [`${this.name}:getXAuthUrl`],
      staleTime: 0,
      queryFn: async () => {
        const url = new URL(`${this.#v1Url}/profiles/x/authentication-url`);
        const response = await fetch(url.toString(), { headers: authHeaders });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${ProfileServiceErrorMessage.GET_X_AUTH_URL_FAILED}: ${response.status}`,
          );
        }
        const data = await response.json();
        if (!is(data, XAuthUrlResponseStruct)) {
          throw new Error(ProfileServiceErrorMessage.GET_X_AUTH_URL_INVALID_RESPONSE);
        }
        return data as { url: string; state: string };
      },
    });
  }

  async connectX(code: string, xState: string): Promise<XConnectResponse> {
    const authHeaders = await this.#getAuthHeaders();
    return this.executeMutation({
      mutationKey: [`${this.name}:connectX`],
      mutationFn: async () => {
        const url = new URL(`${this.#v1Url}/profiles/x/connect`);
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state: xState }),
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${ProfileServiceErrorMessage.CONNECT_X_FAILED}: ${response.status}`,
          );
        }
        const data = await response.json();
        if (!is(data, XConnectResponseStruct)) {
          throw new Error(ProfileServiceErrorMessage.CONNECT_X_INVALID_RESPONSE);
        }
        return data as XConnectResponse;
      },
    });
  }

  async getXAccount(): Promise<XAccountResponse> {
    const authHeaders = await this.#getAuthHeaders();
    return this.fetchQuery({
      queryKey: [`${this.name}:getXAccount`],
      staleTime: 0,
      queryFn: async () => {
        const url = new URL(`${this.#v1Url}/profiles/x/account`);
        const response = await fetch(url.toString(), { headers: authHeaders });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `${ProfileServiceErrorMessage.GET_X_ACCOUNT_FAILED}: ${response.status}`,
          );
        }
        const data = await response.json();
        if (!is(data, XConnectResponseStruct)) {
          throw new Error(ProfileServiceErrorMessage.GET_X_ACCOUNT_INVALID_RESPONSE);
        }
        return data as XAccountResponse;
      },
    });
  }
}
