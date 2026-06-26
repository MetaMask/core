import { ShieldBackend } from 'src/types';

export const MOCK_COVERAGE_ID = '1';

/**
 * Create a mock backend.
 *
 * @returns A mock backend.
 */
export function createMockBackend(): jest.Mocked<ShieldBackend> {
  return {
    checkCoverage: jest.fn().mockResolvedValue({
      coverageId: MOCK_COVERAGE_ID,
      status: 'covered',
    }),
    checkSignatureCoverage: jest.fn().mockResolvedValue({
      coverageId: MOCK_COVERAGE_ID,
      status: 'covered',
    }),
    logSignature: jest.fn(),
    logTransaction: jest.fn(),
  };
}
