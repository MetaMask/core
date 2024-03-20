import { errorCodes, JsonRpcError, serializeError } from '@metamask/rpc-errors';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import type {
  JsonRpcError as SerializedJsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  Json,
  JsonRpcParams,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import {
  hasProperty,
  isJsonRpcNotification,
  isJsonRpcRequest,
} from '@metamask/utils';

export type JsonRpcEngineCallbackError = Error | SerializedJsonRpcError | null;

export type JsonRpcEngineReturnHandler = (
  done: (error?: unknown) => void,
) => void;

export type JsonRpcEngineNextCallback = (
  returnHandlerCallback?: JsonRpcEngineReturnHandler,
) => void;

export type JsonRpcEngineEndCallback = (error?: unknown) => void;

export type JsonRpcMiddleware<
  Params extends JsonRpcParams,
  Result extends Json,
> = {
  (
    req: JsonRpcRequest<Params>,
    res: PendingJsonRpcResponse<Result>,
    next: JsonRpcEngineNextCallback,
    end: JsonRpcEngineEndCallback,
  ): void;
  destroy?: () => void | Promise<void>;
};

const DESTROYED_ERROR_MESSAGE =
  'This engine is destroyed and can no longer be used.';

export type JsonRpcNotificationHandler<Params extends JsonRpcParams> = (
  notification: JsonRpcNotification<Params>,
) => void | Promise<void>;

type JsonRpcEngineArgs = {
  /**
   * A function for handling JSON-RPC notifications. A JSON-RPC notification is
   * defined as a JSON-RPC request without an `id` property. If this option is
   * _not_ provided, notifications will be treated the same as requests. If this
   * option _is_ provided, notifications will be passed to the handler
   * function without touching the engine's middleware stack.
   *
   * This function should not throw or reject.
   */
  notificationHandler?: JsonRpcNotificationHandler<JsonRpcParams>;
};

/**
 * A JSON-RPC request and response processor.
 * Give it a stack of middleware, pass it requests, and get back responses.
 */
export class JsonRpcEngine extends SafeEventEmitter {
  /**
   * Indicating whether this engine is destroyed or not.
   */
  #isDestroyed = false;

  #middleware: JsonRpcMiddleware<JsonRpcParams, Json>[];

  readonly #notificationHandler?:
    | JsonRpcNotificationHandler<JsonRpcParams>
    | undefined;

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
    this.#middleware = [];
    this.#notificationHandler = notificationHandler;
  }

  /**
   * Throws an error if this engine is destroyed.
   */
  #assertIsNotDestroyed() {
    if (this.#isDestroyed) {
      throw new Error(DESTROYED_ERROR_MESSAGE);
    }
  }

  /**
   * Calls the `destroy()` function of any middleware with that property, clears
   * the middleware array, and marks this engine as destroyed. A destroyed
   * engine cannot be used.
   */
  destroy(): void {
    this.#middleware.forEach(
      (middleware: JsonRpcMiddleware<JsonRpcParams, Json>) => {
        if (
          // `in` walks the prototype chain, which is probably the desired
          // behavior here.
          'destroy' in middleware &&
          typeof middleware.destroy === 'function'
        ) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          middleware.destroy();
        }
      },
    );
    this.#middleware = [];
    this.#isDestroyed = true;
  }

  /**
   * Add a middleware function to the engine's middleware stack.
   *
   * @param middleware - The middleware function to add.
   */
  push<Params extends JsonRpcParams, Result extends Json>(
    middleware: JsonRpcMiddleware<Params, Result>,
  ): void {
    this.#assertIsNotDestroyed();
    this.#middleware.push(middleware as JsonRpcMiddleware<JsonRpcParams, Json>);
  }

  /**
   * Handle a JSON-RPC request, and return a response.
   *
   * @param request - The request to handle.
   * @param callback - An error-first callback that will receive the response.
   */
  handle<Params extends JsonRpcParams, Result extends Json>(
    request: JsonRpcRequest<Params>,
    callback: (error: unknown, response: JsonRpcResponse<Result>) => void,
  ): void;

  /**
   * Handle a JSON-RPC notification.
   *
   * @param notification - The notification to handle.
   * @param callback - An error-first callback that will receive a `void` response.
   */
  handle<Params extends JsonRpcParams>(
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
  handle<Params extends JsonRpcParams, Result extends Json>(
    requests: (JsonRpcRequest<Params> | JsonRpcNotification<Params>)[],
    callback: (error: unknown, responses: JsonRpcResponse<Result>[]) => void,
  ): void;

  /**
   * Handle a JSON-RPC request, and return a response.
   *
   * @param request - The JSON-RPC request to handle.
   * @returns The JSON-RPC response.
   */
  handle<Params extends JsonRpcParams, Result extends Json>(
    request: JsonRpcRequest<Params>,
  ): Promise<JsonRpcResponse<Result>>;

  /**
   * Handle a JSON-RPC notification.
   *
   * @param notification - The notification to handle.
   */
  handle<Params extends JsonRpcParams>(
    notification: JsonRpcNotification<Params>,
  ): Promise<void>;

  /**
   * Handle an array of JSON-RPC requests and/or notifications, and return an
   * array of responses to any included requests.
   *
   * @param request - The JSON-RPC requests to handle.
   * @returns An array of JSON-RPC responses.
   */
  handle<Params extends JsonRpcParams, Result extends Json>(
    requests: (JsonRpcRequest<Params> | JsonRpcNotification<Params>)[],
  ): Promise<JsonRpcResponse<Result>[]>;

  handle(
    req:
      | (JsonRpcRequest | JsonRpcNotification)[]
      | JsonRpcRequest
      | JsonRpcNotification,
    callback?: (error: unknown, response: never) => void,
  ) {
    this.#assertIsNotDestroyed();

    if (callback && typeof callback !== 'function') {
      throw new Error('"callback" must be a function if provided.');
    }

    if (Array.isArray(req)) {
      if (callback) {
        return this.#handleBatch(
          req,
          // This assertion is safe because of the runtime checks validating that `req` is an array and `callback` is defined.
          // There is only one overload signature that satisfies both conditions, and its `callback` type is the one that's being asserted.
          callback as (
            error: unknown,
            responses?: JsonRpcResponse<Json>[],
          ) => void,
        );
      }
      return this.#handleBatch(req);
    }

    if (callback) {
      return this.#handle(
        req,
        callback as (error: unknown, response?: JsonRpcResponse<Json>) => void,
      );
    }
    return this._promiseHandle(req);
  }

  /**
   * Returns this engine as a middleware function that can be pushed to other
   * engines.
   *
   * @returns This engine as a middleware function.
   */
  asMiddleware(): JsonRpcMiddleware<JsonRpcParams, Json> {
    this.#assertIsNotDestroyed();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return async (req, res, next, end) => {
      try {
        const [middlewareError, isComplete, returnHandlers] =
          await JsonRpcEngine.#runAllMiddleware(req, res, this.#middleware);

        if (isComplete) {
          await JsonRpcEngine.#runReturnHandlers(returnHandlers);
          return end(middlewareError);
        }

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        return next(async (handlerCallback) => {
          try {
            await JsonRpcEngine.#runReturnHandlers(returnHandlers);
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
  #handleBatch(
    reqs: (JsonRpcRequest | JsonRpcNotification)[],
  ): Promise<JsonRpcResponse<Json>[]>;

  /**
   * Like _handle, but for batch requests.
   */
  #handleBatch(
    reqs: (JsonRpcRequest | JsonRpcNotification)[],
    callback: (error: unknown, responses?: JsonRpcResponse<Json>[]) => void,
  ): Promise<void>;

  /**
   * Handles a batch of JSON-RPC requests, either in `async` or callback
   * fashion.
   *
   * @param requests - The request objects to process.
   * @param callback - The completion callback.
   * @returns The array of responses, or nothing if a callback was specified.
   */
  async #handleBatch(
    requests: (JsonRpcRequest | JsonRpcNotification)[],
    callback?: (error: unknown, responses?: JsonRpcResponse<Json>[]) => void,
  ): Promise<JsonRpcResponse<Json>[] | void> {
    // The order here is important
    try {
      // If the batch is an empty array, the response array must contain a single object
      if (requests.length === 0) {
        const response: JsonRpcResponse<Json>[] = [
          {
            id: null,
            jsonrpc: '2.0',
            error: new JsonRpcError(
              errorCodes.rpc.invalidRequest,
              'Request batch must contain plain objects. Received an empty array',
            ),
          },
        ];
        if (callback) {
          return callback(null, response);
        }
        return response;
      }

      // 2. Wait for all requests to finish, or throw on some kind of fatal
      // error
      const responses = (
        await Promise.all(
          // 1. Begin executing each request in the order received
          requests.map(this._promiseHandle.bind(this)),
        )
      ).filter(
        // Filter out any notification responses.
        (response): response is JsonRpcResponse<Json> => response !== undefined,
      );

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
   * @param request - The JSON-RPC request.
   * @returns The JSON-RPC response.
   */
  // This function is used in tests, so we cannot easily change it to use the
  // hash syntax.
  // eslint-disable-next-line no-restricted-syntax
  private async _promiseHandle(
    request: JsonRpcRequest | JsonRpcNotification,
  ): Promise<JsonRpcResponse<Json> | void> {
    return new Promise((resolve, reject) => {
      this.#handle(request, (error, res) => {
        // For notifications, the response will be `undefined`, and any caught
        // errors are unexpected and should be surfaced to the caller.
        if (error && res === undefined) {
          reject(error);
        } else {
          // Excepting notifications, there will always be a response, and it will
          // always have any error that is caught and propagated.
          resolve(res);
        }
      }).catch(reject);
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
  async #handle(
    callerReq: JsonRpcRequest | JsonRpcNotification,
    callback: (error: unknown, response?: JsonRpcResponse<Json>) => void,
  ): Promise<void> {
    if (
      !callerReq ||
      Array.isArray(callerReq) ||
      typeof callerReq !== 'object'
    ) {
      const error = new JsonRpcError(
        errorCodes.rpc.invalidRequest,
        `Requests must be plain objects. Received: ${typeof callerReq}`,
        { request: callerReq },
      );
      return callback(error, { id: null, jsonrpc: '2.0', error });
    }

    if (typeof callerReq.method !== 'string') {
      const error = new JsonRpcError(
        errorCodes.rpc.invalidRequest,
        `Must specify a string method. Received: ${typeof callerReq.method}`,
        { request: callerReq },
      );

      if (this.#notificationHandler && !isJsonRpcRequest(callerReq)) {
        // Do not reply to notifications, even if they are malformed.
        return callback(null);
      }

      return callback(error, {
        // Typecast: This could be a notification, but we want to access the
        // `id` even if it doesn't exist.
        id: (callerReq as JsonRpcRequest).id ?? null,
        jsonrpc: '2.0',
        error,
      });
    } else if (
      this.#notificationHandler &&
      isJsonRpcNotification(callerReq) &&
      !isJsonRpcRequest(callerReq)
    ) {
      try {
        await this.#notificationHandler(callerReq);
      } catch (error) {
        return callback(error);
      }
      return callback(null);
    }
    let error = null;

    // Handle requests.
    // Typecast: Permit missing id's for backwards compatibility.
    const req = { ...(callerReq as JsonRpcRequest) };
    const res: PendingJsonRpcResponse<Json> = {
      id: req.id,
      jsonrpc: req.jsonrpc,
    };

    try {
      await JsonRpcEngine.#processRequest(req, res, this.#middleware);
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

    return callback(error, res as JsonRpcResponse<Json>);
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
  static async #processRequest(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
    middlewares: JsonRpcMiddleware<JsonRpcParams, Json>[],
  ): Promise<void> {
    const [error, isComplete, returnHandlers] =
      await JsonRpcEngine.#runAllMiddleware(req, res, middlewares);

    // Throw if "end" was not called, or if the response has neither a result
    // nor an error.
    JsonRpcEngine.#checkForCompletion(req, res, isComplete);

    // The return handlers should run even if an error was encountered during
    // middleware processing.
    await JsonRpcEngine.#runReturnHandlers(returnHandlers);

    // Now we re-throw the middleware processing error, if any, to catch it
    // further up the call chain.
    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
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
  static async #runAllMiddleware(
    req: JsonRpcRequest,
    res: PendingJsonRpcResponse<Json>,
    middlewares: JsonRpcMiddleware<JsonRpcParams, Json>[],
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
      [error, isComplete] = await JsonRpcEngine.#runMiddleware(
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
   * @param request - The request object.
   * @param response - The response object.
   * @param middleware - The middleware function to execute.
   * @param returnHandlers - The return handlers array for the current request.
   * @returns An array of any error encountered during middleware exection,
   * and a boolean indicating whether the request should end.
   */
  static async #runMiddleware(
    request: JsonRpcRequest,
    response: PendingJsonRpcResponse<Json>,
    middleware: JsonRpcMiddleware<JsonRpcParams, Json>,
    returnHandlers: JsonRpcEngineReturnHandler[],
  ): Promise<[unknown, boolean]> {
    return new Promise((resolve) => {
      const end: JsonRpcEngineEndCallback = (error) => {
        const parsedError = error || response.error;
        if (parsedError) {
          response.error = serializeError(parsedError);
        }
        // True indicates that the request should end
        resolve([parsedError, true]);
      };

      const next: JsonRpcEngineNextCallback = (
        returnHandler?: JsonRpcEngineReturnHandler,
      ) => {
        if (response.error) {
          end(response.error);
        } else {
          if (returnHandler) {
            if (typeof returnHandler !== 'function') {
              end(
                new JsonRpcError(
                  errorCodes.rpc.internal,
                  `JsonRpcEngine: "next" return handlers must be functions. ` +
                    `Received "${typeof returnHandler}" for request:\n${jsonify(
                      request,
                    )}`,
                  { request },
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
        middleware(request, response, next, end);
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
  static async #runReturnHandlers(
    handlers: JsonRpcEngineReturnHandler[],
  ): Promise<void> {
    for (const handler of handlers) {
      await new Promise<void>((resolve, reject) => {
        handler((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  /**
   * Throws an error if the response has neither a result nor an error, or if
   * the "isComplete" flag is falsy.
   *
   * @param request - The request object.
   * @param response - The response object.
   * @param isComplete - Boolean from {@link JsonRpcEngine.#runAllMiddleware}
   * indicating whether a middleware ended the request.
   */
  static #checkForCompletion(
    request: JsonRpcRequest,
    response: PendingJsonRpcResponse<Json>,
    isComplete: boolean,
  ): void {
    if (!hasProperty(response, 'result') && !hasProperty(response, 'error')) {
      throw new JsonRpcError(
        errorCodes.rpc.internal,
        `JsonRpcEngine: Response has no error or result for request:\n${jsonify(
          request,
        )}`,
        { request },
      );
    }

    if (!isComplete) {
      throw new JsonRpcError(
        errorCodes.rpc.internal,
        `JsonRpcEngine: Nothing ended request:\n${jsonify(request)}`,
        { request },
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
function jsonify(request: JsonRpcRequest): string {
  return JSON.stringify(request, null, 2);
}
