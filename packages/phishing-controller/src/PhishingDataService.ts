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
import type {
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
  StorageServiceSetItemAction,
} from '@metamask/storage-service';
import type { Infer, Struct } from '@metamask/superstruct';
import {
  array,
  boolean,
  is,
  literal,
  number,
  optional,
  record,
  string,
  type,
  union,
  unknown,
} from '@metamask/superstruct';
import { Duration, getErrorMessage, inMilliseconds } from '@metamask/utils';
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
import {
  AddressScanResultType,
  ApprovalFeatureType,
  ApprovalResultType,
  RecommendedAction,
  TokenScanResultType,
} from './types.js';
import {
  getHostnameFromWebUrl,
  getPhishingDetectionScanUrlParam,
} from './utils.js';

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

// Request timeouts, in milliseconds.
export const URL_SCAN_TIMEOUT = 8000;
export const BULK_URL_SCAN_TIMEOUT = 15000;
export const TOKEN_SCAN_TIMEOUT = 8000;
export const ADDRESS_SCAN_TIMEOUT = 5000;
export const APPROVALS_TIMEOUT = 5000;

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
 * How long a scan result is retained by the query cache before it is eligible
 * for garbage collection. This is set explicitly because TanStack Query
 * defaults `gcTime` to `Infinity` when it detects a server environment, which
 * includes the extension's MV3 service worker (`window` is undefined there).
 * Without it, the cache would grow without bound for the life of the worker,
 * whereas the cache this service replaces was explicitly size-bounded.
 */
export const SCAN_RESULT_GC_TIME = inMilliseconds(5, Duration.Minute);

/**
 * How long a fetched list is retained by the query cache. The lists are always
 * refetched (`staleTime: 0`) and the controller keeps its own copy in
 * `phishingLists`, so retaining them here has no benefit and a large cost: the
 * stalelist is several megabytes, and the persisted cache is rewritten
 * whenever any query changes, including on every scan.
 */
const LIST_GC_TIME = 0;

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

const RecommendedActionStruct = union([
  literal(RecommendedAction.None),
  literal(RecommendedAction.Warn),
  literal(RecommendedAction.Block),
  literal(RecommendedAction.Verified),
]);

const TokenScanResultTypeStruct = union([
  literal(TokenScanResultType.Verified),
  literal(TokenScanResultType.Benign),
  literal(TokenScanResultType.Warning),
  literal(TokenScanResultType.Malicious),
  literal(TokenScanResultType.Spam),
]);

const AddressScanResultTypeStruct = union([
  literal(AddressScanResultType.Verified),
  literal(AddressScanResultType.Trusted),
  literal(AddressScanResultType.Benign),
  literal(AddressScanResultType.Warning),
  literal(AddressScanResultType.Malicious),
  literal(AddressScanResultType.ErrorResult),
  literal(AddressScanResultType.ApiError),
]);

const ApprovalResultTypeStruct = union([
  literal(ApprovalResultType.Verified),
  literal(ApprovalResultType.Trusted),
  literal(ApprovalResultType.Benign),
  literal(ApprovalResultType.Warning),
  literal(ApprovalResultType.Malicious),
  literal(ApprovalResultType.ErrorResult),
]);

const ApprovalFeatureTypeStruct = union([
  literal(ApprovalFeatureType.Benign),
  literal(ApprovalFeatureType.Warning),
  literal(ApprovalFeatureType.Malicious),
  literal(ApprovalFeatureType.Info),
]);

const StalelistResponseStruct = type({
  data: type({
    allowlist: array(string()),
    blocklist: array(string()),
    blocklistPaths: array(string()),
    fuzzylist: array(string()),
    tolerance: number(),
    version: number(),
    lastUpdated: number(),
  }),
});

const HotlistDiffsResponseStruct = type({
  data: array(
    type({
      url: string(),
      timestamp: number(),
      // Kept open so that a list added server-side does not reject the whole
      // hotlist; `applyDiffs` ignores entries for unknown list types.
      targetList: string(),
      isRemoval: optional(boolean()),
    }),
  ),
});

const C2DomainBlocklistResponseStruct = type({
  recentlyAdded: array(string()),
  recentlyRemoved: array(string()),
  // The controller never reads this field, so its absence must not reject
  // the whole blocklist response.
  lastFetchedAt: optional(number()),
});

const ScanUrlResponseStruct = type({
  hostname: optional(string()),
  recommendedAction: RecommendedActionStruct,
  fetchError: optional(string()),
});

// Entries are validated individually by `bulkScanUrls`, so that one malformed
// entry is reported for that URL rather than discarding every verdict.
const BulkScanUrlsResponseStruct = type({
  results: record(string(), unknown()),
  errors: optional(record(string(), array(string()))),
});

const TokenScanResultStruct = type({
  result_type: TokenScanResultTypeStruct,
  chain: optional(string()),
  address: optional(string()),
});

// Entries are validated individually by the token batch loader, so that one
// malformed entry is reported for that token rather than discarding every
// verdict.
const BulkScanTokensResponseStruct = type({
  results: optional(record(string(), unknown())),
});

const ScanAddressResponseStruct = type({
  result_type: AddressScanResultTypeStruct,
  label: string(),
});

const ApprovalFeatureStruct = type({
  feature_id: string(),
  type: ApprovalFeatureTypeStruct,
  description: string(),
});

const ApprovalStruct = type({
  allowance: type({
    value: optional(string()),
    usd_price: optional(string()),
  }),
  asset: type({
    address: string(),
    symbol: string(),
    name: string(),
    decimals: number(),
    logo_url: optional(string()),
    type: optional(string()),
  }),
  exposure: type({
    usd_price: optional(string()),
    value: string(),
    raw_value: string(),
  }),
  spender: type({
    address: string(),
    label: optional(string()),
    features: optional(array(ApprovalFeatureStruct)),
  }),
  verdict: ApprovalResultTypeStruct,
});

// Entries are validated individually by `getApprovals`, so that one malformed
// approval does not empty the whole list.
const ApprovalsResponseStruct = type({
  approvals: array(unknown()),
});

// === BATCH LOADING ===

/**
 * The outcome of one batched request: results keyed by item, plus any
 * per-item errors reported by the endpoint. Items listed in `errors` are
 * rejected rather than resolved, so that an endpoint-reported failure is not
 * cached as a "no result" verdict.
 */
type BatchOutcome = {
  results: Record<string, Json>;
  errors?: Record<string, Error>;
};

/**
 * An error reported by a batch endpoint for one specific item, as opposed to a
 * failure of the request as a whole. These are surfaced to the caller per item
 * and never cached, but they do not make the overall call fail.
 */
class BatchItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BatchItemError';
  }
}

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
  executeBatch: (keys: string[]) => Promise<BatchOutcome>;
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
      const { results, errors = {} } = await executeBatch(
        chunk.map((item) => item.key),
      );
      for (const item of chunk) {
        const itemError = errors[item.key];
        if (itemError) {
          item.reject(itemError);
        } else {
          item.resolve(results[item.key] ?? null);
        }
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
  readonly #abortController = new AbortController();

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
      queryClientConfig: {
        ...queryClientConfig,
        defaultOptions: {
          ...queryClientConfig.defaultOptions,
          queries: {
            ...queryClientConfig.defaultOptions?.queries,
            // Hydration reconstructs queries using these defaults. Without an
            // explicit value, service workers receive TanStack's server
            // default of `Infinity`, which cannot later be reduced by a
            // per-query option.
            gcTime: SCAN_RESULT_GC_TIME,
          },
        },
      },
      // Circuit breaking is disabled by default: this service talks to four
      // independent API hosts through a single shared policy, so a broken
      // circuit caused by one host's outage would also pause phishing-list
      // updates from the others. Protection against hammering a failing host
      // comes from the controller's refresh-interval bookkeeping and the scan
      // result stale times, matching the previous in-controller behavior.
      //
      // Retries are disabled by default for the same reason. The previous
      // in-controller implementation made a single request per call, and the
      // controller's timeouts are sized for one attempt. Retries are also
      // unsafe for the batched endpoints: a failed batch rejects every item
      // query in it, and each would then retry independently, turning one
      // failed request into many single-item requests against a host that is
      // already failing.
      policyOptions: {
        maxConsecutiveFailures: Number.MAX_SAFE_INTEGER,
        maxRetries: 0,
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
   * Aborts all requests owned by this service before clearing its query cache
   * and messenger registrations.
   */
  override destroy(): void {
    this.#abortController.abort();
    super.destroy();
  }

  /**
   * Fetches the full phishing detection stalelist.
   *
   * @returns The stalelist response.
   */
  async getStalelist(): Promise<DataResultWrapper<PhishingStalelist>> {
    const jsonResponse = await this.fetchQuery({
      queryKey: [`${this.name}:getStalelist`],
      // Validated inside the query function so that a malformed response is
      // never committed to, or persisted from, the query cache.
      queryFn: async ({ signal }) =>
        this.#validate(
          await this.#getJson(METAMASK_STALELIST_URL, { signal }),
          StalelistResponseStruct,
          'stalelist',
        ) as Json,
      staleTime: 0,
      gcTime: LIST_GC_TIME,
    });

    return jsonResponse as DataResultWrapper<PhishingStalelist>;
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
      queryFn: async ({ signal }) =>
        this.#validate(
          await this.#getJson(`${METAMASK_HOTLIST_DIFF_URL}/${timestamp}`, {
            signal,
          }),
          HotlistDiffsResponseStruct,
          'hotlist diffs',
        ) as Json,
      staleTime: 0,
      gcTime: LIST_GC_TIME,
    });

    return jsonResponse as DataResultWrapper<Hotlist>;
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
      queryFn: async ({ signal }) =>
        this.#validate(
          await this.#getJson(url, { signal }),
          C2DomainBlocklistResponseStruct,
          'C2 domain blocklist',
        ) as Json,
      staleTime: 0,
      gcTime: LIST_GC_TIME,
    });

    return jsonResponse as C2DomainBlocklistResponse;
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
      queryFn: async ({ signal }) => {
        const response = await this.#fetchJson(
          `${PHISHING_DETECTION_BASE_URL}/${PHISHING_DETECTION_SCAN_ENDPOINT}?url=${encodeURIComponent(url)}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
            signal,
          },
          URL_SCAN_TIMEOUT,
        );
        const scanResult = this.#validate(
          response,
          ScanUrlResponseStruct,
          'URL scan',
        );
        if (scanResult.fetchError) {
          throw new Error(scanResult.fetchError);
        }
        const [hostname] = getHostnameFromWebUrl(`https://${url}`);
        return {
          ...scanResult,
          hostname: scanResult.hostname ?? hostname,
        } as Json;
      },
      staleTime: SCAN_RESULT_STALE_TIME,
      gcTime: SCAN_RESULT_GC_TIME,
    });

    return jsonResponse as PhishingDetectionScanResult;
  }

  /**
   * Scans a batch of URLs for phishing via the dapp-scanning API.
   *
   * Results are cached under the same query keys as
   * {@link PhishingDataService.scanUrl}, so results are shared between single
   * and bulk scans, including for the path-sensitive hosts listed in
   * `PHISHING_DETECTION_PATH_BASED_ROOT_DOMAINS`. Only URLs without a fresh
   * cached result are sent to the API, in requests of up to 50 URLs.
   *
   * If some lookups fail, the results that did resolve are still returned and
   * the failures are reported per URL. The call only rejects when nothing at
   * all could be resolved.
   *
   * @param urls - The URLs to scan.
   * @returns The scan results, keyed by URL, and any per-URL errors.
   */
  async bulkScanUrls(
    urls: string[],
  ): Promise<BulkPhishingDetectionScanResponse> {
    const errors: Record<string, string[]> = {};
    const addError = (key: string, message: string): void => {
      errors[key] = [...(errors[key] ?? []), message];
    };

    const loader = createBatchLoader({
      maxBatchSize: MAX_URLS_PER_SCAN_REQUEST,
      executeBatch: async (batchUrls) => {
        const jsonResponse = await this.#postJson(
          `${PHISHING_DETECTION_BASE_URL}/${PHISHING_DETECTION_BULK_SCAN_ENDPOINT}`,
          { urls: batchUrls },
          { timeout: BULK_URL_SCAN_TIMEOUT },
        );
        const response = this.#validate(
          jsonResponse,
          BulkScanUrlsResponseStruct,
          'bulk URL scan',
        );
        // URLs the endpoint reported an error for are rejected rather than
        // resolved, so that the failure is surfaced to the caller instead of
        // being cached as a "no result" verdict for the stale time.
        const itemErrors: Record<string, Error> = {};
        for (const [key, messages] of Object.entries(response.errors ?? {})) {
          itemErrors[key] = new BatchItemError(messages.join(', '));
        }
        const results: Record<string, Json> = {};
        for (const [key, result] of Object.entries(response.results)) {
          if (!is(result, ScanUrlResponseStruct)) {
            itemErrors[key] = new BatchItemError(
              'Malformed result returned by bulk URL scan endpoint',
            );
          } else if (result.fetchError) {
            itemErrors[key] = new BatchItemError(result.fetchError);
          } else {
            // Entries are shared with `scanUrl`, whose results always carry a
            // hostname, so fill it in before the entry reaches the cache.
            const [hostname] = getHostnameFromWebUrl(key);
            results[key] = {
              ...result,
              hostname: result.hostname ?? hostname,
            } as Json;
          }
        }
        for (const url of batchUrls) {
          if (!Object.hasOwn(results, url) && !Object.hasOwn(itemErrors, url)) {
            itemErrors[url] = new BatchItemError(
              'No result returned by bulk URL scan endpoint',
            );
          }
        }
        return {
          results,
          errors: itemErrors,
        };
      },
    });

    const requested: string[] = [];
    const entries: Promise<Json | null>[] = [];
    for (const url of urls) {
      const [scanUrlParam, ok] = getPhishingDetectionScanUrlParam(url);
      if (!ok) {
        addError(url, 'url is not a valid web URL');
        continue;
      }
      requested.push(url);
      entries.push(
        // Keyed by the scan parameter rather than the bare hostname so that
        // path-sensitive hosts (see
        // `PHISHING_DETECTION_PATH_BASED_ROOT_DOMAINS`) get one entry per
        // path, and so that entries are shared with `scanUrl`.
        this.fetchQuery({
          queryKey: [`${this.name}:scanUrl`, scanUrlParam],
          queryFn: async () => loader.load(url),
          staleTime: SCAN_RESULT_STALE_TIME,
          gcTime: SCAN_RESULT_GC_TIME,
        }),
      );
    }
    loader.flush();

    const settled = await Promise.allSettled(entries);
    const results: Record<string, PhishingDetectionScanResult> = {};
    let requestFailure: { reason: unknown } | undefined;

    for (const [index, outcome] of settled.entries()) {
      const url = requested[index];

      if (outcome.status === 'rejected') {
        addError(url, getErrorMessage(outcome.reason));
        if (!(outcome.reason instanceof BatchItemError)) {
          requestFailure ??= { reason: outcome.reason };
        }
        continue;
      }

      results[url] = outcome.value as PhishingDetectionScanResult;
    }

    // A request-level failure that produced nothing at all is surfaced to the
    // caller, matching the previous behavior. If anything did resolve, keep
    // it, including fresh cache hits, so that one failed lookup cannot
    // discard a cached BLOCK verdict for a different URL.
    if (requestFailure && Object.keys(results).length === 0) {
      throw requestFailure.reason;
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
    let firstError: Error | undefined;
    for (const outcome of await Promise.allSettled(entries)) {
      if (outcome.status === 'rejected') {
        firstError ??= outcome.reason as Error;
        continue;
      }

      const [token, result] = outcome.value;
      if (result !== null) {
        results[token] = result;
      }
    }

    if (Object.keys(results).length === 0 && firstError !== undefined) {
      throw firstError;
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
          { timeout: TOKEN_SCAN_TIMEOUT },
        );
        const response = this.#validate(
          jsonResponse,
          BulkScanTokensResponseStruct,
          'bulk token scan',
        );
        const results: Record<string, Json> = {};
        const errors: Record<string, Error> = {};
        for (const [key, result] of Object.entries(response.results ?? {})) {
          if (is(result, TokenScanResultStruct)) {
            results[key] = result as Json;
          } else {
            errors[key] = new BatchItemError(
              'Malformed result returned by bulk token scan endpoint',
            );
          }
        }
        return { results, errors };
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
      gcTime: SCAN_RESULT_GC_TIME,
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
      queryFn: async ({ signal }) =>
        this.#validate(
          await this.#postJson(
            `${SECURITY_ALERTS_BASE_URL}${ADDRESS_SCAN_ENDPOINT}`,
            { chain, address },
            { signal, timeout: ADDRESS_SCAN_TIMEOUT },
          ),
          ScanAddressResponseStruct,
          'address scan',
        ) as Json,
      staleTime: SCAN_RESULT_STALE_TIME,
      gcTime: SCAN_RESULT_GC_TIME,
    });

    return jsonResponse as AddressScanResult;
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
    // Deliberately not routed through `fetchQuery`. Approvals reflect live,
    // account-specific state that is never cached, so the query cache would
    // provide no benefit while publishing the response on the messenger as a
    // `cacheUpdated` payload. This matches the handling of non-cached POSTs
    // elsewhere in the monorepo.
    const jsonResponse = await this.executeWithPolicy(() =>
      this.#postJson(
        `${SECURITY_ALERTS_BASE_URL}${APPROVALS_ENDPOINT}`,
        { chain, address },
        { timeout: APPROVALS_TIMEOUT },
      ),
    );

    const response = this.#validate(
      jsonResponse,
      ApprovalsResponseStruct,
      'approvals',
    );
    return {
      approvals: response.approvals.filter((approval) =>
        is(approval, ApprovalStruct),
      ),
    } as ApprovalsResponse;
  }

  /**
   * Performs a GET request against a phishing configuration endpoint.
   *
   * @param url - The URL to fetch.
   * @param options - Request cancellation options.
   * @param options.signal - A signal that cancels the request.
   * @returns The parsed JSON response.
   */
  async #getJson(
    url: string,
    { signal }: { signal?: AbortSignal },
  ): Promise<Json> {
    return this.#fetchJson(url, { cache: 'no-cache', signal });
  }

  /**
   * Performs a POST request with a JSON body.
   *
   * @param url - The URL to fetch.
   * @param body - The request body, serialized as JSON.
   * @param options - Request cancellation options.
   * @param options.signal - A signal that cancels the request.
   * @param options.timeout - The request timeout, in milliseconds.
   * @returns The parsed JSON response.
   */
  async #postJson(
    url: string,
    body: Record<string, Json>,
    { signal, timeout }: { signal?: AbortSignal; timeout?: number },
  ): Promise<Json> {
    return this.#fetchJson(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      },
      timeout,
    );
  }

  /**
   * Performs a fetch request and parses its JSON response.
   *
   * @param url - The URL to fetch.
   * @param init - The fetch request options.
   * @param timeout - The optional request timeout, in milliseconds.
   * @returns The parsed JSON response.
   */
  async #fetchJson(
    url: string,
    init: RequestInit,
    timeout?: number,
  ): Promise<Json> {
    const controller = new AbortController();
    const sourceSignal = init.signal;
    const serviceSignal = this.#abortController.signal;
    let didTimeout = false;
    const abort = (): void => controller.abort();
    const timer =
      timeout === undefined
        ? undefined
        : setTimeout(() => {
            didTimeout = true;
            controller.abort();
          }, timeout);

    sourceSignal?.addEventListener('abort', abort, { once: true });
    serviceSignal.addEventListener('abort', abort, { once: true });
    /* istanbul ignore next -- service actions are removed during destruction */
    if (sourceSignal?.aborted || serviceSignal.aborted) {
      controller.abort();
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return await this.#toJson(response);
    } catch (error) {
      if (didTimeout) {
        throw new Error(`timeout of ${timeout}ms exceeded`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
      sourceSignal?.removeEventListener('abort', abort);
      serviceSignal.removeEventListener('abort', abort);
    }
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
