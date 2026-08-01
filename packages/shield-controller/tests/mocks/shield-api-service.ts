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
  checkCoverage: jest.Mock;
  checkSignatureCoverage: jest.Mock;
  logSignature: jest.Mock;
  logTransaction: jest.Mock;
} {
  return {
    checkCoverage: jest.fn().mockResolvedValue(DEFAULT_COVERAGE_RESULT),
    checkSignatureCoverage: jest
      .fn()
      .mockResolvedValue(DEFAULT_COVERAGE_RESULT),
    logSignature: jest.fn().mockResolvedValue(undefined),
    logTransaction: jest.fn().mockResolvedValue(undefined),
  };
}
