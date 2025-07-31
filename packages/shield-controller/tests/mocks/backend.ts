/**
 *
 */
export function createMockBackend() {
  return {
    checkCoverage: jest.fn().mockResolvedValue({
      txId: 'txId',
      status: 'covered',
    }),
  };
}
