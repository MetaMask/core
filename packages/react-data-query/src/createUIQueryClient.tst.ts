import type { QueryClient } from '@tanstack/query-core';
import { describe, expect, test } from 'tstyche';

import { createUIQueryClient } from './createUIQueryClient.js';

describe('createUIQueryClient', () => {
  test('supports a messenger adapter and returns a QueryClient', () => {
    expect(
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
      }),
    ).type.toBe<QueryClient>();
  });
});
