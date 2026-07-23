/**
 * This file is intended to be run via `tsc` (using `tsconfig.type-tests.json`)
 * instead of Jest. If `tsc` runs successfully, the test file succeeds with no
 * output, otherwise it fails.
 *
 * This file exists because if a type error occurs in a test it is not caught by
 * ESLint or Jest. In the future we may need to figure out how to run `tsc`
 * across the monorepo; this is more of a stopgap solution.
 */

import type { QueryClient } from '@tanstack/query-core';

import { createUIQueryClient } from './createUIQueryClient.js';

// "Assert" that `createUIQueryClient` supports a messenger adapter.
createUIQueryClient(['FirstDataService', 'SecondDataService'] as const, {
  call(actionType, ...params) {
    // Use these parameters somehow
    console.log(actionType, params);
    return 42;
  },
  subscribe(eventType, handler) {
    // Use these parameters somehow
    console.log(eventType, handler);
  },
  unsubscribe(eventType, handler) {
    // Use these parameters somehow
    console.log(eventType, handler);
  },
}) satisfies QueryClient;
