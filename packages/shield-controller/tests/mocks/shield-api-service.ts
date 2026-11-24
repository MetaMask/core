import type { Mock } from 'vitest';
import { vi } from 'vitest';

import type { CoverageResult } from '../../src/types.js';

export const MOCK_COVERAGE_ID = '1';

const DEFAULT_COVERAGE_RESULT: CoverageResult = {
  coverageId: MOCK_COVERAGE_ID,
  status: 'covered',
  metrics: {},
};

/**
 * Create mock handlers for ShieldApiService messenger actions.
 *
 * @returns Mock handlers for the Shield API service actions.
 */
export function createMockShieldApiServiceHandlers(): {
  checkCoverage: Mock;
  checkSignatureCoverage: Mock;
  logSignature: Mock;
  logTransaction: Mock;
} {
  return {
    checkCoverage: vi.fn().mockResolvedValue(DEFAULT_COVERAGE_RESULT),
    checkSignatureCoverage: vi.fn().mockResolvedValue(DEFAULT_COVERAGE_RESULT),
    logSignature: vi.fn().mockResolvedValue(undefined),
    logTransaction: vi.fn().mockResolvedValue(undefined),
  };
}
