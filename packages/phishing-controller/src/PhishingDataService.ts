import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
  PersistenceConfiguration,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Infer, Struct } from '@metamask/superstruct';
import {
  array,
  is,
  number,
  optional,
  record,
  string,
  type,
  unknown,
} from '@metamask/superstruct';
import type {
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
  StorageServiceSetItemAction,
} from '@metamask/storage-service';
import { Duration, inMilliseconds } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { PhishingDataServiceMethodActions } from './PhishingDataService-method-action-types.js';
import type {
  AddressScanResult,
  ApprovalsResponse,
  BulkPhishingDetectionScanResponse,
  C2DomainBlocklistResponse,
  DataResultWrapper,
  Hotlist,
  PhishingDetectionScanResult,
  PhishingStalelist,
  TokenScanApiResponse,
} from './types.js';
import { getHostnameFromWebUrl } from './utils.js';

/**
 * A single token's scan result as returned by the bulk token scanning
 * endpoint.
 */
export type TokenScanResultResponse = TokenScanApiResponse['results'][string];

// === GENERAL ===

/**
 * The name of the {@link PhishingDataService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'PhishingDataService';

export const PHISHING_CONFIG_BASE_URL =
  'https://phishing-detection.api.cx.metamask.io';
export const METAMASK_STALELIST_FILE = '/v1/stalelist';
export const METAMASK_HOTLIST_DIFF_FILE = '/v2/diffsSince';

export const CLIENT_SIDE_DETECION_BASE_URL =
  'https://client-side-detection.api.cx.metamask.io';
export const C2_DOMAIN_BLOCKLIST_ENDPOINT = '/v1/request-blocklist';

export const PHISHING_DETECTION_BASE_URL =
  'https://dapp-scanning.api.cx.metamask.io';
export const PHISHING_DETECTION_SCAN_ENDPOINT = 'v2/scan';
export const PHISHING_DETECTION_BULK_SCAN_ENDPOINT = 'bulk-scan';

export const SECURITY_ALERTS_BASE_URL =
  'https://security-alerts.api.cx.metamask.io';
export const TOKEN_BULK_SCANNING_ENDPOINT = '/token/scan-bulk';
export const ADDRESS_SCAN_ENDPOINT = '/address/evm/scan';
export const APPROVALS_ENDPOINT = '/address/evm/approvals';

export const METAMASK_STALELIST_URL = `${PHISHING_CONFIG_BASE_URL}${METAMASK_STALELIST_FILE}`;
export const METAMASK_HOTLIST_DIFF_URL = `${PHISHING_CONFIG_BASE_URL}${METAMASK_HOTLIST_DIFF_FILE}`;
export const C2_DOMAIN_BLOCKLIST_URL = `${CLIENT_SIDE_DETECION_BASE_URL}${C2_DOMAIN_BLOCKLIST_ENDPOINT}`;

/**
 * The maximum number of URLs sent to the bulk dapp-scanning endpoint in one
 * request.
 */
const MAX_URLS_PER_SCAN_REQUEST = 50;

/**
 * The maximum number of tokens sent to the bulk token scanning endpoint in
 * one request.
 */
const MAX_TOKENS_PER_SCAN_REQUEST = 100;

/**
 * How long scan results (URL, bulk URL, token, and address scans) are
 * considered fresh by the query cache. Mirrors the 1-minute TTL previously
 * enforced by the controller's scan caches; scan verdicts can change quickly,
 * so this value is a security parameter and should not be raised casually.
 */
export const SCAN_RESULT_STALE_TIME = inMilliseconds(1, Duration.Minute);

/**
 * Default persistence configuration for the service's query cache. The max
 * age matches the longest useful lifetime of any cached entry: scan results
 * go stale after {@link SCAN_RESULT_STALE_TIME} and list queries are always
 * refetched, so a persisted cache older than this holds nothing usable.
 */
export const DEFAULT_PHISHING_PERSISTENCE_CONFIG: PersistenceConfiguration = {
  maxAge: inMilliseconds(5, Duration.Minute),
};

// === MESSENGER ===

/**
 * All of the methods within {@link PhishingDataService} that are exposed via
 * the messenger.
 */
const MESSENGER_EXPOSED_METHODS = [
  'getStalelist',
  'getHotlistDiffs',
  'getC2DomainBlocklist',
  'scanUrl',
  'bulkScanUrls',
  'scanToken',
  'bulkScanTokens',
  'scanAddress',
  'getApprovals',
] as const;

/**
 * Invalidates cached queries for {@link PhishingDataService}.
 */
export type PhishingDataServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link PhishingDataService} exposes to other consumers.
 */
export type PhishingDataServiceActions =
  | PhishingDataServiceMethodActions
  | PhishingDataServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link PhishingDataService} calls.
 * The StorageService actions are required for query cache persistence.
 */
type AllowedActions =
  | StorageServiceGetItemAction
  | StorageServiceSetItemAction
  | StorageServiceRemoveItemAction;

/**
 * Published when {@link PhishingDataService}'s cache is updated.
 */
export type PhishingDataServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

/**
 * Published when a key within {@link PhishingDataService}'s cache is updated.
 */
export type PhishingDataServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link PhishingDataService} exposes to other consumers.
 */
export type PhishingDataServiceEvents =
  | PhishingDataServiceCacheUpdatedEvent
  | PhishingDataServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link PhishingDataService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link PhishingDataService}.
 */
export type PhishingDataServiceMessenger = Messenger<
  typeof serviceName,
  PhishingDataServiceActions | AllowedActions,
  PhishingDataServiceEvents | AllowedEvents
>;

// === RESPONSE VALIDATION ===

// The structs below intentionally validate only the shape that the consuming
// code depends on for control flow, mirroring the tolerance of the previous
// in-controller fetching: a response that is missing auxiliary fields is
// passed through rather than rejected.
const StalelistResponseStruct = type({
  data: type({
    lastUpdated: number(),
  }),
});

const HotlistDiffsResponseStruct = type({
  data: array(unknown()),
});

const C2DomainBlocklistResponseStruct = type({
  recentlyAdded: array(string()),
  recentlyRemoved: array(string()),
});

const ScanUrlResponseStruct = type({
  recommendedAction: string(),
});

const BulkScanUrlsResponseStruct = type({
  results: record(string(), unknown()),
  errors: record(string(), array(string())),
});

const BulkScanTokensResponseStruct = type({
  results: optional(record(string(), unknown())),
});

const ScanAddressResponseStruct = type({
  result_type: string(),
});

const ApprovalsResponseStruct = type({
  approvals: array(unknown()),
});

// === BATCH LOADING ===

type BatchLoader = {
  /**
   * Registers an item to be resolved by the next executed batch.
   *
   * @param key - The item key, as understood by the batch endpoint.
   * @returns The item's result, or `null` if the batch response did not
   * include it.
   */
  load: (key: string) => Promise<Json | null>;
  /**
   * Executes all pending items, in requests of up to the configured batch
   * size. Items registered after a flush (e.g. by a retry) are scheduled for
   * a later flush automatically.
   */
  flush: () => void;
};

/**
 * Creates a loader that coalesces individual item lookups into batched
 * requests. This preserves the per-item caching granularity of the query
 * cache while keeping the batched network behavior of the bulk endpoints.
 *
 * @param options - The loader options.
 * @param options.maxBatchSize - The maximum number of items per request.
 * @param options.executeBatch - Executes one batched request, returning
 * results keyed by item.
 * @returns The batch loader.
 */
function createBatchLoader({
  maxBatchSize,
  executeBatch,
}: {
  maxBatchSize: number;
  executeBatch: (keys: string[]) => Promise<Record<string, Json>>;
}): BatchLoader {
  type PendingItem = {
    key: string;
    resolve: (value: Json | null) => void;
    reject: (error: unknown) => void;
  };
  let pending: PendingItem[] = [];
  let flushScheduled = false;

  const executeChunk = async (chunk: PendingItem[]): Promise<void> => {
    try {
      const results = await executeBatch(chunk.map((item) => item.key));
      for (const item of chunk) {
        item.resolve(results[item.key] ?? null);
      }
    } catch (error) {
      for (const item of chunk) {
        item.reject(error);
      }
    }
  };

  const flush = (): void => {
    flushScheduled = false;
    const batch = pending;
    pending = [];
    for (let index = 0; index < batch.length; index += maxBatchSize) {
      // Errors are routed to the chunk's items, so this promise never
      // rejects.
      executeChunk(batch.slice(index, index + maxBatchSize)).catch(
        /* istanbul ignore next */
        () => undefined,
      );
    }
  };

  return {
    async load(key: string): Promise<Json | null> {
      return new Promise((resolve, reject) => {
        pending.push({ key, resolve, reject });
        // Items registered outside an explicit flush (e.g. by the retry
        // policy re-running a query) are coalesced via the microtask queue.
        if (!flushScheduled) {
          flushScheduled = true;
          queueMicrotask(() => {
            if (flushScheduled) {
              flush();
            }
          });
        }
      });
    },
    flush,
  };
}

// === SERVICE DEFINITION ===

/**
 * This service is responsible for all network requests made on behalf of
 * `PhishingController`: fetching the phishing configuration lists (stalelist,
 * hotlist diffs, and C2 domain blocklist) and calling the dapp-scanning and
 * security-alerts APIs (URL, token, and address scans).
 *
 * Scan results are cached by the underlying query cache for
 * {@link SCAN_RESULT_STALE_TIME} and persisted between sessions when
 * `persistenceConfig` is enabled (the default), which requires the
 * `StorageService:getItem`, `StorageService:setItem`, and
 * `StorageService:removeItem` messenger actions to be delegated to this
 * service's messenger, plus a call to `init` during client initialization.
 *
 * List queries are always refetched when requested; the controller remains
 * responsible for deciding when the lists are out of date.
 *
 * Note that a single retry/circuit-breaker policy is shared across all
 * endpoints of this service. The policy only counts consecutive failures, so
 * an outage of one API is unlikely to pause requests to the others unless
 * failures arrive without any interleaved successes.
 */
export class PhishingDataService extends BaseDataService<
  typeof serviceName,
  PhishingDataServiceMessenger
> {
  /**
   * Constructs a new PhishingDataService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`,
   * which is used to wrap each request. See
   * {@link CreateServicePolicyOptions}.
   * @param args.persistenceConfig - Configuration for persisting the query
   * cache between sessions. Defaults to
   * {@link DEFAULT_PHISHING_PERSISTENCE_CONFIG}; pass `null` to disable
   * persistence.
   */
  constructor({
    messenger,
    queryClientConfig = {},
    policyOptions = {},
    persistenceConfig = DEFAULT_PHISHING_PERSISTENCE_CONFIG,
  }: {
    messenger: PhishingDataServiceMessenger;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
    persistenceConfig?: PersistenceConfiguration | null;
  }) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      // Circuit breaking is disabled by default: this service talks to four
      // independent API hosts through a single shared policy, so a broken
      // circuit caused by one host's outage would also pause phishing-list
      // updates from the others. Protection against hammering a failing host
      // comes from the controller's refresh-interval bookkeeping and the scan
      // result stale times, matching the previous in-controller behavior.
      policyOptions: {
        maxConsecutiveFailures: Number.MAX_SAFE_INTEGER,
        ...policyOptions,
      },
      persistenceConfig: persistenceConfig ?? undefined,
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches the full phishing detection stalelist.
   *
   * @returns The stalelist response.
   */
  async getStalelist(): Promise<DataResultWrapper<PhishingStalelist>> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:getStalelist`],
      queryFn: async () => this.#getJson(METAMASK_STALELIST_URL),
      staleTime: 0,
    });

    return this.#validate(
      jsonResponse,
      StalelistResponseStruct,
      'stalelist',
    ) as DataResultWrapper<PhishingStalelist>;
  }

  /**
   * Fetches the hotlist diffs recorded since the given timestamp.
   *
   * @param timestamp - The timestamp (in seconds) to fetch diffs since.
   * @returns The hotlist diffs response.
   */
  async getHotlistDiffs(
    timestamp: number,
  ): Promise<DataResultWrapper<Hotlist>> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:getHotlistDiffs`, timestamp],
      queryFn: async () =>
        this.#getJson(`${METAMASK_HOTLIST_DIFF_URL}/${timestamp}`),
      staleTime: 0,
    });

    return this.#validate(
      jsonResponse,
      HotlistDiffsResponseStruct,
      'hotlist diffs',
    ) as DataResultWrapper<Hotlist>;
  }

  /**
   * Fetches the C2 domain blocklist changes recorded since the given
   * timestamp, or the current blocklist if no timestamp is given.
   *
   * @param timestamp - The timestamp (in seconds) to fetch changes since.
   * @returns The C2 domain blocklist response.
   */
  async getC2DomainBlocklist(
    timestamp?: number,
  ): Promise<C2DomainBlocklistResponse> {
    const url =
      timestamp === undefined
        ? C2_DOMAIN_BLOCKLIST_URL
        : `${C2_DOMAIN_BLOCKLIST_URL}?timestamp=${timestamp}`;

    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:getC2DomainBlocklist`, timestamp ?? null],
      queryFn: async () => this.#getJson(url),
      staleTime: 0,
    });

    return this.#validate(
      jsonResponse,
      C2DomainBlocklistResponseStruct,
      'C2 domain blocklist',
    ) as C2DomainBlocklistResponse;
  }

  /**
   * Scans a URL for phishing via the dapp-scanning API.
   *
   * @param url - The prepared URL parameter to scan (hostname, or hostname
   * plus path for shared gateways).
   * @returns The phishing detection scan result.
   */
  async scanUrl(url: string): Promise<PhishingDetectionScanResult> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:scanUrl`, url],
      queryFn: async () => {
        const response = await fetch(
          `${PHISHING_DETECTION_BASE_URL}/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(url)}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          },
        );
        return this.#toJson(response);
      },
      staleTime: SCAN_RESULT_STALE_TIME,
    });

    return this.#validate(
      jsonResponse,
      ScanUrlResponseStruct,
      'URL scan',
    ) as PhishingDetectionScanResult;
  }

  /**
   * Scans a batch of URLs for phishing via the dapp-scanning API.
   *
   * Results are cached per hostname using the same query keys as
   * {@link PhishingDataService.scanUrl}, so results are shared between single
   * and bulk scans. Only hostnames without a fresh cached result are sent to
   * the API, in requests of up to 50 URLs.
   *
   * @param urls - The URLs to scan.
   * @returns The scan results, keyed by URL, and any batch-level errors.
   */
  async bulkScanUrls(
    urls: string[],
  ): Promise<BulkPhishingDetectionScanResponse> {
    const errors: Record<string, string[]> = {};
    const loader = createBatchLoader({
      maxBatchSize: MAX_URLS_PER_SCAN_REQUEST,
      executeBatch: async (batchUrls) => {
        const jsonResponse = await this.#postJson(
          `${PHISHING_DETECTION_BASE_URL}/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`,
          { urls: batchUrls },
        );
        const response = this.#validate(
          jsonResponse,
          BulkScanUrlsResponseStruct,
          'bulk URL scan',
        ) as BulkPhishingDetectionScanResponse;
        for (const [key, messages] of Object.entries(response.errors)) {
          errors[key] = [...(errors[key] ?? []), ...messages];
        }
        return response.results as Record<string, Json>;
      },
    });

    const entries = urls.map((url) => {
      const [hostname] = getHostnameFromWebUrl(url);
      return this.fetchQuery({
        queryKey: [`${this.name}:scanUrl`, hostname],
        queryFn: async () => loader.load(url),
        staleTime: SCAN_RESULT_STALE_TIME,
      }).then((result) => [url, hostname, result] as const);
    });
    loader.flush();

    const results: Record<string, PhishingDetectionScanResult> = {};
    for (const [url, hostname, result] of await Promise.all(entries)) {
      if (result !== null) {
        const scanResult = result as PhishingDetectionScanResult;
        // Entries seeded by single-URL scans hold the raw scan response,
        // which may not include the hostname; fill it in from the URL.
        results[url] = {
          ...scanResult,
          hostname: scanResult.hostname ?? hostname,
        };
      }
    }

    return { results, errors };
  }

  /**
   * Scans a token for malicious activity via the security-alerts API.
   *
   * Requests made while a bulk scan is being assembled are coalesced into a
   * single request to the bulk scanning endpoint.
   *
   * @param chain - The chain name (e.g. `ethereum`).
   * @param token - The token address to scan.
   * @returns The token scan result, or `null` if the API returned no result
   * for the token.
   */
  async scanToken(
    chain: string,
    token: string,
  ): Promise<TokenScanResultResponse | null> {
    const loader = this.#createTokenScanLoader(chain);
    const result = this.#fetchTokenScanQuery(loader, chain, token);
    loader.flush();
    return await result;
  }

  /**
   * Scans a batch of tokens for malicious activity via the security-alerts
   * API.
   *
   * Results are cached per token; only tokens without a fresh cached result
   * are sent to the API, in requests of up to 100 tokens.
   *
   * @param chain - The chain name (e.g. `ethereum`).
   * @param tokens - The token addresses to scan.
   * @returns The token scan results, keyed by token address. Tokens for which
   * the API returned no result are omitted.
   */
  async bulkScanTokens(
    chain: string,
    tokens: string[],
  ): Promise<TokenScanApiResponse> {
    const loader = this.#createTokenScanLoader(chain);
    const entries = tokens.map((token) =>
      this.#fetchTokenScanQuery(loader, chain, token).then(
        (result) => [token, result] as const,
      ),
    );
    loader.flush();

    const results: TokenScanApiResponse['results'] = {};
    for (const [token, result] of await Promise.all(entries)) {
      if (result !== null) {
        results[token] = result;
      }
    }

    return { results };
  }

  /**
   * Creates a batch loader that resolves token scans through the bulk
   * scanning endpoint.
   *
   * @param chain - The chain name (e.g. `ethereum`).
   * @returns The batch loader.
   */
  #createTokenScanLoader(chain: string): BatchLoader {
    return createBatchLoader({
      maxBatchSize: MAX_TOKENS_PER_SCAN_REQUEST,
      executeBatch: async (batchTokens) => {
        const jsonResponse = await this.#postJson(
          `${SECURITY_ALERTS_BASE_URL}${TOKEN_BULK_SCANNING_ENDPOINT}`,
          { chain, tokens: batchTokens },
        );
        const response = this.#validate(
          jsonResponse,
          BulkScanTokensResponseStruct,
          'bulk token scan',
        ) as TokenScanApiResponse;
        return (response.results ?? {}) as Record<string, Json>;
      },
    });
  }

  /**
   * Fetches a single token scan query backed by the given batch loader.
   *
   * @param loader - The batch loader used to resolve cache misses.
   * @param chain - The chain name (e.g. `ethereum`).
   * @param token - The token address to scan.
   * @returns The token scan result, or `null` if the API returned no result.
   */
  async #fetchTokenScanQuery(
    loader: BatchLoader,
    chain: string,
    token: string,
  ): Promise<TokenScanResultResponse | null> {
    const result = await this.fetchQuery({
      queryKey: [`${this.name}:scanToken`, chain, token],
      queryFn: async () => loader.load(token),
      staleTime: SCAN_RESULT_STALE_TIME,
    });
    return result as TokenScanResultResponse | null;
  }

  /**
   * Scans an address for security alerts via the security-alerts API.
   *
   * @param chain - The chain name (e.g. `ethereum`).
   * @param address - The address to scan.
   * @returns The address scan result.
   */
  async scanAddress(
    chain: string,
    address: string,
  ): Promise<AddressScanResult> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:scanAddress`, chain, address],
      queryFn: async () =>
        this.#postJson(`${SECURITY_ALERTS_BASE_URL}${ADDRESS_SCAN_ENDPOINT}`, {
          chain,
          address,
        }),
      staleTime: SCAN_RESULT_STALE_TIME,
    });

    return this.#validate(
      jsonResponse,
      ScanAddressResponseStruct,
      'address scan',
    ) as AddressScanResult;
  }

  /**
   * Gets token approvals for an address with security enrichments via the
   * security-alerts API. Approvals reflect live account state and are never
   * cached.
   *
   * @param chain - The chain name (e.g. `ethereum`).
   * @param address - The address to get approvals for.
   * @returns The approvals response.
   */
  async getApprovals(
    chain: string,
    address: string,
  ): Promise<ApprovalsResponse> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:getApprovals`, chain, address],
      queryFn: async () =>
        this.#postJson(`${SECURITY_ALERTS_BASE_URL}${APPROVALS_ENDPOINT}`, {
          chain,
          address,
        }),
      staleTime: 0,
      cacheTime: 0,
    });

    return this.#validate(
      jsonResponse,
      ApprovalsResponseStruct,
      'approvals',
    ) as ApprovalsResponse;
  }

  /**
   * Performs a GET request against a phishing configuration endpoint.
   *
   * @param url - The URL to fetch.
   * @returns The parsed JSON response.
   */
  async #getJson(url: string): Promise<Json> {
    const response = await fetch(url, { cache: 'no-cache' });
    return this.#toJson(response);
  }

  /**
   * Performs a POST request with a JSON body.
   *
   * @param url - The URL to fetch.
   * @param body - The request body, serialized as JSON.
   * @returns The parsed JSON response.
   */
  async #postJson(url: string, body: Record<string, Json>): Promise<Json> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return this.#toJson(response);
  }

  /**
   * Parses a response as JSON, throwing an {@link HttpError} for non-2xx
   * responses. The error message intentionally matches the
   * `<status> <statusText>` format historically produced by
   * `PhishingController` so that consumers relying on it keep working.
   *
   * @param response - The response to parse.
   * @returns The parsed JSON response.
   */
  async #toJson(response: Response): Promise<Json> {
    if (!response.ok) {
      throw new HttpError(
        response.status,
        `${response.status} ${response.statusText}`,
      );
    }
    return response.json();
  }

  /**
   * Validates a response against a struct, throwing if it is malformed.
   *
   * @param response - The response to validate.
   * @param struct - The struct to validate against.
   * @param endpointName - The name of the endpoint, used in error messages.
   * @returns The validated response.
   */
  #validate<Type, Schema>(
    response: unknown,
    struct: Struct<Type, Schema>,
    endpointName: string,
  ): Infer<Struct<Type, Schema>> {
    if (!is(response, struct)) {
      throw new Error(
        `Malformed response received from ${endpointName} endpoint`,
      );
    }
    return response;
  }
}
