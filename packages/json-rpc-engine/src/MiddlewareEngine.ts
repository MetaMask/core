import type {
  Json,
  JsonRpcRequest,
  JsonRpcNotification,
  NonEmptyArray,
} from '@metamask/utils';
import { freeze } from 'immer';
import cloneDeep from 'lodash/clonedeep';

import { isRequest, stringify } from './utils';
import type { JsonRpcCall } from './utils';

export const EndNotification = Symbol.for('MiddlewareEngine:EndNotification');

type Context = Record<string, unknown>;

type ReturnHandler<Result extends Json = Json> = (
  result: Readonly<Result>,
) => void | Result | Promise<void | Result>;

type MiddlewareResultConstraint<Message extends JsonRpcCall> =
  Message extends JsonRpcNotification
    ? Message extends JsonRpcRequest
      ? void | Json | ReturnHandler
      : void | typeof EndNotification
    : void | Json | ReturnHandler;

type HandledResult<Result extends MiddlewareResultConstraint<JsonRpcCall>> =
  Exclude<Result, typeof EndNotification> | void;

export type JsonRpcMiddleware<
  Message extends JsonRpcCall,
  Result extends MiddlewareResultConstraint<Message>,
> = (message: Readonly<Message>, context: Context) => Result | Promise<Result>;

type Options<
  Message extends JsonRpcCall,
  Result extends MiddlewareResultConstraint<Message>,
> = {
  middleware: NonEmptyArray<JsonRpcMiddleware<Message, Result>>;
};

export class MiddlewareEngine<
  Message extends JsonRpcCall,
  Result extends MiddlewareResultConstraint<Message>,
> {
  static readonly EndNotification = EndNotification;

  readonly #middleware: readonly JsonRpcMiddleware<Message, Result>[];

  constructor({ middleware }: Options<Message, Result>) {
    this.#middleware = [...middleware];
  }

  /**
   * Handle a JSON-RPC request. A response will be returned.
   *
   * @param request - The JSON-RPC request to handle.
   * @returns The JSON-RPC response.
   */
  async handle(
    request: Message & JsonRpcRequest,
  ): Promise<Exclude<HandledResult<Result>, void>>;

  /**
   * Handle a JSON-RPC notification. No response will be returned.
   *
   * @param message - The JSON-RPC notification to handle.
   */
  async handle(message: Message & JsonRpcNotification): Promise<void>;

  async handle(req: Message): Promise<HandledResult<Result>> {
    const result = await this.#handle(req);
    return result === EndNotification
      ? undefined
      : (result as HandledResult<Result>);
  }

  // This exists because a JsonRpcCall overload of handle() cannot coexist with
  // the other overloads due to type union / overload shenanigans.
  /**
   * Handle a JSON-RPC call. A response will be returned if the call is a request.
   *
   * @param message - The JSON-RPC call to handle.
   * @returns The JSON-RPC response, if any.
   */
  async handleAny(message: Message): Promise<Extract<Result, Json> | void> {
    return this.handle(message);
  }

  async #handle(message: Message, context: Context = {}): Promise<Result> {
    const immutableMessage = freeze(cloneDeep(message), true);

    const { result, returnHandlers } = await this.#runMiddleware(
      immutableMessage,
      context,
    );

    return await this.#runReturnHandlers(message, result, returnHandlers);
  }

  async #runMiddleware(
    message: Readonly<Message>,
    context: Context,
  ): Promise<{
    result: Extract<Result, Json | typeof EndNotification>;
    returnHandlers: ReturnHandler[];
  }> {
    const returnHandlers: ReturnHandler[] = [];

    let result: Extract<Result, Json | typeof EndNotification> | undefined;
    for (const middleware of this.#middleware) {
      const currentResult = await middleware(message, context);

      if (typeof currentResult === 'function') {
        returnHandlers.push(currentResult);
      } else if (currentResult !== undefined) {
        // Cast required due to incorrect type narrowing
        result = currentResult as Extract<
          Result,
          Json | typeof EndNotification
        >;
        break;
      }
    }

    if (result === undefined) {
      throw new Error(`Nothing ended call:\n${stringify(message)}`);
    } else if (isRequest(message)) {
      if (result === EndNotification) {
        throw new Error(
          `Request handled as notification:\n${stringify(message)}`,
        );
      }
    } else if (result !== EndNotification) {
      throw new Error(
        `Notification handled as request:\n${stringify(message)}`,
      );
    }

    return {
      result: result as Extract<Result, Json | typeof EndNotification>,
      returnHandlers,
    };
  }

  async #runReturnHandlers(
    message: Readonly<Message>,
    initialResult: Extract<Result, Json | typeof EndNotification>,
    returnHandlers: ReturnHandler[],
  ): Promise<Readonly<Result>> {
    freeze(initialResult, true);

    if (returnHandlers.length === 0) {
      return initialResult;
    }

    if (initialResult === EndNotification) {
      throw new Error(
        `Received return handlers for notification:\n${stringify(message)}`,
      );
    }

    let finalResult: Json = initialResult;
    for (const returnHandler of returnHandlers) {
      const updatedResult = await returnHandler(finalResult);
      if (updatedResult !== undefined) {
        finalResult = freeze(updatedResult, true);
      }
    }

    return finalResult as Extract<Result, Json>;
  }

  /**
   * Convert the engine into a JSON-RPC middleware.
   *
   * @returns The JSON-RPC middleware.
   */
  asMiddleware(): JsonRpcMiddleware<Message, Result> {
    return async (req, context) => this.#handle(req, context);
  }
}

// type Bar = JsonRpcMiddleware<JsonRpcNotification<[]>, typeof EndNotification>;

// const bar: Bar = (req, context) => {
//   return EndNotification;
// };

// export type JsonRpcMiddleware<
//   Message extends JsonRpcCall<JsonRpcParams>,
//   Result extends Json,
// > = (message: Readonly<Message>, context: Context) =>
//   // | Promise<Result | void> | Result | void;
//   | void
//   | Promise<void>
//   | (Message extends JsonRpcNotification<JsonRpcParams>
//       ? typeof EndNotification | Promise<typeof EndNotification>
//       : Result | ReturnHandler<Result> | Promise<Result | ReturnHandler<Result>>);

// type RequestMiddleware<Request extends JsonRpcRequest<JsonRpcParams>, Result extends Json> = (
//   req: Readonly<Request>,
//   context: Context,
// ) => void | Promise<void> | Result | Promise<Result>;

// type NotificationMiddleware<Notification extends JsonRpcNotification<JsonRpcParams>> = (
//   req: Readonly<Notification>,
//   context: Context,
// ) =>
//   | void
//   | Promise<void>
//   | typeof EndNotification
//   | Promise<typeof EndNotification>;

// type CallMiddleware<Message extends JsonRpcCall<JsonRpcParams>, Result extends Json> = (
//   req: Readonly<Message>,
//   context: Context,
// ) =>
//   | void
//   | Promise<void>
//   | (Message extends JsonRpcNotification<JsonRpcParams>
//       ? typeof EndNotification | Promise<typeof EndNotification>
//       : Result | Promise<Result>);

// export type JsonRpcMiddleware<
//   Message extends JsonRpcCall<JsonRpcParams>,
//   Result extends Json,
// > = RequestMiddleware<Message, Result> | NotificationMiddleware<Message> | CallMiddleware<Message, Result>;
