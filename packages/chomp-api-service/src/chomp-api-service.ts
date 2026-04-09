import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Infer } from '@metamask/superstruct';
import { is, object, string } from '@metamask/superstruct';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { ChompApiServiceMethodActions } from './chomp-api-service-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link ChompApiService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'ChompApiService';

// === MESSENGER ===

/**
 * All of the methods within {@link ChompApiService} that are exposed via the
 * messenger.
 */
const MESSENGER_EXPOSED_METHODS = ['fetch'] as const;

/**
 * Invalidates cached queries for {@link ChompApiService}.
 */
export type ChompApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link ChompApiService} exposes to other consumers.
 */
export type ChompApiServiceActions =
  | ChompApiServiceMethodActions
  | ChompApiServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link ChompApiService} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link ChompApiService}'s cache is updated.
 */
export type ChompApiServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link ChompApiService}'s cache is updated.
 */
export type ChompApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link ChompApiService} exposes to other consumers.
 */
export type ChompApiServiceEvents =
  | ChompApiServiceCacheUpdatedEvent
  | ChompApiServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link ChompApiService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link ChompApiService}.
 */
export type ChompApiServiceMessenger = Messenger<
  typeof serviceName,
  ChompApiServiceActions | AllowedActions,
  ChompApiServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

// TODO: Define the response struct to match the actual Chomp API response shape.
const ChompResponseStruct = object({
  // TODO: Replace with real fields.
  id: string(),
});

/**
 * What the API endpoint returns.
 */
type ChompResponse = Infer<typeof ChompResponseStruct>;

/**
 * The base URL of the Chomp API.
 */
// TODO: Replace with the real Chomp API base URL.
const BASE_URL = 'https://api.chomp.example.com';

/**
 * This service object is responsible for fetching data from the Chomp API.
 */
export class ChompApiService extends BaseDataService<
  typeof serviceName,
  ChompApiServiceMessenger
> {
  /**
   * Constructs a new ChompApiService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: ChompApiServiceMessenger;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions,
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * TODO: Replace with a real description of the endpoint this method calls.
   *
   * @param id - TODO: Describe the parameter.
   * @returns TODO: Describe the return value.
   */
  async fetch(id: string): Promise<ChompResponse> {
    // TODO: Build the real URL for the Chomp API endpoint.
    const url = new URL(`/items/${id}`, BASE_URL);

    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:fetch`, id],
      queryFn: async () => {
        const response = await fetch(url);

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Chomp API failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
    });

    if (!is(jsonResponse, ChompResponseStruct)) {
      throw new Error('Malformed response received from Chomp API');
    }

    return jsonResponse;
  }
}
