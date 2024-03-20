import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import type {
  JsonRpcEngineReturnHandler,
  JsonRpcMiddleware,
} from './JsonRpcEngine';

export type AsyncJsonRpcEngineNextCallback = () => Promise<void>;

export type AsyncJsonrpcMiddleware<
  Params extends JsonRpcParams,
  Result extends Json,
> = (
  request: JsonRpcRequest<Params>,
  response: PendingJsonRpcResponse<Result>,
  next: AsyncJsonRpcEngineNextCallback,
) => Promise<void>;

type ReturnHandlerCallback = Parameters<JsonRpcEngineReturnHandler>[0];

/**
 * JsonRpcEngine only accepts callback-based middleware directly.
 * createAsyncMiddleware exists to enable consumers to pass in async middleware
 * functions.
 *
 * Async middleware have no "end" function. Instead, they "end" if they return
 * without calling "next". Rather than passing in explicit return handlers,
 * async middleware can simply await "next", and perform operations on the
 * response object when execution resumes.
 *
 * To accomplish this, createAsyncMiddleware passes the async middleware a
 * wrapped "next" function. That function calls the internal JsonRpcEngine
 * "next" function with a return handler that resolves a promise when called.
 *
 * The return handler will always be called. Its resolution of the promise
 * enables the control flow described above.
 *
 * @param asyncMiddleware - The asynchronous middleware function to wrap.
 * @returns The wrapped asynchronous middleware function, ready to be consumed
 * by JsonRpcEngine.
 */
export function createAsyncMiddleware<
  Params extends JsonRpcParams,
  Result extends Json,
>(
  asyncMiddleware: AsyncJsonrpcMiddleware<Params, Result>,
): JsonRpcMiddleware<Params, Result> {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  return async (request, response, next, end) => {
    // nextPromise is the key to the implementation
    // it is resolved by the return handler passed to the
    // "next" function
    let resolveNextPromise: () => void;
    const nextPromise = new Promise<void>((resolve) => {
      resolveNextPromise = resolve;
    });

    let returnHandlerCallback: unknown = null;
    let nextWasCalled = false;

    // This will be called by the consumer's async middleware.
    const asyncNext = async () => {
      nextWasCalled = true;

      // We pass a return handler to next(). When it is called by the engine,
      // the consumer's async middleware will resume executing.
      next((runReturnHandlersCallback) => {
        // This callback comes from JsonRpcEngine._runReturnHandlers
        returnHandlerCallback = runReturnHandlersCallback;
        resolveNextPromise();
      });
      return nextPromise;
    };

    try {
      await asyncMiddleware(request, response, asyncNext);

      if (nextWasCalled) {
        await nextPromise; // we must wait until the return handler is called
        (returnHandlerCallback as ReturnHandlerCallback)(null);
      } else {
        end(null);
      }
    } catch (error) {
      if (returnHandlerCallback) {
        (returnHandlerCallback as ReturnHandlerCallback)(error);
      } else {
        end(error);
      }
    }
  };
}
