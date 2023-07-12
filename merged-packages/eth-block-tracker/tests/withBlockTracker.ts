import { providerFromEngine } from '@metamask/eth-json-rpc-provider';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { JsonRpcRequest, JsonRpcResponse } from 'json-rpc-engine';
import { JsonRpcEngine } from 'json-rpc-engine';
import util from 'util';

import type {
  PollingBlockTrackerOptions,
  SubscribeBlockTrackerOptions,
} from '../src';
import { PollingBlockTracker, SubscribeBlockTracker } from '../src';

interface WithPollingBlockTrackerOptions {
  provider?: FakeProviderOptions;
  blockTracker?: PollingBlockTrackerOptions;
}

type WithPollingBlockTrackerCallback = (args: {
  provider: SafeEventEmitterProvider;
  blockTracker: PollingBlockTracker;
}) => void | Promise<void>;

interface WithSubscribeBlockTrackerOptions {
  provider?: FakeProviderOptions;
  blockTracker?: SubscribeBlockTrackerOptions;
}

type WithSubscribeBlockTrackerCallback = (args: {
  provider: SafeEventEmitterProvider;
  blockTracker: SubscribeBlockTracker;
}) => void | Promise<void>;

/**
 * An object that allows specifying the behavior of a specific invocation of
 * `sendAsync`. The `methodName` always identifies the stub, but the behavior
 * may be specified multiple ways: `sendAsync` can either return a promise or
 * throw an error, and if it returns a promise, that promise can either be
 * resolved with a response object or reject with an error.
 *
 * @property methodName - The RPC method to which this stub will be matched.
 * @property response - Instructs `sendAsync` to return a promise that resolves
 * with a response object.
 * @property response.result - Specifies a successful response, with this as the
 * `result`.
 * @property response.error - Specifies an error response, with this as the
 * `error`.
 * @property implementation - Allows overriding `sendAsync` entirely. Useful if
 * you want it to throw an error.
 * @property error - Instructs `sendAsync` to return a promise that rejects with
 * this error.
 */
type FakeProviderStub =
  | {
      methodName: string;
      response: { result: any } | { error: string };
    }
  | {
      methodName: string;
      implementation: () => void;
    }
  | {
      methodName: string;
      error: string;
    };

/**
 * The set of options that a new instance of FakeProvider takes.
 *
 * @property stubs - A set of objects that allow specifying the behavior
 * of specific invocations of `sendAsync` matching a `methodName`.
 */
interface FakeProviderOptions {
  stubs?: FakeProviderStub[];
}

/**
 * Constructs a provider that returns fake responses for the various
 * RPC methods that the provider supports can be supplied.
 *
 * @param options - The options.
 * @param options.stubs - A set of objects that allow specifying the behavior
 * of specific invocations of `sendAsync` matching a `methodName`.
 * @returns The fake provider.
 */
function getFakeProvider({
  stubs: initialStubs = [],
}: {
  stubs?: FakeProviderStub[];
} = {}) {
  const originalStubs = initialStubs.slice();

  const stubs = initialStubs.slice();
  if (!stubs.some((stub) => stub.methodName === 'eth_blockNumber')) {
    stubs.push({
      methodName: 'eth_blockNumber',
      response: {
        result: '0x0',
      },
    });
  }

  if (!stubs.some((stub) => stub.methodName === 'eth_subscribe')) {
    stubs.push({
      methodName: 'eth_subscribe',
      response: {
        result: '0x0',
      },
    });
  }

  if (!stubs.some((stub) => stub.methodName === 'eth_unsubscribe')) {
    stubs.push({
      methodName: 'eth_unsubscribe',
      response: {
        result: true,
      },
    });
  }

  const provider = providerFromEngine(new JsonRpcEngine());
  jest
    .spyOn(provider, 'sendAsync')
    .mockImplementation(
      (
        request: JsonRpcRequest<unknown>,
        callback: (err: unknown, response?: JsonRpcResponse<unknown>) => void,
      ) => {
        const index = stubs.findIndex(
          (stub) => stub.methodName === request.method,
        );

        if (index !== -1) {
          const stub = stubs[index];
          stubs.splice(index, 1);
          if ('implementation' in stub) {
            stub.implementation();
          } else if ('response' in stub) {
            if ('result' in stub.response) {
              callback(null, {
                jsonrpc: '2.0',
                id: 1,
                result: stub.response.result,
              });
            } else if ('error' in stub.response) {
              callback(null, {
                jsonrpc: '2.0',
                id: 1,
                error: {
                  code: -999,
                  message: stub.response.error,
                },
              });
            }
          } else if ('error' in stub) {
            callback(new Error(stub.error));
          }
          return;
        }

        callback(
          new Error(
            `Could not find any stubs matching "${request.method}". Perhaps they've already been called?\n\n` +
              'The original set of stubs were:\n\n' +
              `${util.inspect(originalStubs, { depth: null })}\n\n` +
              'Current set of stubs:\n\n' +
              `${util.inspect(stubs, { depth: null })}\n\n`,
          ),
        );
      },
    );
  return provider;
}

/**
 * Calls the given function with a built-in PollingBlockTracker, ensuring that
 * all listeners that are on the block tracker are removed and any timers or
 * loops that are running within the block tracker are properly stopped.
 *
 * @param options - Options that allow configuring the block tracker or
 * provider.
 * @param callback - A callback which will be called with the built block
 * tracker.
 */
async function withPollingBlockTracker(
  options: WithPollingBlockTrackerOptions,
  callback: WithPollingBlockTrackerCallback,
): Promise<void>;
/**
 * Calls the given function with a built-in PollingBlockTracker, ensuring that
 * all listeners that are on the block tracker are removed and any timers or
 * loops that are running within the block tracker are properly stopped.
 *
 * @param callback - A callback which will be called with the built block
 * tracker.
 */
async function withPollingBlockTracker(
  callback: WithPollingBlockTrackerCallback,
): Promise<void>;
/* eslint-disable-next-line jsdoc/require-jsdoc */
async function withPollingBlockTracker(
  ...args:
    | [WithPollingBlockTrackerOptions, WithPollingBlockTrackerCallback]
    | [WithPollingBlockTrackerCallback]
) {
  const [options, callback] = args.length === 2 ? args : [{}, args[0]];
  const provider =
    options.provider === undefined
      ? getFakeProvider()
      : getFakeProvider(options.provider);
  const blockTrackerOptions =
    options.blockTracker === undefined
      ? { provider }
      : {
          provider,
          ...options.blockTracker,
        };
  const blockTracker = new PollingBlockTracker(blockTrackerOptions);
  const callbackArgs = { provider, blockTracker };
  await callback(callbackArgs);
}

/**
 * Calls the given function with a built-in SubscribeBlockTracker, ensuring that
 * all listeners that are on the block tracker are removed and any timers or
 * loops that are running within the block tracker are properly stopped.
 *
 * @param options - Options that allow configuring the block tracker or
 * provider.
 * @param callback - A callback which will be called with the built block
 * tracker.
 */
async function withSubscribeBlockTracker(
  options: WithSubscribeBlockTrackerOptions,
  callback: WithSubscribeBlockTrackerCallback,
): Promise<void>;
/**
 * Calls the given function with a built-in SubscribeBlockTracker, ensuring that
 * all listeners that are on the block tracker are removed and any timers or
 * loops that are running within the block tracker are properly stopped.
 *
 * @param callback - A callback which will be called with the built block
 * tracker.
 */
async function withSubscribeBlockTracker(
  callback: WithSubscribeBlockTrackerCallback,
): Promise<void>;
/* eslint-disable-next-line jsdoc/require-jsdoc */
async function withSubscribeBlockTracker(
  ...args:
    | [WithSubscribeBlockTrackerOptions, WithSubscribeBlockTrackerCallback]
    | [WithSubscribeBlockTrackerCallback]
) {
  const [options, callback] = args.length === 2 ? args : [{}, args[0]];
  const provider =
    options.provider === undefined
      ? getFakeProvider()
      : getFakeProvider(options.provider);

  const blockTrackerOptions =
    options.blockTracker === undefined
      ? { provider }
      : {
          provider,
          ...options.blockTracker,
        };
  const blockTracker = new SubscribeBlockTracker(blockTrackerOptions);
  const callbackArgs = { provider, blockTracker };
  await callback(callbackArgs);
}

export { withPollingBlockTracker, withSubscribeBlockTracker };
