import type { Messenger } from '@metamask/messenger';

import { ApiPlatformClient } from './api';
import type { ApiPlatformClientOptions } from './api';
import type { ApiPlatformClientServiceMethodActions } from './ApiPlatformClientService-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link ApiPlatformClientService}, used to namespace the
 * service's actions and events.
 */
export const apiPlatformClientServiceName = 'ApiPlatformClientService';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['getApiPlatformClient'] as const;

/**
 * Actions that {@link ApiPlatformClientService} exposes to other consumers.
 */
export type ApiPlatformClientServiceActions =
  ApiPlatformClientServiceMethodActions;

/**
 * Actions from other messengers that {@link ApiPlatformClientServiceMessenger} calls.
 */
type AllowedActions = never;

/**
 * Events that {@link ApiPlatformClientService} exposes to other consumers.
 */
export type ApiPlatformClientServiceEvents = never;

/**
 * Events from other messengers that {@link ApiPlatformClientService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link ApiPlatformClientService}.
 */
export type ApiPlatformClientServiceMessenger = Messenger<
  typeof apiPlatformClientServiceName,
  ApiPlatformClientServiceActions | AllowedActions,
  ApiPlatformClientServiceEvents | AllowedEvents
>;

// === SERVICE OPTIONS ===

/**
 * Options for constructing {@link ApiPlatformClientService}.
 */
export type ApiPlatformClientServiceOptions = {
  /** The messenger suited for this service. */
  messenger: ApiPlatformClientServiceMessenger;
} & ApiPlatformClientOptions;

// === SERVICE DEFINITION ===

/**
 * Service that provides access to {@link ApiPlatformClient} via the messenger.
 *
 * Consumers obtain the client by calling the `ApiPlatformClientService:getApiPlatformClient`
 * action, then use it for accounts, prices, token, and tokens API calls.
 *
 * @example
 *
 * ```ts
 * import { Messenger } from '@metamask/messenger';
 * import {
 *   ApiPlatformClientService,
 *   type ApiPlatformClientServiceActions,
 *   type ApiPlatformClientServiceEvents,
 * } from '@metamask/core-backend';
 *
 * const rootMessenger = new Messenger<'Root', ApiPlatformClientServiceActions, ApiPlatformClientServiceEvents>({ namespace: 'Root' });
 * const serviceMessenger = new Messenger<
 *   'ApiPlatformClientService',
 *   ApiPlatformClientServiceActions,
 *   ApiPlatformClientServiceEvents,
 *   typeof rootMessenger
 * >({ namespace: 'ApiPlatformClientService', parent: rootMessenger });
 *
 * new ApiPlatformClientService({
 *   messenger: serviceMessenger,
 *   clientProduct: 'metamask-extension',
 *   getBearerToken: async () => token,
 * });
 *
 * const client = rootMessenger.call('ApiPlatformClientService:getApiPlatformClient');
 * const balances = await client.accounts.fetchV5MultiAccountBalances(accountIds);
 * ```
 */
export class ApiPlatformClientService {
  readonly name: typeof apiPlatformClientServiceName;

  readonly #messenger: ApiPlatformClientServiceMessenger;

  readonly #client: ApiPlatformClient;

  constructor({
    messenger,
    ...clientOptions
  }: ApiPlatformClientServiceOptions) {
    this.name = apiPlatformClientServiceName;
    this.#messenger = messenger;
    this.#client = new ApiPlatformClient(clientOptions);

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Returns the shared ApiPlatformClient instance.
   *
   * Use this via the messenger: `messenger.call('ApiPlatformClientService:getApiPlatformClient')`.
   *
   * @returns The ApiPlatformClient instance (accounts, prices, token, tokens).
   */
  getApiPlatformClient(): ApiPlatformClient {
    return this.#client;
  }
}
