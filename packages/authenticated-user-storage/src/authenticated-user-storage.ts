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

import type { AuthenticatedUserStorageServiceMethodActions } from './authenticated-user-storage-method-action-types';
import type { Environment } from './env';
import { getUserStorageApiUrl } from './env';
import type {
  ClientType,
  DelegationResponse,
  DelegationSubmission,
  NotificationPreferences,
} from './types';
import {
  assertDelegationResponseArray,
  assertNotificationPreferences,
} from './validators';

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
