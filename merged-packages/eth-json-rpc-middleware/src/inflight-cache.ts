import clone from 'clone';
import { createAsyncMiddleware, PendingJsonRpcResponse } from 'json-rpc-engine';
import { projectLogger, createModuleLogger } from './logging-utils';
import { cacheIdentifierForPayload } from './utils/cache';
import type {
  Block,
  JsonRpcRequestToCache,
  JsonRpcCacheMiddleware,
} from './types';

type RequestHandlers = (handledRes: PendingJsonRpcResponse<Block>) => void;
interface InflightRequest {
  [cacheId: string]: RequestHandlers[];
}

const log = createModuleLogger(projectLogger, 'inflight-cache');

export function createInflightCacheMiddleware(): JsonRpcCacheMiddleware<
  string[],
  Block
> {
  const inflightRequests: InflightRequest = {};

  return createAsyncMiddleware(
    async (req: JsonRpcRequestToCache<string[]>, res, next) => {
      // allow cach to be skipped if so specified
      if (req.skipCache) {
        return next();
      }
      // get cacheId, if cacheable
      const cacheId: string | null = cacheIdentifierForPayload(req);
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
      // eslint-disable-next-line node/callback-return
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

  function createActiveRequestHandler(
    res: PendingJsonRpcResponse<Block>,
    activeRequestHandlers: RequestHandlers[],
  ): Promise<void> {
    const { resolve, promise } = deferredPromise();
    activeRequestHandlers.push((handledRes: PendingJsonRpcResponse<Block>) => {
      // append a copy of the result and error to the response
      res.result = clone(handledRes.result);
      res.error = clone(handledRes.error);
      resolve();
    });
    return promise;
  }

  function handleActiveRequest(
    res: PendingJsonRpcResponse<Block>,
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
