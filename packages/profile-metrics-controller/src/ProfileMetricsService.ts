import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { SDK } from '@metamask/profile-sync-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { IDisposable } from 'cockatiel';

import type { ProfileMetricsServiceMethodActions } from '.';

// === GENERAL ===

/**
 * The name of the {@link ProfileMetricsService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'ProfileMetricsService';

/**
 * An account address along with its associated scopes.
 */
export type AccountWithScopes = {
  address: string;
  scopes: `${string}:${string}`[];
};

/**
 * The shape of the request object for submitting metrics.
 */
export type ProfileMetricsSubmitMetricsRequest = {
  metametricsId: string;
  entropySourceId?: string | null;
  accounts: AccountWithScopes[];
};

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['submitMetrics'] as const;

/**
 * Actions that {@link ProfileMetricsService} exposes to other consumers.
 */
export type ProfileMetricsServiceActions = ProfileMetricsServiceMethodActions;

/**
 * Actions from other messengers that {@link ProfileMetricsService} calls.
 */
type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerTokenAction;

/**
 * Events that {@link ProfileMetricsService} exposes to other consumers.
 */
export type ProfileMetricsServiceEvents = never;

/**
 * Events from other messengers that {@link ProfileMetricsService} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link ProfileMetricsService}.
 */
export type ProfileMetricsServiceMessenger = Messenger<
  typeof serviceName,
  ProfileMetricsServiceActions | AllowedActions,
  ProfileMetricsServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

export class ProfileMetricsService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: ConstructorParameters<
    typeof ProfileMetricsService
  >[0]['messenger'];

  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: ConstructorParameters<
    typeof ProfileMetricsService
  >[0]['fetch'];

  /**
   * The policy that wraps the request.
   *
   * @see {@link createServicePolicy}
   */
  readonly #policy: ServicePolicy;

  /**
   * The API base URL environment.
   */
  readonly #baseURL: string;

  /**
   * Constructs a new ProfileMetricsService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.fetch - A function that can be used to make an HTTP request. If
   * your JavaScript environment supports `fetch` natively, you'll probably want
   * to pass that; otherwise you can pass an equivalent (such as `fetch` via
   * `node-fetch`).
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   * @param args.env - The environment to determine the correct API endpoints.
   */
  constructor({
    messenger,
    fetch: fetchFunction,
    policyOptions = {},
    env = SDK.Env.DEV,
  }: {
    messenger: ProfileMetricsServiceMessenger;
    fetch: typeof fetch;
    policyOptions?: CreateServicePolicyOptions;
    env?: SDK.Env;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#policy = createServicePolicy(policyOptions);
    this.#baseURL = getAuthUrl(env);

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Registers a handler that will be called after a request returns a non-500
   * response, causing a retry. Primarily useful in tests where timers are being
   * mocked.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   * @see {@link createServicePolicy}
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]): IDisposable {
    return this.#policy.onRetry(listener);
  }

  /**
   * Registers a handler that will be called after a set number of retry rounds
   * prove that requests to the API endpoint consistently return a 5xx response.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   * @see {@link createServicePolicy}
   */
  onBreak(listener: Parameters<ServicePolicy['onBreak']>[0]): IDisposable {
    return this.#policy.onBreak(listener);
  }

  /**
   * Registers a handler that will be called under one of two circumstances:
   *
   * 1. After a set number of retries prove that requests to the API
   * consistently result in one of the following failures:
   *    1. A connection initiation error
   *    2. A connection reset error
   *    3. A timeout error
   *    4. A non-JSON response
   *    5. A 502, 503, or 504 response
   * 2. After a successful request is made to the API, but the response takes
   * longer than a set duration to return.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler. See
   * {@link CockatielEvent}.
   */
  onDegraded(
    listener: Parameters<ServicePolicy['onDegraded']>[0],
  ): IDisposable {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Submit metrics to the API.
   *
   * @param data - The data to send in the metrics update request.
   * @returns The response from the API.
   */
  async submitMetrics(data: ProfileMetricsSubmitMetricsRequest): Promise<void> {
    const authToken = await this.#messenger.call(
      'AuthenticationController:getBearerToken',
      data.entropySourceId ?? undefined,
    );
    await this.#policy.execute(async () => {
      const url = new URL(`${this.#baseURL}/profile/accounts`);
      const localResponse = await this.#fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metametrics_id: data.metametricsId,
          accounts: data.accounts,
        }),
      });
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      return localResponse;
    });
  }
}

/**
 * Returns the base URL for the given environment.
 *
 * @param env - The environment to get the URL for.
 * @returns The base URL for the environment.
 */
export function getAuthUrl(env: SDK.Env): string {
  return `${SDK.getEnvUrls(env).authApiUrl}/api/v2`;
}
