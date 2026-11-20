import { describe, expect, it } from 'vitest';

import {
  getBatchOperationStatus,
  withBatchOperationStatus,
} from '../../../src/utils/batchOperationStatus.js';

describe('getBatchOperationStatus', () => {
  it.each([
    ['all', { successCount: 3, failureCount: 0 }],
    ['partial', { successCount: 2, failureCount: 1 }],
    ['partial', { successCount: 2, failureCount: 0, error: 'BATCH_FAILED' }],
    ['none', { successCount: 0, failureCount: 2 }],
    ['none', { successCount: 0, failureCount: 0 }],
    ['none', { successCount: 0, failureCount: 0, error: 'ROUTE_REQUIRED' }],
  ] as const)('is %s for %j', (status, counts) => {
    expect(getBatchOperationStatus(counts)).toBe(status);
  });
});

describe('withBatchOperationStatus', () => {
  it('adds the status and leaves the result as it was', () => {
    const result = {
      success: true,
      successCount: 1,
      failureCount: 1,
      results: [
        { symbol: 'BTC', success: true },
        { symbol: 'ETH', success: false, error: 'POSITION_NOT_FOUND' },
      ],
    };

    expect(withBatchOperationStatus(result)).toStrictEqual({
      ...result,
      status: 'partial',
    });
  });
});
