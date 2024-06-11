import { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
import { inspect, isDeepStrictEqual } from 'util';

// Store this in case it gets stubbed later
const originalSetTimeout = global.setTimeout;

/**
 * Represents the type of the `response` property in a fake provider stub.
 */
// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FakeProviderResponse = { result: any } | { error: string };

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
 * @property beforeCompleting - Sometimes it is useful to do something after the
 * request is kicked off but before it ends (or, in terms of a `fetch` promise,
 * when the promise is initiated but before it is resolved). You can pass an
 * (async) function for this option to do this.
 */
export type FakeProviderStub = {
  request: {
    method: string;
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: any[];
  };
  delay?: number;
  discardAfterMatching?: boolean;
  beforeCompleting?: () => void | Promise<void>;
} & (
  | {
      response: FakeProviderResponse;
    }
  | {
      error: unknown;
    }
  | {
      implementation: () => void;
    }
);

/**
 * The set of options that the FakeProvider constructor takes.
 *
 * @property stubs - A set of objects that allow specifying the behavior
 * of specific invocations of `sendAsync` matching a `method`.
 */
type FakeProviderEngineOptions = {
  stubs?: FakeProviderStub[];
};

/**
 * An implementation of the provider that NetworkController exposes, which is
 * actually an instance of SafeEventEmitterProvider (from the
 * `@metamask/eth-json-rpc-provider` package). Hence it supports the same
 * interface as SafeEventEmitterProvider, except that fake responses for any RPC
 * methods that are accessed can be supplied via an API that is more succinct
 * than using Jest's mocking API.
 */
// NOTE: We shouldn't need to extend from the "real" provider here, but
// we'd need a `SafeEventEmitterProvider` _interface_ and that doesn't exist (at
// least not yet).
export class FakeProvider extends SafeEventEmitterProvider {
  calledStubs: FakeProviderStub[];

  #originalStubs: FakeProviderStub[];

  #stubs: FakeProviderStub[];

  /**
   * Makes a new instance of the fake provider.
   *
   * @param options - The options.
   * @param options.stubs - A set of objects that allow specifying the behavior
   * of specific invocations of `sendAsync` matching a `method`.
   */
  constructor({ stubs = [] }: FakeProviderEngineOptions = {}) {
    super({ engine: new JsonRpcEngine() });
    this.#originalStubs = stubs;
    this.#stubs = this.#originalStubs.slice();
    this.calledStubs = [];
  }

  sendAsync = (
    payload: JsonRpcRequest,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ) => {
    return this.#handleSend(payload, callback);
  };

  send = (
    req: JsonRpcRequest,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ) => {
    return this.#handleSend(req, callback);
  };

  #handleSend(
    req: JsonRpcRequest,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, providerRes?: any) => void,
  ) {
    if (Array.isArray(req)) {
      throw new Error("Arrays aren't supported");
    }

    const index = this.#stubs.findIndex((stub) => {
      return (
        stub.request.method === req.method &&
        (!('params' in stub.request) ||
          isDeepStrictEqual(stub.request.params, req.params))
      );
    });

    if (index === -1) {
      const matchingCalledStubs = this.calledStubs.filter((stub) => {
        return (
          stub.request.method === req.method &&
          (!('params' in stub.request) ||
            isDeepStrictEqual(stub.request.params, req.params))
        );
      });
      let message = `Could not find any stubs matching: ${inspect(req, {
        depth: null,
      })}`;
      if (matchingCalledStubs.length > 0) {
        message += `\n\nIt appears the following stubs were defined, but have been called already:\n\n${inspect(
          matchingCalledStubs,
          { depth: null },
        )}`;
      }

      throw new Error(message);
    } else {
      // We are already checking that this stub exists above.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const stub = this.#stubs[index]!;

      if (stub.discardAfterMatching !== false) {
        this.#stubs.splice(index, 1);
      }

      if (stub.delay) {
        originalSetTimeout(() => {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.#handleRequest(stub, callback);
        }, stub.delay);
      } else {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.#handleRequest(stub, callback);
      }

      this.calledStubs.push({ ...stub });
    }
  }

  async #handleRequest(
    stub: FakeProviderStub,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (error: unknown, response?: JsonRpcResponse<any>) => void,
  ) {
    if (stub.beforeCompleting) {
      await stub.beforeCompleting();
    }

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
          error: {
            code: -999,
            message: stub.response.error,
          },
        });
      }
    } else if ('error' in stub) {
      return callback(stub.error);
    }

    return undefined;
  }
}
