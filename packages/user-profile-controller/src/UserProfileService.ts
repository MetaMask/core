import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import { hasProperty, isPlainObject } from '@metamask/utils';

import { type UserProfileServiceMethodActions, Env, getEnvUrl } from '.';

// === GENERAL ===

/**
 * The name of the {@link UserProfileService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'UserProfileService';

/**
 * The shape of the request object for updating the user profile.
 */
export type UserProfileUpdateRequest = {
  metametricsId: string;
  entropySourceId?: string | null;
  accounts: string[];
};

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['updateProfile'] as const;

/**
 * Actions that {@link UserProfileService} exposes to other consumers.
 */
export type UserProfileServiceActions = UserProfileServiceMethodActions;

/**
 * Actions from other messengers that {@link UserProfileService} calls.
 */
type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerToken;

/**
 * Events that {@link UserProfileService} exposes to other consumers.
 */
export type UserProfileServiceEvents = never;

/**
 * Events from other messengers that {@link UserProfileService} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link UserProfileService}.
 */
export type UserProfileServiceMessenger = Messenger<
  typeof serviceName,
  UserProfileServiceActions | AllowedActions,
  UserProfileServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

export class UserProfileService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: ConstructorParameters<
    typeof UserProfileService
  >[0]['messenger'];

  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: ConstructorParameters<typeof UserProfileService>[0]['fetch'];

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
   * Constructs a new UserProfileService object.
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
    env = Env.DEV,
  }: {
    messenger: UserProfileServiceMessenger;
    fetch: typeof fetch;
    policyOptions?: CreateServicePolicyOptions;
    env?: Env;
  }) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#fetch = fetchFunction;
    this.#policy = createServicePolicy(policyOptions);
    this.#baseURL = getEnvUrl(env);

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
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]) {
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
  onBreak(listener: Parameters<ServicePolicy['onBreak']>[0]) {
    return this.#policy.onBreak(listener);
  }

  /* eslint-disable jsdoc/check-indentation */
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
  /* eslint-enable jsdoc/check-indentation */
  onDegraded(listener: Parameters<ServicePolicy['onDegraded']>[0]) {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Makes a request to the API in order to update the user profile.
   *
   * @param data - The data to send in the profile update request.
   * @returns The response from the API.
   */
  async updateProfile(data: UserProfileUpdateRequest): Promise<void> {
    const authToken = await this.#messenger.call(
      'AuthenticationController:getBearerToken',
      data.entropySourceId || undefined,
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
