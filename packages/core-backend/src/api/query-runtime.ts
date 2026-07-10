/**
 * Runtime contract between the generated TanStack query-core bindings (see
 * `src/generated/<api>/queries`) and the hand-written API clients.
 *
 * The generated query options factories perform their requests through an
 * {@link ApiRequestClient}, so any transport (the `BaseApiClient`, a plain
 * `fetch` wrapper, a test double, ...) can back them.
 */

import type { QueryClient } from '@tanstack/query-core';

export { getQueryOptionsOverrides } from './shared-types';
export type { FetchOptions } from './shared-types';

/**
 * A single HTTP request issued by a generated query.
 */
export type ApiRequestArgs = {
  /** HTTP method of the request. */
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  /** Path of the endpoint, relative to the API base URL. */
  url: string;
  /** Query parameters to append to the URL. */
  params?: Record<
    string,
    string | string[] | number | number[] | boolean | undefined
  >;
  /** Abort signal forwarded from TanStack Query. */
  signal?: AbortSignal;
};

/**
 * The client that generated queries perform their requests through.
 */
export type ApiRequestClient = {
  /** The TanStack QueryClient used for caching and request deduplication. */
  queryClient: QueryClient;
  /**
   * Perform an HTTP request against the API.
   *
   * @param args - The request to perform.
   * @returns The parsed JSON response.
   */
  request<ResponseType>(args: ApiRequestArgs): Promise<ResponseType>;
};
