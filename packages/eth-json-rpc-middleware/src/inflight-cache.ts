import type {
  JsonRpcMiddleware,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';
import {
  type Json,
  type JsonRpcRequest,
  createDeferredPromise,
} from '@metamask/utils';

import { projectLogger, createModuleLogger } from './logging-utils';
import { cacheIdentifierForRequest } from './utils/cache';

type RequestHandler = {
  onSuccess: (result: Json) => void;
  onError: (error: Error) => void;
};
type InflightRequest = {
  [cacheId: string]: RequestHandler[];
};

const log = createModuleLogger(projectLogger, 'inflight-cache');

/**
 * Creates a middleware that caches inflight requests.
 * If a request is already in flight, the middleware will wait for the request to complete
 * and then return the result.
 *
 * @returns A middleware that caches inflight requests.
 */
export function createInflightCacheMiddleware(): JsonRpcMiddleware<
  JsonRpcRequest,
  Json,
  MiddlewareContext<{ skipCache: boolean }>
> {
  const inflightRequests: InflightRequest = {};

  return async ({ request, context, next }) => {
    if (context.get('skipCache')) {
      return next();
    }

    const cacheId: string | null = cacheIdentifierForRequest(request);
    if (!cacheId) {
      log('Request is not cacheable, proceeding. req = %o', request);
      return next();
    }

    // check for matching requests
    let activeRequestHandlers: RequestHandler[] = inflightRequests[cacheId];
    // if found, wait for the active request to be handled
    if (activeRequestHandlers) {
      // setup the response listener and wait for it to be called
      // it will handle copying the result and request fields
      log(
        'Running %i handler(s) for request %o',
        activeRequestHandlers.length,
        request,
      );
      return await createActiveRequestHandler(activeRequestHandlers);
    }

    // setup response handler array for subsequent requests
    activeRequestHandlers = [];
    inflightRequests[cacheId] = activeRequestHandlers;
    // allow request to be handled normally
    log('Carrying original request forward %o', request);
    try {
      const result = (await next()) as Json;
      log(
        'Running %i collected handler(s) for successful request %o',
        activeRequestHandlers.length,
        request,
      );
      handleSuccess(result, activeRequestHandlers);
      return result;
    } catch (error) {
      log(
        'Running %i collected handler(s) for failed request %o',
        activeRequestHandlers.length,
        request,
      );
      handleError(error as Error, activeRequestHandlers);
      throw error;
    } finally {
      delete inflightRequests[cacheId];
    }
  };

  /**
   * Creates a new request handler for the active request.
   *
   * @param activeRequestHandlers - The active request handlers.
   * @returns A promise that resolves to the result of the request.
   */
  function createActiveRequestHandler(
    activeRequestHandlers: RequestHandler[],
  ): Promise<Json> {
    const { resolve, promise, reject } = createDeferredPromise<Json>();
    activeRequestHandlers.push({
      onSuccess: (result: Json) => resolve(result),
      onError: (error: Error) => reject(error),
    });
    return promise;
  }

  /**
   * Handles successful requests.
   *
   * @param result - The result of the request.
   * @param activeRequestHandlers - The active request handlers.
   */
  function handleSuccess(
    result: Json,
    activeRequestHandlers: RequestHandler[],
  ): void {
    // use setTimeout so we can resolve our original request first
    setTimeout(() => {
      activeRequestHandlers.forEach(({ onSuccess }) => {
        onSuccess(result);
      });
    });
  }

  /**
   * Handles failed requests.
   *
   * @param error - The error of the request.
   * @param activeRequestHandlers - The active request handlers.
   */
  function handleError(
    error: Error,
    activeRequestHandlers: RequestHandler[],
  ): void {
    activeRequestHandlers.forEach(({ onError }) => {
      onError(error);
    });
  }
}
