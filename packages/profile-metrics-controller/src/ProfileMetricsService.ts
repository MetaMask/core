import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { SDK } from '@metamask/profile-sync-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import {
  array,
  number,
  string,
  type as structType,
} from '@metamask/superstruct';
import type { IDisposable } from 'cockatiel';

import type { ProfileMetricsServiceMethodActions } from './ProfileMetricsService-method-action-types';

/**
 * The shape of an entry in the `POST /api/v2/nonce/batch` response body.
 *
 * `identifier` echoes the request identifier verbatim, mirroring the
 * documented behavior of the single-account `GET /api/v2/nonce` endpoint on
 * the same auth service. Defined with `type()` (not `object()`) so the
 * client tolerates additive server-side schema changes.
 */
const NonceBatchResponseStruct = array(
  structType({
    expires_in: number(),
    identifier: string(),
    nonce: string(),
  }),
);

// === GENERAL ===

/**
 * The name of the {@link ProfileMetricsService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'ProfileMetricsService';

/**
 * A cryptographic proof that the caller controls the private key of an
 * account, as defined by the `PUT /api/v2/profile/accounts` endpoint of the
 * auth API. When present, the server verifies the signature against
 * `metamask:proof-of-ownership:<nonce>:<canonical address>` and permanently
 * marks the account as `verified: true`.
 */
export type AccountOwnershipProof = {
  /**
   * Single-use nonce obtained from {@link ProfileMetricsService.fetchNonces}.
   * Consumed by the server on verification; replay is not possible.
   */
  nonce: string;
  /**
   * Chain-native signature of `metamask:proof-of-ownership:<nonce>:<address>`,
   * always 0x-prefixed. The exact format varies by chain (see the auth API
   * spec — EIP-191 for `eip155`, ed25519 for `solana`, TIP-191 for `tron`,
   * BIP-322 for `bip122`).
   */
  signature: string;
};

/**
 * An account address along with its associated scopes and an optional
 * ownership proof.
 */
export type AccountWithScopes = {
  address: string;
  scopes: `${string}:${string}`[];
  proof?: AccountOwnershipProof;
};

/**
 * The shape of the request object for submitting metrics.
 */
export type ProfileMetricsSubmitMetricsRequest = {
  metametricsId: string;
  entropySourceId?: string | null;
  accounts: AccountWithScopes[];
};

/**
 * The shape of the request object for fetching a batch of single-use nonces.
 */
export type ProfileMetricsFetchNoncesRequest = {
  /**
   * The identifiers (canonical addresses) to mint a nonce for. The auth API
   * accepts between 1 and {@link MAX_NONCE_BATCH_SIZE} identifiers per call.
   */
  identifiers: string[];
  /**
   * The entropy source ID to use when fetching a bearer token. Pass `null` or
   * omit for accounts that do not belong to any entropy source.
   */
  entropySourceId?: string | null;
};

/**
 * Maximum number of identifiers the auth API will mint nonces for in a single
 * `POST /api/v2/nonce/batch` request. {@link ProfileMetricsService.fetchNonces}
 * uses this as the chunk size when the caller requests more than this many
 * nonces at once.
 */
export const MAX_NONCE_BATCH_SIZE = 50;

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['submitMetrics', 'fetchNonces'] as const;

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

/**
 * A service for submitting user profile metrics (metrics ID and accounts).
 */
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
   * Fetch single-use nonces from the auth API, one per identifier.
   *
   * Requests larger than {@link MAX_NONCE_BATCH_SIZE} are split into multiple
   * `POST /api/v2/nonce/batch` calls fired in parallel; the resulting maps are
   * merged into a single record. Each chunk independently goes through the
   * service policy (retry, circuit-breaker, degraded). If any chunk ultimately
   * fails, the whole call rejects so the caller can soft-degrade the entire
   * entropy-source batch consistently.
   *
   * The returned record is keyed by the auth API's echoed `identifier` field
   * (`response[i].identifier -> response[i].nonce`). The call asserts that
   * the response identifier set is exactly the requested set; any mismatch
   * (missing, extra, or duplicated identifier) causes the chunk to throw so
   * the caller never silently proceeds with partial nonces.
   *
   * @param data - The identifiers to mint nonces for, plus the optional
   * entropy source ID used to scope the bearer token.
   * @returns A map of identifier -> nonce.
   * @throws {RangeError} if no identifiers are provided.
   */
  async fetchNonces(
    data: ProfileMetricsFetchNoncesRequest,
  ): Promise<Record<string, string>> {
    if (data.identifiers.length === 0) {
      throw new RangeError(
        'ProfileMetricsService.fetchNonces requires at least 1 identifier.',
      );
    }
    const chunks: string[][] = [];
    for (let i = 0; i < data.identifiers.length; i += MAX_NONCE_BATCH_SIZE) {
      chunks.push(data.identifiers.slice(i, i + MAX_NONCE_BATCH_SIZE));
    }
    const chunkResults = await Promise.all(
      chunks.map((identifiers) =>
        this.#fetchNoncesChunk(identifiers, data.entropySourceId),
      ),
    );
    return Object.assign({}, ...chunkResults);
  }

  /**
   * Mint nonces for a single ≤ {@link MAX_NONCE_BATCH_SIZE}-sized chunk of
   * identifiers. Wrapped in {@link #policy} for retry / degraded / circuit
   * semantics consistent with the rest of the service.
   *
   * @param identifiers - The identifiers in this chunk. Must be 1..MAX_NONCE_BATCH_SIZE.
   * @param entropySourceId - The entropy source ID forwarded to the bearer
   * token resolver.
   * @returns A map of identifier -> nonce for this chunk.
   */
  async #fetchNoncesChunk(
    identifiers: string[],
    entropySourceId: string | null | undefined,
  ): Promise<Record<string, string>> {
    return await this.#policy.execute(async () => {
      const authToken = await this.#messenger.call(
        'AuthenticationController:getBearerToken',
        entropySourceId ?? undefined,
      );
      const url = new URL(`${this.#baseURL}/nonce/batch`);
      const localResponse = await this.#fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifiers }),
        credentials: 'omit',
      });
      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Fetching '${url.toString()}' failed with status '${localResponse.status}'`,
        );
      }
      const body: unknown = await localResponse.json();
      if (!NonceBatchResponseStruct.is(body)) {
        throw new Error(`Malformed response received from '${url.toString()}'`);
      }
      const result: Record<string, string> = {};
      for (const entry of body) {
        result[entry.identifier] = entry.nonce;
      }
      const echoesRequest =
        body.length === identifiers.length &&
        identifiers.every((id) =>
          Object.prototype.hasOwnProperty.call(result, id),
        );
      if (!echoesRequest) {
        throw new Error(
          `Fetching '${url.toString()}' returned a response whose identifier set does not match the request`,
        );
      }
      return result;
    });
  }

  /**
   * Submit metrics to the API.
   *
   * @param data - The data to send in the metrics update request.
   * @returns The response from the API.
   */
  async submitMetrics(data: ProfileMetricsSubmitMetricsRequest): Promise<void> {
    await this.#policy.execute(async () => {
      const authToken = await this.#messenger.call(
        'AuthenticationController:getBearerToken',
        data.entropySourceId ?? undefined,
      );
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
        // The auth API is stateless (no cookies used)
        // prevent marketing cookies scoped to
        // .metamask.io from being forwarded to api which
        // causes 431 Request Header Fields Too Large errors.
        credentials: 'omit',
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
