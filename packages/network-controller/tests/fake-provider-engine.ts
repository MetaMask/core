import { inspect, isDeepStrictEqual } from 'util';
import EventEmitter from 'events';
import type {
  ProviderEngine,
  RpcPayload,
  RpcResponse,
} from 'web3-provider-engine';

// Store this in case it gets stubbed later
const originalSetTimeout = global.setTimeout;

/**
 * The payload that `sendAsync` takes.
 */
type SendAsyncPayload<P> = RpcPayload<P> | RpcPayload<P>[];

/**
 * An object that allows specifying the behavior of a specific invocation of
 * `sendAsync`. The `method` always identifies the stub, but the behavior
 * may be specified multiple ways: `sendAsync` can either return a promise or
 * throw an error, and if it returns a promise, that promise can either be
 * resolved with a response object or reject with an error.
 *
 * @property request - Looks for a request matching these specifications.
 * @property request.method - The RPC method to which this stub will be matched.
 * @property request.params - The params to which this stub will be matched.
 * @property response - Instructs `sendAsync` to return a promise that resolves
 * with a response object.
 * @property response.result - Specifies a successful response, with this as the
 * `result`.
 * @property response.error - Specifies an error response, with this as the
 * `error`.
 * @property error - Instructs `sendAsync` to return a promise that rejects with
 * this error.
 * @property implementation - Allows overriding `sendAsync` entirely. Useful if
 * you want it to throw an error.
 * @property delay - The amount of time that will pass after the callback is
 * called with the response.
 * @property discardAfterMatching - Usually after the stub matches a request, it
 * is discarded, but setting this to true prevents that from happening. True by
 * default.
 */
export type FakeProviderStub = {
  request: {
    method: string;
    params?: (string | boolean)[];
  };
  delay?: number;
  discardAfterMatching?: boolean;
} & (
  | {
      response: { result: any } | { error: string };
    }
  | {
      error: string;
    }
  | {
      implementation: () => void;
    }
);

/**
 * The set of options that the FakeProviderEngine constructor takes.
 *
 * @property stubs - A set of objects that allow specifying the behavior
 * of specific invocations of `sendAsync` matching a `method`.
 */
interface FakeProviderEngineOptions {
  stubs?: FakeProviderStub[];
}

/**
 * FakeProviderEngine is an implementation of the provider that
 * NetworkController exposes, which is actually an instance of
 * Web3ProviderEngine (from the `web3-provider-engine` package). Hence it
 * supports the same interface as Web3ProviderEngine, except that fake responses
 * for any RPC methods that are accessed can be supplied via an API that is more
 * succinct than using Jest's mocking API.
 */
export class FakeProviderEngine extends EventEmitter implements ProviderEngine {
  #isStopped: boolean;

  #stubs: FakeProviderStub[];

  #originalStubs: FakeProviderStub[];

  /**
   * Makes a new instance of the fake provider.
   *
   * @param options - The options.
   * @param options.stubs - A set of objects that allow specifying the behavior
   * of specific invocations of `sendAsync` matching a `method`.
   */
  constructor({ stubs = [] }: FakeProviderEngineOptions) {
    super();
    this.#originalStubs = stubs;
    this.#stubs = this.#originalStubs.slice();
    this.#isStopped = false;
  }

  stop() {
    this.#isStopped = true;
  }

  sendAsync<P, V>(
    payload: SendAsyncPayload<P>,
    callback: (error: unknown, response: RpcResponse<RpcPayload<P>, V>) => void,
  ) {
    if (Array.isArray(payload)) {
      throw new Error("Arrays aren't supported");
    }

    const index = this.#stubs.findIndex(
      (stub) =>
        stub.request.method === payload.method &&
        (!('params' in stub.request) ||
          isDeepStrictEqual(stub.request.params, payload.params)),
    );

    if (this.#isStopped) {
      console.log('Provider has been stopped, ignoring call to sendAsync');
      return;
    }

    if (index !== -1) {
      const stub = this.#stubs[index];

      if (stub.discardAfterMatching !== false) {
        this.#stubs.splice(index, 1);
      }

      if (stub.delay) {
        originalSetTimeout(() => {
          this.#handleRequest(stub, callback);
        }, stub.delay);
      } else {
        this.#handleRequest(stub, callback);
      }
    } else {
      const inspectedOriginalStubs = inspect(this.#originalStubs, {
        depth: null,
      });
      const inspectedStubs = inspect(this.#stubs, { depth: null });
      const message =
        `Could not find any stubs matching "${payload.method}". Perhaps they've already been called?\n\n` +
        'The original set of stubs were:\n\n' +
        `${inspectedOriginalStubs}\n\n` +
        'Current set of stubs:\n\n' +
        `${inspectedStubs}\n\n`;

      throw new Error(message);
    }
  }

  #handleRequest<P, V>(
    stub: FakeProviderStub,
    callback: (error: unknown, response: RpcResponse<RpcPayload<P>, V>) => void,
  ) {
    if ('implementation' in stub) {
      stub.implementation();
    } else if ('response' in stub) {
      if ('result' in stub.response) {
        return callback(null, {
          jsonrpc: '2.0',
          id: 1,
          result: stub.response.result,
        });
      } else if ('error' in stub.response) {
        return callback(null, {
          jsonrpc: '2.0',
          id: 1,
          result: undefined,
          error: {
            code: -999,
            message: stub.response.error,
          },
        });
      }
    } else if ('error' in stub) {
      return callback(new Error(stub.error), {
        jsonrpc: '2.0',
        id: 1,
        result: undefined,
        error: {
          code: -999,
          message: stub.error,
        },
      });
    }
    return undefined;
  }
}
