import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type {
  JsonRpcParams,
  Json,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { klona } from 'klona/full';

import { projectLogger, createModuleLogger } from './logging-utils';
import type { JsonRpcRequestToCache, JsonRpcCacheMiddleware } from './types';
import { cacheIdentifierForRequest } from './utils/cache';

type RequestHandlers = (handledRes: PendingJsonRpcResponse) => void;
type InflightRequest = {
  [cacheId: string]: RequestHandlers[];
};

const log = createModuleLogger(projectLogger, 'inflight-cache');

export function createInflightCacheMiddleware(): JsonRpcCacheMiddleware<
  JsonRpcParams,
  Json
> {
  const inflightRequests: InflightRequest = {};

  return createAsyncMiddleware(
    async (req: JsonRpcRequestToCache<JsonRpcParams>, res, next) => {
      // allow cach to be skipped if so specified
      if (req.skipCache) {
        return next();
      }
      // get cacheId, if cacheable
      const cacheId: string | null = cacheIdentifierForRequest(req);
      // if not cacheable, skip
      if (!cacheId) {
        log('Request is not cacheable, proceeding. req = %o', req);
        return next();
      }
      // check for matching requests
      let activeRequestHandlers: RequestHandlers[] = inflightRequests[cacheId];
      // if found, wait for the active request to be handled
      if (activeRequestHandlers) {
        // setup the response listener and wait for it to be called
        // it will handle copying the result and request fields
        log(
          'Running %i handler(s) for request %o',
          activeRequestHandlers.length,
          req,
        );
        await createActiveRequestHandler(res, activeRequestHandlers);
        return undefined;
      }
      // setup response handler array for subsequent requests
      activeRequestHandlers = [];
      inflightRequests[cacheId] = activeRequestHandlers;
      // allow request to be handled normally
      log('Carrying original request forward %o', req);
      await next();

      // clear inflight requests
      delete inflightRequests[cacheId];
      // schedule activeRequestHandlers to be handled
      log(
        'Running %i collected handler(s) for request %o',
        activeRequestHandlers.length,
        req,
      );
      handleActiveRequest(res, activeRequestHandlers);
      // complete
      return undefined;
    },
  );

  async function createActiveRequestHandler(
    res: PendingJsonRpcResponse,
    activeRequestHandlers: RequestHandlers[],
  ): Promise<void> {
    const { resolve, promise } = deferredPromise();
    activeRequestHandlers.push((handledRes: PendingJsonRpcResponse) => {
      // append a copy of the result and error to the response
      res.result = klona(handledRes.result);
      res.error = klona(handledRes.error);
      resolve();
    });
    return promise;
  }

  function handleActiveRequest(
    res: PendingJsonRpcResponse,
    activeRequestHandlers: RequestHandlers[],
  ): void {
    // use setTimeout so we can resolve our original request first
    setTimeout(() => {
      activeRequestHandlers.forEach((handler) => {
        try {
          handler(res);
        } catch (err) {
          // catch error so all requests are handled correctly
          console.error(err);
        }
      });
    });
  }
}

function deferredPromise() {
  let resolve: any;
  const promise: Promise<void> = new Promise((_resolve) => {
    resolve = _resolve;
  });
  return { resolve, promise };
}
