import { InternalProvider } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { Json } from '@metamask/utils';
import util from 'util';

import type { PollingBlockTrackerOptions } from '../src';
import { PollingBlockTracker } from '../src';

type WithPollingBlockTrackerOptions = {
  provider?: FakeProviderOptions;
  blockTracker?: PollingBlockTrackerOptions;
};

type WithPollingBlockTrackerCallback = (args: {
  provider: InternalProvider;
  blockTracker: PollingBlockTracker;
}) => void | Promise<void>;

/**
 * An object that allows specifying the behavior of a specific invocation of
 * `request`. The `methodName` always identifies the stub, but the behavior
 * may be specified multiple ways: `request` can either return a result
 * or reject with an error.
 *
 * methodName - The RPC method to which this stub will be matched.
 *
 * result - Instructs `request` to return a result.
 *
 * implementation - Allows overriding `request` entirely. Useful if
 * you want it to throw an error.
 *
 * error - Instructs `request` to return a promise that rejects with
 * this error.
 */
type FakeProviderStub =
  | {
      methodName: string;
      result: Json;
    }
  | {
      methodName: string;
      implementation: () => void;
    }
  | {
      methodName: string;
      error: unknown;
    };

/**
 * The set of options that a new instance of FakeProvider takes.
 *
 * stubs - A set of objects that allow specifying the behavior
 * of specific invocations of `request` matching a `methodName`.
 */
type FakeProviderOptions = {
  stubs?: FakeProviderStub[];
};

/**
 * Constructs a provider that returns fake responses for the various
 * RPC methods that the provider supports can be supplied.
 *
 * @param options - The options.
 * @param options.stubs - A set of objects that allow specifying the behavior
 * of specific invocations of `request` matching a `methodName`.
 * @returns The fake provider.
 */
function getFakeProvider({
  stubs: initialStubs = [],
}: {
  stubs?: FakeProviderStub[];
} = {}): InternalProvider {
  const originalStubs = initialStubs.slice();

  const stubs = initialStubs.slice();
  if (!stubs.some((stub) => stub.methodName === 'eth_blockNumber')) {
    stubs.push({
      methodName: 'eth_blockNumber',
      result: '0x0',
    });
  }

  if (!stubs.some((stub) => stub.methodName === 'eth_subscribe')) {
    stubs.push({
      methodName: 'eth_subscribe',
      result: '0x0',
    });
  }

  if (!stubs.some((stub) => stub.methodName === 'eth_unsubscribe')) {
    stubs.push({
      methodName: 'eth_unsubscribe',
      result: true,
    });
  }

  const provider = new InternalProvider({ engine: new JsonRpcEngine() });
  jest
    .spyOn(provider, 'request')
    .mockImplementation(async (eip1193Request): Promise<Json> => {
      const index = stubs.findIndex(
        (stub) => stub.methodName === eip1193Request.method,
      );

      if (index !== -1) {
        const stub = stubs[index];
        stubs.splice(index, 1);
        if ('implementation' in stub) {
          stub.implementation();
        } else if ('result' in stub) {
          return stub.result;
        } else if ('error' in stub) {
          throw stub.error;
        }
        return null;
      }

      throw new Error(
        `Could not find any stubs matching "${eip1193Request.method}". Perhaps they've already been called?\n\n` +
          'The original set of stubs were:\n\n' +
          `${util.inspect(originalStubs, { depth: null })}\n\n` +
          'Current set of stubs:\n\n' +
          `${util.inspect(stubs, { depth: null })}\n\n`,
      );
    });
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
 * @returns The provider and block tracker.
 */
export async function withPollingBlockTracker(
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
 * @returns The provider and block tracker.
 */
export async function withPollingBlockTracker(
  callback: WithPollingBlockTrackerCallback,
): Promise<void>;

export async function withPollingBlockTracker(
  ...args:
    | [WithPollingBlockTrackerOptions, WithPollingBlockTrackerCallback]
    | [WithPollingBlockTrackerCallback]
): Promise<void> {
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
  return await callback(callbackArgs);
}
