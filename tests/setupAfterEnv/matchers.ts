import { expect } from '@jest/globals';

import { matchers } from '../matchers.js';

// See `tests/matchers.ts` for the implementations, and `types/global.d.ts` for
// their types.
expect.extend(matchers);
