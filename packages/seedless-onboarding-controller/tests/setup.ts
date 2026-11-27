import { beforeEach } from 'vitest';

import { handleMockNodeDetails } from './__fixtures__/topfClient.js';

/* oxlint-disable vitest/require-top-level-describe -- setup file, not a suite */

beforeEach(() => {
  // Every test builds a controller whose TOPRF client looks up the node list.
  handleMockNodeDetails();
});
