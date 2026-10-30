import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { SDK } from '@metamask/profile-sync-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  number,
  string,
  type as structType,
} from '@metamask/superstruct';

import type { ProfileMetricsServiceMethodActions } from './ProfileMetricsService-method-action-types.js';

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

type NonceBatchResponse = Infer<typeof NonceBatchResponseStruct>;

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
 * The kind of keyring that controls an account, as accepted by the auth API.
 * Any other value is rejected by the API, so unrecognized keyrings must be
 * left untagged rather than passed through.
 */
export type AccountSource = 'mnemonic' | 'hardware' | 'imported' | 'snap';

/**
 * An account address along with its associated scopes, an optional account
 * source, and an optional ownership proof.
 */
export type AccountWithScopes = {
  address: string;
  scopes: `${string}:${string}`[];
  accountSource?: AccountSource;
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
 * Invalidates cached queries for {@link ProfileMetricsService}.
 */
export type ProfileMetricsServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link ProfileMetricsService} exposes to other consumers.
 */
export type ProfileMetricsServiceActions =
  | ProfileMetricsServiceMethodActions
  | ProfileMetricsServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link ProfileMetricsService} calls.
 */
type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerTokenAction;

/**
 * Published when {@link ProfileMetricsService}'s cache is updated.
 */
export type ProfileMetricsServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link ProfileMetricsService}'s cache is
 * updated.
 */
export type ProfileMetricsServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link ProfileMetricsService} exposes to other consumers.
 */
export type ProfileMetricsServiceEvents =
  | ProfileMetricsServiceCacheUpdatedEvent
  | ProfileMetricsServiceGranularCacheUpdatedEvent;

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
export class ProfileMetricsService extends BaseDataService<
  typeof serviceName,
  ProfileMetricsServiceMessenger
> {
  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: typeof fetch;

  /**
   * The API base URL environment.
   */
  readonly #baseURL: string;

  /**
   * Counter used to give every nonce request its own query key, so that
   * concurrent `fetchNonces` calls never share a request or a result.
   */
  #nonceRequestCounter = 0;

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
   * `fetchNonces` is retried according to these options: a failed nonce fetch
   * soft-degrades to a proof-less submit that clears the queue, so retries
   * here are what preserve proofs across transient errors. `submitMetrics` is
   * never retried (proof nonces are single-use; the controller poll re-fetches
   * nonces and retries failed submits). Both share one circuit breaker.
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
    super({ name: serviceName, messenger, policyOptions });
    this.#fetch = fetchFunction;
    this.#baseURL = getAuthUrl(env);

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetch single-use nonces from the auth API, one per identifier.
   *
   * Requests larger than {@link MAX_NONCE_BATCH_SIZE} are split into multiple
   * `POST /api/v2/nonce/batch` calls fired in parallel; the resulting maps are
   * merged into a single record. Each chunk independently goes through the
   * service policy (retry, circuit-breaker, degraded).
   *
   * Nonces are single-use, so concurrent calls with identical arguments are
   * not deduplicated: every call, and every chunk, makes its own request. If any chunk ultimately
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
   * identifiers. Wrapped in the service policy for retry / degraded / circuit
   * semantics.
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
    // The key carries no identifiers or entropy source ID (keys show up in
    // the names of published cache events), and it is unique per request so
    // that single-use nonces are never shared between callers.
    this.#nonceRequestCounter += 1;
    const body = await this.fetchQuery({
      queryKey: [`${this.name}:fetchNonces`, this.#nonceRequestCounter],
      staleTime: 0,
      gcTime: 0,
      responseStruct: NonceBatchResponseStruct,
      queryFn: async () => {
        const authToken = await this.messenger.call(
          'AuthenticationController:getBearerToken',
          entropySourceId ?? undefined,
        );
        const url = new URL(`${this.#baseURL}/nonce/batch`);
        const response = await this.#fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ identifiers }),
          credentials: 'omit',
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Fetching '${url.toString()}' failed with status '${response.status}'`,
          );
        }
        return (await response.json()) as NonceBatchResponse;
      },
    });
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
        `Fetching '${this.#baseURL}/nonce/batch' returned a response whose identifier set does not match the request`,
      );
    }
    return result;
  }

  /**
   * Submit metrics to the API.
   *
   * The request is never retried, because proof payloads embed single-use
   * nonces.
   *
   * @param data - The data to send in the metrics update request.
   * @returns Nothing, once the API has accepted the request.
   */
  async submitMetrics(data: ProfileMetricsSubmitMetricsRequest): Promise<void> {
    await this.executeMutation({
      // No request data in the key: keys show up in the names of published
      // cache events.
      mutationKey: [`${this.name}:submitMetrics`],
      gcTime: 0,
      mutationFn: async () => {
        const authToken = await this.messenger.call(
          'AuthenticationController:getBearerToken',
          data.entropySourceId ?? undefined,
        );
        const url = new URL(`${this.#baseURL}/profile/accounts`);
        const response = await this.#fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            metametrics_id: data.metametricsId,
            accounts: data.accounts.map(({ accountSource, ...account }) => ({
              ...account,
              // Omitted rather than sent empty when unknown, per the API spec.
              ...(accountSource ? { account_source: accountSource } : {}),
            })),
          }),
          // The auth API is stateless (no cookies used)
          // prevent marketing cookies scoped to
          // .metamask.io from being forwarded to api which
          // causes 431 Request Header Fields Too Large errors.
          credentials: 'omit',
        });
        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Fetching '${url.toString()}' failed with status '${response.status}'`,
          );
        }
        return null;
      },
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
