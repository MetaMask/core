export const MOCK_COVERAGE_ID = '1';

/**
 * Create a mock backend.
 *
 * @returns A mock backend.
 */
export function createMockBackend() {
  return {
    checkCoverage: jest.fn().mockResolvedValue({
      coverageId: MOCK_COVERAGE_ID,
      status: 'covered',
      message: 'message',
      reasonCode: 'reasonCode',
    }),
    checkSignatureCoverage: jest.fn().mockResolvedValue({
      coverageId: MOCK_COVERAGE_ID,
      status: 'covered',
      message: 'message',
      reasonCode: 'reasonCode',
    }),
    logSignature: jest.fn(),
    logTransaction: jest.fn(),
  };
}
