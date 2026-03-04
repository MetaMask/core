import type { Json } from '@metamask/utils';

/**
 * Types of resources that can have loading/error states.
 */
export type ResourceType =
  | 'countries'
  | 'providers'
  | 'tokens'
  | 'paymentMethods';

/**
 * Status of a cached request.
 */
export enum RequestStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
}

/**
 * State of a single cached request.
 * All properties must be JSON-serializable to satisfy StateConstraint.
 */
export type RequestState = {
  /** Current status of the request */
  status: `${RequestStatus}`;
  /** The data returned by the request, if successful */
  data: Json | null;
  /** Error message if the request failed */
  error: string | null;
  /** Timestamp when the request completed (for TTL calculation) */
  timestamp: number;
  /** Timestamp when the fetch started */
  lastFetchedAt: number;
};

/**
 * Cache of request states, keyed by cache key.
 */
export type RequestCache = Record<string, RequestState>;

/**
 * Default TTL for cached requests in milliseconds (15 minutes).
 */
export const DEFAULT_REQUEST_CACHE_TTL = 15 * 60 * 1000;

/**
 * Default maximum number of entries in the request cache.
 */
export const DEFAULT_REQUEST_CACHE_MAX_SIZE = 250;

/**
 * Creates a cache key from a method name and parameters.
 *
 * @param method - The method name.
 * @param params - The parameters passed to the method.
 * @returns A unique cache key string.
 */
export function createCacheKey(method: string, params: unknown[]): string {
  return `${method}:${JSON.stringify(params)}`;
}

/**
 * Checks if a cached request has expired based on TTL.
 *
 * @param requestState - The cached request state.
 * @param ttl - Time to live in milliseconds.
 * @returns True if the cache entry has expired.
 */
export function isCacheExpired(
  requestState: RequestState,
  ttl: number = DEFAULT_REQUEST_CACHE_TTL,
): boolean {
  if (requestState.status !== RequestStatus.SUCCESS) {
    return true;
  }
  const now = Date.now();
  return now - requestState.timestamp > ttl;
}

/**
 * Creates an initial loading state for a request.
 *
 * @returns A new RequestState in loading status.
 */
export function createLoadingState(): RequestState {
  const now = Date.now();
  return {
    status: RequestStatus.LOADING,
    data: null,
    error: null,
    timestamp: now,
    lastFetchedAt: now,
  };
}

/**
 * Creates a success state for a request.
 *
 * @param data - The data returned by the request.
 * @param lastFetchedAt - When the fetch started.
 * @returns A new RequestState in success status.
 */
export function createSuccessState(
  data: Json,
  lastFetchedAt: number,
): RequestState {
  return {
    status: RequestStatus.SUCCESS,
    data,
    error: null,
    timestamp: Date.now(),
    lastFetchedAt,
  };
}

/**
 * Creates an error state for a request.
 *
 * @param error - The error message.
 * @param lastFetchedAt - When the fetch started.
 * @returns A new RequestState in error status.
 */
export function createErrorState(
  error: string,
  lastFetchedAt: number,
): RequestState {
  return {
    status: RequestStatus.ERROR,
    data: null,
    error,
    timestamp: Date.now(),
    lastFetchedAt,
  };
}

/**
 * Options for executing a cached request.
 */
export type ExecuteRequestOptions = {
  /** Force a refresh even if cached data exists */
  forceRefresh?: boolean;
  /** Custom TTL for this request in milliseconds */
  ttl?: number;
  /** Resource type to update loading/error states for */
  resourceType?: ResourceType;
  /**
   * When provided, resource-level error is only set/cleared if this returns true.
   * Used to avoid applying stale errors after e.g. region or selection changes.
   */
  isResultCurrent?: () => boolean;
};

/**
 * Represents a pending request with its promise and abort controller.
 */
export type PendingRequest<TResult = unknown> = {
  promise: Promise<TResult>;
  abortController: AbortController;
  /** When set, used to abort other in-flight requests for this resource when a new one starts. */
  resourceType?: ResourceType;
};
