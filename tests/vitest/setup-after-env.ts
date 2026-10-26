import { cleanAll, disableNetConnect, enableNetConnect } from 'nock';
import { afterEach, beforeEach, expect } from 'vitest';

import { matchers } from '../matchers.js';

/* oxlint-disable vitest/require-top-level-describe -- setup file, not a suite */

expect.extend(matchers);

beforeEach(() => {
  disableNetConnect();
});

afterEach(() => {
  cleanAll();
  enableNetConnect();
});
