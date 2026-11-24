import { InternalProvider } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { setImmediate as realSetImmediate } from 'node:timers';

/**
 * Resolve all pending promises.
 * This method is used for async tests that use fake timers.
 * See https://stackoverflow.com/a/58716087 and https://vitest.dev/guide/mocking/timers.
 *
 * `setImmediate` comes from `node:timers` so that it is the real one even while
 * fake timers are installed.
 */
export const flushPromises = async () => {
  return new Promise(realSetImmediate);
};

export function getFakeProvider() {
  return new InternalProvider({ engine: new JsonRpcEngine() });
}
