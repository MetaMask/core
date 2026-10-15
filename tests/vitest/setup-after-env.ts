import { cleanAll, disableNetConnect, enableNetConnect } from 'nock';
import { afterEach, beforeEach, expect } from 'vitest';

import { matchers } from '../matchers.js';

/* oxlint-disable vitest/require-top-level-describe -- setup file, not a suite */

// The matcher types are declared in `types/jest.d.ts`, which every package
// includes; declaring them here would not reach the packages that use them.
expect.extend(matchers);

beforeEach(() => {
  disableNetConnect();
});

afterEach(() => {
  cleanAll();
  enableNetConnect();
});
