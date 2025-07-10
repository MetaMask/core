import type {
  Json,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcParams,
  NonEmptyArray,
} from '@metamask/utils';
import { freeze } from 'immer';
import cloneDeep from 'lodash/clonedeep';

import { stringify } from './utils';
import type { JsonRpcCall } from './utils';

export const EndNotification = Symbol.for('MiddlewareEngine:EndNotification');

type Context = Record<string, unknown>;

type ReturnHandler<
  Result extends MiddlewareResultConstraint<JsonRpcCall<JsonRpcParams>>,
> = (result: Readonly<Result>) => Result | Promise<Result>;

type MiddlewareResultConstraint<Message extends JsonRpcCall<JsonRpcParams>> =
  Message extends JsonRpcNotification
    ? void | typeof EndNotification
    : void | Json | ReturnHandler<MiddlewareResultConstraint<Message>>;

export type JsonRpcMiddleware<
  Message extends JsonRpcCall<JsonRpcParams>,
  Result extends MiddlewareResultConstraint<Message>,
> = (message: Readonly<Message>, context: Context) => Result | Promise<Result>;

type Options<
  Message extends JsonRpcCall<JsonRpcParams>,
  Result extends MiddlewareResultConstraint<Message>,
> = {
  middleware: NonEmptyArray<JsonRpcMiddleware<Message, Result>>;
};

export class MiddlewareEngine<
  Message extends JsonRpcCall<JsonRpcParams>,
  Result extends MiddlewareResultConstraint<Message>,
> {
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
  async handle(request: JsonRpcRequest & Message): Promise<Result>;

  /**
   * Handle a JSON-RPC notification. No response will be returned.
   *
   * @param message - The JSON-RPC notification to handle.
   */
  async handle(message: JsonRpcNotification & Message): Promise<void>;

  async handle(req: Message): Promise<Result | void> {
    const result = await this.#handle(req);
    return result === EndNotification ? undefined : result;
  }

  async #handle(message: Message, context: Context = {}): Promise<Result> {
    const immutableMessage = freeze(cloneDeep(message), true);
    const returnHandlers: ReturnHandler<Result>[] = [];

    let result: Result | undefined;
    for (const middleware of this.#middleware) {
      const currentResult = await middleware(immutableMessage, context);

      if (typeof currentResult === 'function') {
        returnHandlers.push(currentResult);
      } else if (currentResult !== undefined) {
        result = currentResult;
        break;
      }
    }

    if (result === undefined) {
      throw new Error(`Nothing ended request:\n${stringify(message)}`);
    }

    if (returnHandlers.length > 0) {
      if (result === EndNotification) {
        throw new Error(
          `Received return handlers for notification:\n${stringify(message)}`,
        );
      }

      result = freeze(result, true);
      for (const returnHandler of returnHandlers) {
        const updatedResult = await returnHandler(result);
        if (updatedResult !== undefined) {
          result = freeze(updatedResult, true);
        }
      }
    }

    return result;
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
