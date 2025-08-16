/**
 * Create a mock backend.
 *
 * @returns A mock backend.
 */
export function createMockBackend() {
  return {
    checkCoverage: jest.fn().mockResolvedValue({
      status: 'covered',
    }),
  };
}
