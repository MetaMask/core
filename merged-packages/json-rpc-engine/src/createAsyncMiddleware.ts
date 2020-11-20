import {
  JsonRpcMiddleware,
  JsonRpcRequest,
  JsonRpcResponse,
} from './JsonRpcEngine';

export type AsyncJsonRpcEngineNextCallback = () => Promise<void>;

export type AsyncJsonrpcMiddleware<T, U> = (
  req: JsonRpcRequest<T>,
  res: JsonRpcResponse<U>,
  next: AsyncJsonRpcEngineNextCallback
) => Promise<void>;

type ReturnHandlerCallback = (error: null | Error) => void;

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
 */
export function createAsyncMiddleware<T, U>(
  asyncMiddleware: AsyncJsonrpcMiddleware<T, U>,
): JsonRpcMiddleware<T, U> {
  return async (req, res, next, end) => {
    // nextPromise is the key to the implementation
    // it is resolved by the return handler passed to the
    // "next" function
    let resolveNextPromise: () => void;
    const nextPromise = new Promise((resolve) => {
      resolveNextPromise = resolve;
    });

    let returnHandlerCallback: unknown = null;
    let nextWasCalled = false;

    // This will be called by the consumer's async middleware.
    const asyncNext = async () => {
      nextWasCalled = true;

      // We pass a return handler to next(). When it is called by the engine,
      // the consumer's async middleware will resume executing.
      // eslint-disable-next-line node/callback-return
      next((runReturnHandlersCallback) => {
        // This callback comes from JsonRpcEngine._runReturnHandlers
        returnHandlerCallback = runReturnHandlersCallback;
        resolveNextPromise();
      });
      await nextPromise;
    };

    try {
      await asyncMiddleware(req, res, asyncNext);

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
