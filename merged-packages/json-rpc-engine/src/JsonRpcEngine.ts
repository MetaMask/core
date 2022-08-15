import SafeEventEmitter from '@metamask/safe-event-emitter';
import {
  hasProperty,
  JsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  isJsonRpcRequest,
} from '@metamask/utils';
import { errorCodes, EthereumRpcError, serializeError } from 'eth-rpc-errors';

export type PendingJsonRpcResponse<Result> = Omit<
  JsonRpcResponse<Result>,
  'error' | 'result'
> & {
  result?: Result;
  error?: JsonRpcError;
};

export type JsonRpcEngineCallbackError = Error | JsonRpcError | null;

export type JsonRpcEngineReturnHandler = (
  done: (error?: JsonRpcEngineCallbackError) => void,
) => void;

export type JsonRpcEngineNextCallback = (
  returnHandlerCallback?: JsonRpcEngineReturnHandler,
) => void;

export type JsonRpcEngineEndCallback = (
  error?: JsonRpcEngineCallbackError,
) => void;

export interface JsonRpcMiddleware<Params, Result> {
  (
    req: JsonRpcRequest<Params>,
    res: PendingJsonRpcResponse<Result>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): void;
  destroy?: () => void | Promise<void>;
}

const DESTROYED_ERROR_MESSAGE =
  'This engine is destroyed and can no longer be used.';

export type JsonRpcNotificationHandler<Params> = (
  notification: JsonRpcNotification<Params>,
) => void | Promise<void>;

interface JsonRpcEngineArgs {
  /**
   * A function for handling JSON-RPC notifications. A JSON-RPC notification is
   * defined as a JSON-RPC request without an `id` property. If this option is
   * _not_ provided, notifications will be treated the same as requests. If this
   * option _is_ provided, notifications will be passed to the handler
   * function without touching the engine's middleware stack.
   *
   * This function should not throw or reject.
   */
  notificationHandler?: JsonRpcNotificationHandler<unknown>;
}

/**
 * A JSON-RPC request and response processor.
 * Give it a stack of middleware, pass it requests, and get back responses.
 */
export class JsonRpcEngine extends SafeEventEmitter {
  /**
   * Indicating whether this engine is destroyed or not.
   */
  private _isDestroyed = false;

  private _middleware: JsonRpcMiddleware<unknown, unknown>[];

  private readonly _notificationHandler?: JsonRpcNotificationHandler<unknown>;

  /**
   * Constructs a {@link JsonRpcEngine} instance.
   *
   * @param options - Options bag.
   * @param options.notificationHandler - A function for handling JSON-RPC
   * notifications. A JSON-RPC notification is defined as a JSON-RPC request
   * without an `id` property. If this option is _not_ provided, notifications
   * will be treated the same as requests. If this option _is_ provided,
   * notifications will be passed to the handler function without touching
   * the engine's middleware stack. This function should not throw or reject.
   */
  constructor({ notificationHandler }: JsonRpcEngineArgs = {}) {
    super();
    this._middleware = [];
    this._notificationHandler = notificationHandler;
  }

  /**
   * Throws an error if this engine is destroyed.
   */
  private _assertIsNotDestroyed() {
    if (this._isDestroyed) {
      throw new Error(DESTROYED_ERROR_MESSAGE);
    }
  }

  /**
   * Calls the `destroy()` function of any middleware with that property, clears
   * the middleware array, and marks this engine as destroyed. A destroyed
   * engine cannot be used.
   */
  destroy(): void {
    this._middleware.forEach(
      (middleware: JsonRpcMiddleware<unknown, unknown>) => {
        if (
          // `in` walks the prototype chain, which is probably the desired
          // behavior here.
          'destroy' in middleware &&
          typeof middleware.destroy === 'function'
        ) {
          middleware.destroy();
        }
      },
    );
    this._middleware = [];
    this._isDestroyed = true;
  }

  /**
   * Add a middleware function to the engine's middleware stack.
   *
   * @param middleware - The middleware function to add.
   */
  push<Params, Result>(middleware: JsonRpcMiddleware<Params, Result>): void {
    this._assertIsNotDestroyed();
    this._middleware.push(middleware as JsonRpcMiddleware<unknown, unknown>);
  }

  /**
   * Handle a JSON-RPC request, and return a response.
   *
   * @param request - The request to handle.
   * @param callback - An error-first callback that will receive the response.
   */
  handle<Params, Result>(
    request: JsonRpcRequest<Params>,
    callback: (error: unknown, response: JsonRpcResponse<Result>) => void,
  ): void;

  /**
   * Handle a JSON-RPC notification.
   *
   * @param notification - The notification to handle.
   * @param callback - An error-first callback that will receive a `void` response.
   */
  handle<Params>(
    notification: JsonRpcNotification<Params>,
    callback: (error: unknown, response: void) => void,
  ): void;

  /**
   * Handle an array of JSON-RPC requests and/or notifications, and return an
   * array of responses to any included requests.
   *
   * @param request - The requests to handle.
   * @param callback - An error-first callback that will receive the array of
   * responses.
   */
  handle<Params, Result>(
    requests: (JsonRpcRequest<Params> | JsonRpcNotification<Params>)[],
    callback: (error: unknown, responses: JsonRpcResponse<Result>[]) => void,
  ): void;

  /**
   * Handle a JSON-RPC request, and return a response.
   *
   * @param request - The JSON-RPC request to handle.
   * @returns The JSON-RPC response.
   */
  handle<Params, Result>(
    request: JsonRpcRequest<Params>,
  ): Promise<JsonRpcResponse<Result>>;

  /**
   * Handle a JSON-RPC notification.
   *
   * @param notification - The notification to handle.
   */
  handle<Params>(notification: JsonRpcNotification<Params>): Promise<void>;

  /**
   * Handle an array of JSON-RPC requests and/or notifications, and return an
   * array of responses to any included requests.
   *
   * @param request - The JSON-RPC requests to handle.
   * @returns An array of JSON-RPC responses.
   */
  handle<Params, Result>(
    requests: (JsonRpcRequest<Params> | JsonRpcNotification<Params>)[],
  ): Promise<JsonRpcResponse<Result>[]>;

  handle(req: unknown, callback?: any) {
    this._assertIsNotDestroyed();

    if (callback && typeof callback !== 'function') {
      throw new Error('"callback" must be a function if provided.');
    }

    if (Array.isArray(req)) {
      if (callback) {
        return this._handleBatch(req, callback);
      }
      return this._handleBatch(req);
    }

    if (callback) {
      return this._handle(req as JsonRpcRequest<unknown>, callback);
    }
    return this._promiseHandle(req as JsonRpcRequest<unknown>);
  }

  /**
   * Returns this engine as a middleware function that can be pushed to other
   * engines.
   *
   * @returns This engine as a middleware function.
   */
  asMiddleware(): JsonRpcMiddleware<unknown, unknown> {
    this._assertIsNotDestroyed();
    return async (req, res, next, end) => {
      try {
        const [middlewareError, isComplete, returnHandlers] =
          await JsonRpcEngine._runAllMiddleware(req, res, this._middleware);

        if (isComplete) {
          await JsonRpcEngine._runReturnHandlers(returnHandlers);
          return end(middlewareError as JsonRpcEngineCallbackError);
        }

        return next(async (handlerCallback) => {
          try {
            await JsonRpcEngine._runReturnHandlers(returnHandlers);
          } catch (error) {
            return handlerCallback(error);
          }
          return handlerCallback();
        });
      } catch (error) {
        return end(error);
      }
    };
  }

  /**
   * Like _handle, but for batch requests.
   */
  private _handleBatch(
    reqs: (JsonRpcRequest<unknown> | JsonRpcNotification<unknown>)[],
  ): Promise<JsonRpcResponse<unknown>[]>;

  /**
   * Like _handle, but for batch requests.
   */
  private _handleBatch(
    reqs: (JsonRpcRequest<unknown> | JsonRpcNotification<unknown>)[],
    callback: (error: unknown, responses?: JsonRpcResponse<unknown>[]) => void,
  ): Promise<void>;

  /**
   * Handles a batch of JSON-RPC requests, either in `async` or callback
   * fashion.
   *
   * @param reqs - The request objects to process.
   * @param callback - The completion callback.
   * @returns The array of responses, or nothing if a callback was specified.
   */
  private async _handleBatch(
    reqs: (JsonRpcRequest<unknown> | JsonRpcNotification<unknown>)[],
    callback?: (error: unknown, responses?: JsonRpcResponse<unknown>[]) => void,
  ): Promise<JsonRpcResponse<unknown>[] | void> {
    // The order here is important
    try {
      // 2. Wait for all requests to finish, or throw on some kind of fatal
      // error
      const responses = (
        await Promise.all(
          // 1. Begin executing each request in the order received
          reqs.map(this._promiseHandle.bind(this)),
        )
      ).filter(
        // Filter out any notification responses.
        (response) => response !== undefined,
      ) as JsonRpcResponse<unknown>[];

      // 3. Return batch response
      if (callback) {
        return callback(null, responses);
      }
      return responses;
    } catch (error) {
      if (callback) {
        return callback(error);
      }

      throw error;
    }
  }

  /**
   * A promise-wrapped _handle.
   *
   * @param req - The JSON-RPC request.
   * @returns The JSON-RPC response.
   */
  private _promiseHandle(
    req: JsonRpcRequest<unknown> | JsonRpcNotification<unknown>,
  ): Promise<JsonRpcResponse<unknown> | void> {
    return new Promise((resolve, reject) => {
      this._handle(req, (error, res) => {
        // For notifications, the response will be `undefined`, and any caught
        // errors are unexpected and should be surfaced to the caller.
        if (error && res === undefined) {
          reject(error);
        }

        // Excepting notifications, there will always be a response, and it will
        // always have any error that is caught and propagated.
        resolve(res);
      });
    });
  }

  /**
   * Ensures that the request / notification object is valid, processes it, and
   * passes any error and response object to the given callback.
   *
   * Does not reject.
   *
   * @param callerReq - The request object from the caller.
   * @param callback - The callback function.
   * @returns Nothing.
   */
  private async _handle(
    callerReq: JsonRpcRequest<unknown> | JsonRpcNotification<unknown>,
    callback: (error?: unknown, response?: JsonRpcResponse<unknown>) => void,
  ): Promise<void> {
    if (
      !callerReq ||
      Array.isArray(callerReq) ||
      typeof callerReq !== 'object'
    ) {
      const error = new EthereumRpcError(
        errorCodes.rpc.invalidRequest,
        `Requests must be plain objects. Received: ${typeof callerReq}`,
        { request: callerReq },
      );
      return callback(error, { id: null, jsonrpc: '2.0', error });
    }

    if (typeof callerReq.method !== 'string') {
      const error = new EthereumRpcError(
        errorCodes.rpc.invalidRequest,
        `Must specify a string method. Received: ${typeof callerReq.method}`,
        { request: callerReq },
      );

      if (this._notificationHandler && !isJsonRpcRequest(callerReq)) {
        // Do not reply to notifications, even if they are malformed.
        return callback(null);
      }

      return callback(error, {
        // Typecast: This could be a notification, but we want to access the
        // `id` even if it doesn't exist.
        id: (callerReq as JsonRpcRequest<unknown>).id ?? null,
        jsonrpc: '2.0',
        error,
      });
    }

    // Handle notifications.
    // We can't use isJsonRpcNotification here because that narrows callerReq to
    // "never" after the if clause for unknown reasons.
    if (this._notificationHandler && !isJsonRpcRequest(callerReq)) {
      try {
        await this._notificationHandler(callerReq);
      } catch (error) {
        return callback(error);
      }
      return callback(null);
    }

    let error: JsonRpcEngineCallbackError = null;

    // Handle requests.
    // Typecast: Permit missing id's for backwards compatibility.
    const req = { ...(callerReq as JsonRpcRequest<unknown>) };
    const res: PendingJsonRpcResponse<unknown> = {
      id: req.id,
      jsonrpc: req.jsonrpc,
    };

    try {
      await JsonRpcEngine._processRequest(req, res, this._middleware);
    } catch (_error) {
      // A request handler error, a re-thrown middleware error, or something
      // unexpected.
      error = _error;
    }

    if (error) {
      // Ensure no result is present on an errored response
      delete res.result;
      if (!res.error) {
        res.error = serializeError(error);
      }
    }

    return callback(error, res as JsonRpcResponse<unknown>);
  }

  /**
   * For the given request and response, runs all middleware and their return
   * handlers, if any, and ensures that internal request processing semantics
   * are satisfied.
   *
   * @param req - The request object.
   * @param res - The response object.
   * @param middlewares - The stack of middleware functions.
   */
  private static async _processRequest(
    req: JsonRpcRequest<unknown>,
    res: PendingJsonRpcResponse<unknown>,
    middlewares: JsonRpcMiddleware<unknown, unknown>[],
  ): Promise<void> {
    const [error, isComplete, returnHandlers] =
      await JsonRpcEngine._runAllMiddleware(req, res, middlewares);

    // Throw if "end" was not called, or if the response has neither a result
    // nor an error.
    JsonRpcEngine._checkForCompletion(req, res, isComplete);

    // The return handlers should run even if an error was encountered during
    // middleware processing.
    await JsonRpcEngine._runReturnHandlers(returnHandlers);

    // Now we re-throw the middleware processing error, if any, to catch it
    // further up the call chain.
    if (error) {
      throw error;
    }
  }

  /**
   * Serially executes the given stack of middleware.
   *
   * @param req - The request object.
   * @param res - The response object.
   * @param middlewares - The stack of middleware functions to execute.
   * @returns An array of any error encountered during middleware execution,
   * a boolean indicating whether the request was completed, and an array of
   * middleware-defined return handlers.
   */
  private static async _runAllMiddleware(
    req: JsonRpcRequest<unknown>,
    res: PendingJsonRpcResponse<unknown>,
    middlewares: JsonRpcMiddleware<unknown, unknown>[],
  ): Promise<
    [
      unknown, // error
      boolean, // isComplete
      JsonRpcEngineReturnHandler[],
    ]
  > {
    const returnHandlers: JsonRpcEngineReturnHandler[] = [];
    let error = null;
    let isComplete = false;

    // Go down stack of middleware, call and collect optional returnHandlers
    for (const middleware of middlewares) {
      [error, isComplete] = await JsonRpcEngine._runMiddleware(
        req,
        res,
        middleware,
        returnHandlers,
      );

      if (isComplete) {
        break;
      }
    }
    return [error, isComplete, returnHandlers.reverse()];
  }

  /**
   * Runs an individual middleware function.
   *
   * @param req - The request object.
   * @param res - The response object.
   * @param middleware - The middleware function to execute.
   * @param returnHandlers - The return handlers array for the current request.
   * @returns An array of any error encountered during middleware exection,
   * and a boolean indicating whether the request should end.
   */
  private static _runMiddleware(
    req: JsonRpcRequest<unknown>,
    res: PendingJsonRpcResponse<unknown>,
    middleware: JsonRpcMiddleware<unknown, unknown>,
    returnHandlers: JsonRpcEngineReturnHandler[],
  ): Promise<[unknown, boolean]> {
    return new Promise((resolve) => {
      const end: JsonRpcEngineEndCallback = (err?: unknown) => {
        const error = err || res.error;
        if (error) {
          res.error = serializeError(error);
        }
        // True indicates that the request should end
        resolve([error, true]);
      };

      const next: JsonRpcEngineNextCallback = (
        returnHandler?: JsonRpcEngineReturnHandler,
      ) => {
        if (res.error) {
          end(res.error);
        } else {
          if (returnHandler) {
            if (typeof returnHandler !== 'function') {
              end(
                new EthereumRpcError(
                  errorCodes.rpc.internal,
                  `JsonRpcEngine: "next" return handlers must be functions. ` +
                    `Received "${typeof returnHandler}" for request:\n${jsonify(
                      req,
                    )}`,
                  { request: req },
                ),
              );
            }
            returnHandlers.push(returnHandler);
          }

          // False indicates that the request should not end
          resolve([null, false]);
        }
      };

      try {
        middleware(req, res, next, end);
      } catch (error) {
        end(error);
      }
    });
  }

  /**
   * Serially executes array of return handlers. The request and response are
   * assumed to be in their scope.
   *
   * @param handlers - The return handlers to execute.
   */
  private static async _runReturnHandlers(
    handlers: JsonRpcEngineReturnHandler[],
  ): Promise<void> {
    for (const handler of handlers) {
      await new Promise<void>((resolve, reject) => {
        handler((err) => (err ? reject(err) : resolve()));
      });
    }
  }

  /**
   * Throws an error if the response has neither a result nor an error, or if
   * the "isComplete" flag is falsy.
   *
   * @param req - The request object.
   * @param res - The response object.
   * @param isComplete - Boolean from {@link JsonRpcEngine._runAllMiddleware}
   * indicating whether a middleware ended the request.
   */
  private static _checkForCompletion(
    req: JsonRpcRequest<unknown>,
    res: PendingJsonRpcResponse<unknown>,
    isComplete: boolean,
  ): void {
    if (!hasProperty(res, 'result') && !hasProperty(res, 'error')) {
      throw new EthereumRpcError(
        errorCodes.rpc.internal,
        `JsonRpcEngine: Response has no error or result for request:\n${jsonify(
          req,
        )}`,
        { request: req },
      );
    }

    if (!isComplete) {
      throw new EthereumRpcError(
        errorCodes.rpc.internal,
        `JsonRpcEngine: Nothing ended request:\n${jsonify(req)}`,
        { request: req },
      );
    }
  }
}

/**
 * JSON-stringifies a request object.
 *
 * @param request - The request object to JSON-stringify.
 * @returns The JSON-stringified request object.
 */
function jsonify(request: JsonRpcRequest<unknown>): string {
  return JSON.stringify(request, null, 2);
}
