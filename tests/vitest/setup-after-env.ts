import { cleanAll, disableNetConnect, enableNetConnect } from 'nock';
import { afterEach, beforeEach, expect } from 'vitest';

import { matchers } from '../matchers.js';

/**
 * The Vitest counterpart to `tests/setupAfterEnv/index.ts`. Unlike Jest, Vitest
 * has a single `setupFiles` hook rather than separate `setupFiles` and
 * `setupFilesAfterEach`, and its globals are explicit imports.
 */

// The matcher types are declared in `types/global.d.ts`, which every package
// includes; declaring them here would not reach the packages that use them.
expect.extend(matchers);

beforeEach(() => {
  disableNetConnect();
});

afterEach(() => {
  cleanAll();
  enableNetConnect();
});
