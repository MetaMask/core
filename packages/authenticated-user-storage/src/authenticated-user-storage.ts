import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { BaseDataService } from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import type { AuthenticatedUserStorageServiceMethodActions } from './authenticated-user-storage-method-action-types.js';
import type { Environment } from './env.js';
import { getUserStorageApiUrl } from './env.js';
import type {
  AssetsWatchlistBlob,
  ClientType,
  DelegationResponse,
  DelegationSubmission,
  NotificationPreferences,
  UserAssetsBlob,
} from './types.js';
import {
  assertAssetsWatchlistBlob,
  assertAssetsWatchlistBlobForWrite,
  assertDelegationResponseArray,
  assertNotificationPreferences,
  assertUserAssetIds,
  assertUserAssetsBlob,
  assertUserAssetsBlobForWrite,
  normalizeUserAssetsBlob,
} from './validators.js';

// === GENERAL ===

/**
 * The name of the {@link AuthenticatedUserStorageService} service, used to
 * namespace the service's actions and events.
 */
export const serviceName = 'AuthenticatedUserStorageService';

/**
 * Builds the versioned API base URL for a given environment.
 *
 * @param environment - The target environment.
 * @returns The base URL including the `/api/v1` path segment.
 */
export function getAuthenticatedStorageUrl(environment: Environment): string {
  return `${getUserStorageApiUrl(environment)}/api/v1`;
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'listDelegations',
  'createDelegation',
  'revokeDelegation',
  'getNotificationPreferences',
  'putNotificationPreferences',
  'getAssetsWatchlist',
  'setAssetsWatchlist',
  'getUserAssets',
  'setUserAssets',
  'importTokens',
  'hideTokens',
] as const;

/**
 * Invalidates cached queries for {@link AuthenticatedUserStorageService}.
 */
export type AuthenticatedUserStorageInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link AuthenticatedUserStorageService} exposes to other
 * consumers.
 */
export type AuthenticatedUserStorageActions =
  | AuthenticatedUserStorageServiceMethodActions
  | AuthenticatedUserStorageInvalidateQueriesAction;

/**
 * Retrieves a bearer token from the `AuthenticationController`, logging in the
 * user if necessary.
 */
type AuthenticationControllerGetBearerTokenAction = {
  type: 'AuthenticationController:getBearerToken';
  handler: (entropySourceId?: string) => Promise<string>;
};

/**
 * Actions from other messengers that {@link AuthenticatedUserStorageService}
 * calls.
 */
type AllowedActions = AuthenticationControllerGetBearerTokenAction;

/**
 * Published when {@link AuthenticatedUserStorageService}'s cache is updated.
 */
export type AuthenticatedUserStorageCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link AuthenticatedUserStorageService}'s cache
 * is updated.
 */
export type AuthenticatedUserStorageGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link AuthenticatedUserStorageService} exposes to other
 * consumers.
 */
export type AuthenticatedUserStorageEvents =
  | AuthenticatedUserStorageCacheUpdatedEvent
  | AuthenticatedUserStorageGranularCacheUpdatedEvent;

/**
 * Events from other messengers that
 * {@link AuthenticatedUserStorageService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link AuthenticatedUserStorageService}.
 */
export type AuthenticatedUserStorageMessenger = Messenger<
  typeof serviceName,
  AuthenticatedUserStorageActions | AllowedActions,
  AuthenticatedUserStorageEvents | AllowedEvents
>;

// === SERVICE ===

/**
 * Data service wrapping authenticated user-storage API endpoints.
 *
 * Provides methods for managing delegations and notification preferences
 * for the authenticated user.
 */
export class AuthenticatedUserStorageService extends BaseDataService<
  typeof serviceName,
  AuthenticatedUserStorageMessenger
> {
  readonly #environment: Environment;

  /**
   * Constructs a new AuthenticatedUserStorageService.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.environment - The target environment (dev, uat, prod).
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    environment,
    policyOptions,
  }: {
    messenger: AuthenticatedUserStorageMessenger;
    environment: Environment;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({ name: serviceName, messenger, policyOptions });
    this.#environment = environment;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Returns all delegation records belonging to the authenticated user.
   *
   * @returns An array of delegation records, or an empty array if none exist.
   */
  async listDelegations(): Promise<DelegationResponse[]> {
    const url = `${getAuthenticatedStorageUrl(this.#environment)}/delegations`;

    const data = await this.fetchQuery({
      queryKey: [`${this.name}:listDelegations`],
      queryFn: async () => {
        const headers = await this.#getHeaders();
        const response = await fetch(url, { headers });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to list delegations: ${response.status}`,
          );
        }

        return response.json();
      },
    });

    assertDelegationResponseArray(data);
    return data;
  }

  /**
   * Stores a signed delegation record for the authenticated user.
   *
   * @param submission - The signed delegation and its metadata.
   * @param clientType - Optional client type header.
   */
  async createDelegation(
    submission: DelegationSubmission,
    clientType?: ClientType,
  ): Promise<void> {
    const url = `${getAuthenticatedStorageUrl(this.#environment)}/delegations`;

    await this.fetchQuery({
      queryKey: [
        `${this.name}:createDelegation`,
        submission.metadata.delegationHash,
      ],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#getHeaders(clientType);
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(submission),
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to create delegation: ${response.status}`,
          );
        }

        return null;
      },
    });

    await this.invalidateQueries({
      queryKey: [`${this.name}:listDelegations`],
    });
  }

  /**
   * Revokes (deletes) a delegation record.
   *
   * @param delegationHash - The unique hash identifying the delegation.
   */
  async revokeDelegation(delegationHash: string): Promise<void> {
    const url = `${getAuthenticatedStorageUrl(this.#environment)}/delegations/${encodeURIComponent(delegationHash)}`;

    await this.fetchQuery({
      queryKey: [`${this.name}:revokeDelegation`, delegationHash],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#getHeaders();
        const response = await fetch(url, {
          method: 'DELETE',
          headers,
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to revoke delegation: ${response.status}`,
          );
        }

        return null;
      },
    });

    await this.invalidateQueries({
      queryKey: [`${this.name}:listDelegations`],
    });
  }

  /**
   * Returns the notification preferences for the authenticated user.
   *
   * @returns The notification preferences object, or `null` if none have been
   * set (404).
   */
  async getNotificationPreferences(): Promise<NotificationPreferences | null> {
    const url = `${getAuthenticatedStorageUrl(this.#environment)}/preferences/notifications`;

    const data = await this.fetchQuery({
      queryKey: [`${this.name}:getNotificationPreferences`],
      queryFn: async () => {
        const headers = await this.#getHeaders();
        const response = await fetch(url, { headers });

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to get notification preferences: ${response.status}`,
          );
        }

        return response.json();
      },
    });

    if (data === null) {
      return null;
    }

    assertNotificationPreferences(data);
    return data;
  }

  /**
   * Creates or updates the notification preferences for the authenticated user.
   *
   * @param prefs - The full notification preferences object.
   * @param clientType - Optional client type header.
   */
  async putNotificationPreferences(
    prefs: NotificationPreferences,
    clientType?: ClientType,
  ): Promise<void> {
    const url = `${getAuthenticatedStorageUrl(this.#environment)}/preferences/notifications`;

    await this.fetchQuery({
      queryKey: [
        `${this.name}:putNotificationPreferences`,
        prefs as unknown as Json,
      ],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#getHeaders(clientType);
        const response = await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify(prefs),
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to put notification preferences: ${response.status}`,
          );
        }

        return null;
      },
    });

    await this.invalidateQueries({
      queryKey: [`${this.name}:getNotificationPreferences`],
    });
  }

  /**
   * Returns the assets-watchlist for the authenticated user.
   *
   * @returns The assets-watchlist blob, or `null` if none has been set (404).
   */
  async getAssetsWatchlist(): Promise<AssetsWatchlistBlob | null> {
    const url = `${getAuthenticatedStorageUrl(this.#environment)}/preferences/assets-watchlist`;

    const data = await this.fetchQuery({
      queryKey: [`${this.name}:getAssetsWatchlist`],
      queryFn: async () => {
        const headers = await this.#getHeaders();
        const response = await fetch(url, { headers });

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to get assets watchlist: ${response.status}`,
          );
        }

        return response.json();
      },
    });

    if (data === null) {
      return null;
    }

    assertAssetsWatchlistBlob(data);
    return data;
  }

  /**
   * Creates or updates the assets-watchlist for the authenticated user.
   *
   * @param blob - The full assets-watchlist blob. The `assets` array may
   * contain at most `ASSETS_WATCHLIST_MAX_ASSETS` CAIP-19 asset identifiers;
   * this is enforced by `assertAssetsWatchlistBlobForWrite` before the
   * request is sent.
   * @param clientType - Optional client type header.
   * @throws A `StructError` from `@metamask/superstruct` if `blob` is
   * structurally invalid or `assets` exceeds the cap; an `HttpError` from
   * `@metamask/controller-utils` if the API responds with a non-2xx status.
   */
  async setAssetsWatchlist(
    blob: AssetsWatchlistBlob,
    clientType?: ClientType,
  ): Promise<void> {
    assertAssetsWatchlistBlobForWrite(blob);

    const url = `${getAuthenticatedStorageUrl(this.#environment)}/preferences/assets-watchlist`;

    await this.fetchQuery({
      queryKey: [`${this.name}:setAssetsWatchlist`, blob as unknown as Json],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#getHeaders(clientType);
        const response = await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify(blob),
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to put assets watchlist: ${response.status}`,
          );
        }

        return null;
      },
    });

    await this.invalidateQueries({
      queryKey: [`${this.name}:getAssetsWatchlist`],
    });
  }

  /**
   * Returns the user-assets (custom tokens) blob for the authenticated user.
   *
   * @returns The user-assets blob, or `null` if none has been set (404).
   */
  async getUserAssets(): Promise<UserAssetsBlob | null> {
    const url = `${getAuthenticatedStorageUrl(this.#environment)}/preferences/user-assets`;

    const data = await this.fetchQuery({
      queryKey: [`${this.name}:getUserAssets`],
      queryFn: async () => {
        const headers = await this.#getHeaders();
        const response = await fetch(url, { headers });

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to get user assets: ${response.status}`,
          );
        }

        return response.json();
      },
    });

    if (data === null) {
      return null;
    }

    assertUserAssetsBlob(data);
    return data;
  }

  /**
   * Creates or updates the user-assets (custom tokens) blob for the
   * authenticated user.
   *
   * The blob is normalized before it is sent: entries are de-duplicated
   * (order-preserving) and conflicts between `importedAssets` and
   * `hiddenAssets` are resolved "fail-open" — an identifier present in both
   * lists stays in `importedAssets` (the user's intent to import wins) and is
   * removed from `hiddenAssets`, so the write is never rejected because of a
   * conflict.
   *
   * @param blob - The full user-assets blob. Every entry of
   * `importedAssets` and `hiddenAssets` must be a CAIP-19 asset identifier
   * (e.g. `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`);
   * this is enforced by `assertUserAssetsBlobForWrite` before the request
   * is sent.
   * @param clientType - Optional client type header.
   * @throws A `StructError` from `@metamask/superstruct` if `blob` is
   * structurally invalid; an `HttpError` from `@metamask/controller-utils`
   * if the API responds with a non-2xx status.
   */
  async setUserAssets(
    blob: UserAssetsBlob,
    clientType?: ClientType,
  ): Promise<void> {
    assertUserAssetsBlobForWrite(blob);
    const normalizedBlob = normalizeUserAssetsBlob(blob);

    const url = `${getAuthenticatedStorageUrl(this.#environment)}/preferences/user-assets`;

    await this.fetchQuery({
      queryKey: [
        `${this.name}:setUserAssets`,
        normalizedBlob as unknown as Json,
      ],
      staleTime: 0,
      queryFn: async () => {
        const headers = await this.#getHeaders(clientType);
        const response = await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify(normalizedBlob),
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Failed to put user assets: ${response.status}`,
          );
        }

        return null;
      },
    });

    await this.invalidateQueries({
      queryKey: [`${this.name}:getUserAssets`],
    });
  }

  /**
   * Imports custom tokens for the authenticated user.
   *
   * Adds the given CAIP-19 asset identifiers to `importedAssets`
   * (de-duplicated, existing order preserved) and removes them from
   * `hiddenAssets`, since the two lists are mutually exclusive and the
   * user's intent to import wins ("fail-open"). If no user-assets blob
   * exists yet (404), a fresh one is created.
   *
   * This is a convenience wrapper around `getUserAssets` and
   * `setUserAssets`; the SDK handles deduplication and mutual exclusivity
   * internally as a safeguard, so callers never need to read-modify-write
   * the blob themselves.
   *
   * @param ids - The CAIP-19 asset identifiers of the tokens to import
   * (e.g. `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`).
   * @param clientType - Optional client type header.
   * @returns The resolved user-assets blob that was persisted.
   * @throws A `StructError` from `@metamask/superstruct` if any entry of
   * `ids` is not a CAIP-19 asset identifier; an `HttpError` from
   * `@metamask/controller-utils` if the API responds with a non-2xx status.
   */
  async importTokens(
    ids: string[],
    clientType?: ClientType,
  ): Promise<UserAssetsBlob> {
    assertUserAssetIds(ids);

    const currentBlob: UserAssetsBlob = (await this.getUserAssets()) ?? {
      version: 1,
      importedAssets: [],
      hiddenAssets: [],
    };

    const importedAssets = new Set(currentBlob.importedAssets);
    const hiddenAssets = new Set(currentBlob.hiddenAssets);
    for (const assetId of ids) {
      importedAssets.add(assetId);
      hiddenAssets.delete(assetId);
    }

    const nextBlob = normalizeUserAssetsBlob({
      version: 1,
      importedAssets: [...importedAssets],
      hiddenAssets: [...hiddenAssets],
    });

    await this.setUserAssets(nextBlob, clientType);
    return nextBlob;
  }

  /**
   * Hides custom tokens for the authenticated user.
   *
   * Adds the given CAIP-19 asset identifiers to `hiddenAssets`
   * (de-duplicated, existing order preserved) and removes them from
   * `importedAssets`, since the two lists are mutually exclusive. If no
   * user-assets blob exists yet (404), a fresh one is created.
   *
   * This is a convenience wrapper around `getUserAssets` and
   * `setUserAssets`; the SDK handles deduplication and mutual exclusivity
   * internally as a safeguard, so callers never need to read-modify-write
   * the blob themselves.
   *
   * @param ids - The CAIP-19 asset identifiers of the tokens to hide
   * (e.g. `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`).
   * @param clientType - Optional client type header.
   * @returns The resolved user-assets blob that was persisted.
   * @throws A `StructError` from `@metamask/superstruct` if any entry of
   * `ids` is not a CAIP-19 asset identifier; an `HttpError` from
   * `@metamask/controller-utils` if the API responds with a non-2xx status.
   */
  async hideTokens(
    ids: string[],
    clientType?: ClientType,
  ): Promise<UserAssetsBlob> {
    assertUserAssetIds(ids);

    const currentBlob: UserAssetsBlob = (await this.getUserAssets()) ?? {
      version: 1,
      importedAssets: [],
      hiddenAssets: [],
    };

    const importedAssets = new Set(currentBlob.importedAssets);
    const hiddenAssets = new Set(currentBlob.hiddenAssets);
    for (const assetId of ids) {
      hiddenAssets.add(assetId);
      importedAssets.delete(assetId);
    }

    const nextBlob = normalizeUserAssetsBlob({
      version: 1,
      importedAssets: [...importedAssets],
      hiddenAssets: [...hiddenAssets],
    });

    await this.setUserAssets(nextBlob, clientType);
    return nextBlob;
  }

  async #getHeaders(clientType?: ClientType): Promise<Record<string, string>> {
    const accessToken = await this.messenger.call(
      'AuthenticationController:getBearerToken',
    );
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };
    if (clientType) {
      headers['X-Client-Type'] = clientType;
    }
    return headers;
  }
}
