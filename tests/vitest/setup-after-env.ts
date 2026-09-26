import { cleanAll, disableNetConnect, enableNetConnect } from 'nock';
import { afterEach, beforeEach, expect } from 'vitest';

import { matchers } from '../matchers.js';

/**
 * The Vitest counterpart to `tests/setupAfterEnv/index.ts`. Unlike Jest, Vitest
 * has a single `setupFiles` hook rather than separate `setupFiles` and
 * `setupFilesAfterEach`, and its globals are explicit imports.
 */

expect.extend(matchers);

declare module 'vitest' {
  // We're using `interface` here so that we can extend and not override it. The
  // type parameter must match Vitest's own declaration, which defaults to `any`.
  /* oxlint-disable-next-line typescript/consistent-type-definitions, typescript/no-explicit-any, id-length */
  interface Matchers<T = any> {
    toBeFulfilled(): Promise<T>;
    toNeverResolve(): Promise<T>;
  }
}

beforeEach(() => {
  disableNetConnect();
});

afterEach(() => {
  cleanAll();
  enableNetConnect();
});
