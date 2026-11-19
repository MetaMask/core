import { setImmediate as realSetImmediate } from 'node:timers';
import { expect } from 'vitest';

/**
 * Resolve all pending promises.
 *
 * This method is used for async tests that use fake timers.
 * See https://stackoverflow.com/a/58716087.
 *
 * `setImmediate` comes from `node:timers` so that it is the real one even while
 * fake timers are installed.
 *
 * TODO: migrate this to @metamask/utils
 *
 * @returns A promise that resolves once the microtask queue has drained.
 */
export async function flushPromises(): Promise<void> {
  await new Promise(realSetImmediate);
}

/**
 * Some tests involve a rejected promise that is not necessarily the focus of
 * the test. In these cases we don't want to ignore the error in case the
 * promise _isn't_ rejected, but we don't want to highlight the assertion,
 * either.
 *
 * @param promiseOrFn - A promise that rejects, or a function that returns a
 * promise that rejects.
 * @returns A promise that resolves once the rejection has been asserted.
 */
export async function ignoreRejection<Type>(
  promiseOrFn: Promise<Type> | (() => Type | Promise<Type>),
): Promise<void> {
  await expect(promiseOrFn).rejects.toThrow(expect.any(Error));
}
