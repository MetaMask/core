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
  intersection,
  nullable,
  optional,
  sensitive,
  string,
  type as structType,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { CaipAccountIdStruct } from '@metamask/utils';

import type { ProfileServiceMethodActions } from './ProfileService-method-action-types.js';

export const serviceName = 'ProfileService';

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

/** Human-readable error messages for each ProfileService operation. */
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

const TradingPrivacyStruct = enums(['public', 'private'] as const);

const ProfileApiResponseStruct = structType({
  profile_id: string(),
  username: string(),
  display_name: string(),
  bio: nullable(string()),
  linked_addresses: array(CaipAccountIdStruct),
  avatar_url: nullable(string()),
  trading_privacy: TradingPrivacyStruct,
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
  url: sensitive(string()),
  state: sensitive(string()),
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

const CreateProfileResponseStruct = intersection([
  ProfileApiResponseStruct,
  structType({ x_profile: optional(XConnectResponseStruct) }),
]);

const ConnectXParamsStruct = structType({
  code: sensitive(string()),
  state: sensitive(string()),
});

const CreateProfileParamsStruct = structType({
  profile_id: string(),
  username: string(),
  display_name: string(),
  bio: optional(nullable(string())),
  linked_addresses: array(CaipAccountIdStruct),
  avatar_url: optional(string()),
  trading_privacy: TradingPrivacyStruct,
});

const ReplaceProfileParamsStruct = structType({
  username: string(),
  display_name: string(),
  bio: optional(nullable(string())),
  linked_addresses: array(CaipAccountIdStruct),
  avatar_url: optional(string()),
  trading_privacy: TradingPrivacyStruct,
});

const UpdateProfileParamsStruct = structType({
  username: optional(string()),
  display_name: optional(string()),
  bio: optional(nullable(string())),
  linked_addresses: optional(array(CaipAccountIdStruct)),
  avatar_url: optional(string()),
  trading_privacy: optional(TradingPrivacyStruct),
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

/** The shape of a profile returned by the MetaMask Profile API. */
export type ProfileApiResponse = Infer<typeof ProfileApiResponseStruct>;

/** The response shape for createProfile — includes an optional linked X profile if the user had already connected X. */
export type CreateProfileResponse = Infer<typeof CreateProfileResponseStruct>;

/** The response shape for a username availability check. */
export type UsernameAvailabilityResponse = Infer<
  typeof UsernameAvailabilityResponseStruct
>;

/** The response shape returned when connecting or fetching an X account. */
export type XConnectResponse = Infer<typeof XConnectResponseStruct>;

/** The response shape returned when requesting the X OAuth authentication URL. */
export type XAuthUrlResponse = Infer<typeof XAuthUrlResponseStruct>;

/** Alias for {@link XConnectResponse} returned when fetching the linked X account. */
export type XAccountResponse = XConnectResponse;

/** Parameters for creating a new MetaMask profile. */
export type CreateProfileParams = Infer<typeof CreateProfileParamsStruct>;

/** Parameters for fully replacing an existing MetaMask profile (PUT). */
export type ReplaceProfileParams = Infer<typeof ReplaceProfileParamsStruct>;

/** Parameters for partially updating an existing MetaMask profile (PATCH). */
export type UpdateProfileParams = Infer<typeof UpdateProfileParamsStruct>;

/** Parameters for completing the X OAuth PKCE flow. */
export type ConnectXParams = Infer<typeof ConnectXParamsStruct>;

// ---------------------------------------------------------------------------
// Messenger types
// ---------------------------------------------------------------------------

/** Union of all actions exposed by ProfileService, including cache invalidation. */
export type ProfileServiceActions =
  | ProfileServiceMethodActions
  | DataServiceInvalidateQueriesAction<typeof serviceName>;

/** Event emitted when the ProfileService query cache is updated. */
export type ProfileServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

/** Event emitted with per-query granularity when the ProfileService cache is updated. */
export type ProfileServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/** Union of all events emitted by ProfileService. */
export type ProfileServiceEvents =
  | ProfileServiceCacheUpdatedEvent
  | ProfileServiceGranularCacheUpdatedEvent;

type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerTokenAction;

type AllowedEvents = never;

/** Messenger type for ProfileService, scoped to its actions and events. */
export type ProfileServiceMessenger = Messenger<
  typeof serviceName,
  ProfileServiceActions | AllowedActions,
  ProfileServiceEvents | AllowedEvents
>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Communicates with the MetaMask Profile API and exposes all operations via the messenger. */
export class ProfileService extends BaseDataService<
  typeof serviceName,
  ProfileServiceMessenger
> {
  readonly #baseUrl: string;

  get #v1Url(): string {
    return `${this.#baseUrl}/v1`;
  }

  /**
   * Creates a new ProfileService instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - The messenger scoped to ProfileService.
   * @param options.baseUrl - Base URL for the MetaMask Profile API.
   * @param options.policyOptions - Optional service policy configuration.
   */
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

  /**
   * Gets the authentication headers for the request.
   *
   * @returns The authentication headers.
   */
  async #getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.messenger.call(
      'AuthenticationController:getBearerToken',
    );
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Executes an authenticated HTTP request and returns the parsed JSON response.
   *
   * @param endpoint - The path relative to the v1 base URL.
   * @param options - Request options.
   * @param options.method - The HTTP method. Defaults to 'GET'.
   * @param options.error - The error message to use if the response is not OK.
   * @param options.json - Optional JSON body. If provided, sets Content-Type and serializes as body.
   * @returns The parsed JSON response.
   * @throws {HttpError} If the response is not a 2xx status code.
   */
  async #fetch(
    endpoint: string,
    options: { method: 'DELETE'; error: string },
  ): Promise<null>;

  async #fetch<ResponseType extends Json>(
    endpoint: string,
    options: { method?: string; error: string; json?: unknown },
  ): Promise<ResponseType>;

  async #fetch<ResponseType extends Json>(
    endpoint: string,
    {
      method = 'GET',
      error,
      json,
    }: {
      method?: string;
      error: string;
      json?: unknown;
    },
  ): Promise<ResponseType | null> {
    const authHeaders = await this.#getAuthHeaders();
    const url = new URL(`${this.#v1Url}/${endpoint}`);
    const response = await fetch(url.toString(), {
      ...(method === 'GET' ? {} : { method }),
      headers: {
        ...authHeaders,
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    if (!response.ok) {
      throw new HttpError(response.status, `${error}: ${response.status}`);
    }
    if (method === 'DELETE') {
      return null;
    }
    return (await response.json()) as ResponseType;
  }

  /**
   * Fetches a profile by its identifier.
   *
   * @param profileId - The profile identifier to fetch.
   * @returns The profile data from the API.
   * @throws {HttpError} If the API returns a non-2xx response.
   * @throws {StructError} If the response does not match the expected shape.
   */
  async getProfile(profileId: string): Promise<ProfileApiResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getProfile`, profileId],
      responseStruct: ProfileApiResponseStruct,
      queryFn: async () =>
        this.#fetch<ProfileApiResponse>(
          `profiles/${encodeURIComponent(profileId)}`,
          {
            error: ProfileServiceErrorMessage.GET_PROFILE_FAILED,
          },
        ),
    });
  }

  /**
   * Creates a new MetaMask profile.
   *
   * @param params - The profile creation parameters.
   * @returns The created profile data.
   * @throws {HttpError} If the API returns a non-2xx response.
   * @throws {StructError} If the response do not match the expected shape.
   */
  async createProfile(
    params: CreateProfileParams,
  ): Promise<CreateProfileResponse> {
    return this.executeMutation({
      mutationKey: [`${this.name}:createProfile`],
      responseStruct: CreateProfileResponseStruct,
      mutationFn: async () =>
        this.#fetch<CreateProfileResponse>('profiles', {
          method: 'POST',
          error: ProfileServiceErrorMessage.CREATE_PROFILE_FAILED,
          json: params,
        }),
    });
  }

  /**
   * Fully replaces an existing profile (PUT).
   *
   * @param profileId - The identifier of the profile to replace.
   * @param params - The replacement profile data.
   * @returns The updated profile data.
   * @throws {HttpError} If the API returns a non-2xx response.
   * @throws {StructError} If the response do not match the expected shape.
   */
  async replaceProfile(
    profileId: string,
    params: ReplaceProfileParams,
  ): Promise<ProfileApiResponse> {
    return this.executeMutation({
      mutationKey: [`${this.name}:replaceProfile`, profileId],
      responseStruct: ProfileApiResponseStruct,
      mutationFn: async () =>
        this.#fetch<ProfileApiResponse>(
          `profiles/${encodeURIComponent(profileId)}`,
          {
            method: 'PUT',
            error: ProfileServiceErrorMessage.REPLACE_PROFILE_FAILED,
            json: params,
          },
        ),
    });
  }

  /**
   * Partially updates an existing profile (PATCH).
   *
   * @param profileId - The identifier of the profile to update.
   * @param params - The fields to update.
   * @returns The updated profile data.
   * @throws {HttpError} If the API returns a non-2xx response.
   * @throws {StructError} If the response do not match the expected shape.
   */
  async updateProfile(
    profileId: string,
    params: UpdateProfileParams,
  ): Promise<ProfileApiResponse> {
    return this.executeMutation({
      mutationKey: [`${this.name}:updateProfile`, profileId],
      responseStruct: ProfileApiResponseStruct,
      mutationFn: async () =>
        this.#fetch<ProfileApiResponse>(
          `profiles/${encodeURIComponent(profileId)}`,
          {
            method: 'PATCH',
            error: ProfileServiceErrorMessage.UPDATE_PROFILE_FAILED,
            json: params,
          },
        ),
    });
  }

  /**
   * Deletes a profile by its identifier.
   *
   * @param profileId - The identifier of the profile to delete.
   * @returns The result of the mutation.
   * @throws {HttpError} If the API returns a non-2xx response.
   */
  async deleteProfile(profileId: string): Promise<void> {
    return this.executeMutation({
      mutationKey: [`${this.name}:deleteProfile`, profileId],
      mutationFn: async () =>
        this.#fetch(`profiles/${encodeURIComponent(profileId)}`, {
          method: 'DELETE',
          error: ProfileServiceErrorMessage.DELETE_PROFILE_FAILED,
        }),
    });
  }

  /**
   * Checks whether a username is available.
   *
   * @param username - The username to check.
   * @returns Availability details including validity and normalized form.
   * @throws {HttpError} If the API returns a non-2xx response.
   * @throws {StructError} If the response does not match the expected shape.
   */
  async checkUsernameAvailability(
    username: string,
  ): Promise<UsernameAvailabilityResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:checkUsernameAvailability`, username],
      staleTime: 0,
      responseStruct: UsernameAvailabilityResponseStruct,
      queryFn: async () =>
        this.#fetch<UsernameAvailabilityResponse>(
          `profiles/username/availability?username=${encodeURIComponent(username)}`,
          {
            error:
              ProfileServiceErrorMessage.CHECK_USERNAME_AVAILABILITY_FAILED,
          },
        ),
    });
  }

  /**
   * Fetches the X OAuth PKCE authorization URL and its associated state parameter.
   *
   * @returns An object containing the authorization URL and the state token.
   * @throws {HttpError} If the API returns a non-2xx response.
   * @throws {StructError} If the response does not match the expected shape.
   */
  async getXAuthUrl(): Promise<XAuthUrlResponse> {
    return this.executeMutation({
      mutationKey: [`${this.name}:getXAuthUrl`],
      responseStruct: XAuthUrlResponseStruct,
      mutationFn: async () =>
        this.#fetch<XAuthUrlResponse>('profiles/x/authentication-url', {
          error: ProfileServiceErrorMessage.GET_X_AUTH_URL_FAILED,
        }),
    });
  }

  /**
   * Completes the X OAuth PKCE flow and links the X account to the profile.
   *
   * @param params - The OAuth callback code and state from the X redirect.
   * @returns The linked X account data.
   * @throws {HttpError} If the API returns a non-2xx response.
   * @throws {StructError} If the response does not match the expected shape.
   */
  async connectX(params: ConnectXParams): Promise<XConnectResponse> {
    return this.executeMutation({
      mutationKey: [`${this.name}:connectX`],
      responseStruct: XConnectResponseStruct,
      mutationFn: async () =>
        this.#fetch<XConnectResponse>('profiles/x/connect', {
          method: 'POST',
          error: ProfileServiceErrorMessage.CONNECT_X_FAILED,
          json: params,
        }),
    });
  }

  /**
   * Fetches the X account currently linked to the authenticated profile.
   *
   * @returns The linked X account data.
   * @throws {HttpError} If the API returns a non-2xx response.
   * @throws {StructError} If the response does not match the expected shape.
   */
  async getXAccount(): Promise<XAccountResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getXAccount`],
      staleTime: 0,
      responseStruct: XConnectResponseStruct,
      queryFn: async () =>
        this.#fetch<XConnectResponse>('profiles/x/account', {
          error: ProfileServiceErrorMessage.GET_X_ACCOUNT_FAILED,
        }),
    });
  }
}
