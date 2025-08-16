import { ShieldRemoteBackend } from './backend';
import { generateMockTxMeta, getRandomCoverageStatus } from '../tests/utils';

/**
 * Setup the test environment.
 *
 * @param options - The options for the setup.
 * @param options.getCoverageResultTimeout - The timeout for the get coverage result.
 * @param options.getCoverageResultPollInterval - The poll interval for the get coverage result.
 * @returns Objects that have been created for testing.
 */
function setup({
  getCoverageResultTimeout,
  getCoverageResultPollInterval,
}: {
  getCoverageResultTimeout?: number;
  getCoverageResultPollInterval?: number;
} = {}) {
  // Setup fetch mock.
  const fetchMock = jest.spyOn(global, 'fetch') as jest.MockedFunction<
    typeof fetch
  >;

  // Setup access token mock.
  const getAccessToken = jest.fn().mockResolvedValue('token');

  // Setup backend.
  const backend = new ShieldRemoteBackend({
    getAccessToken,
    getCoverageResultTimeout,
    getCoverageResultPollInterval,
  });

  return {
    backend,
    getAccessToken,
    fetchMock,
  };
}

describe('ShieldRemoteBackend', () => {
  it('should check coverage', async () => {
    const { backend, fetchMock, getAccessToken } = setup();

    // Mock init coverage check.
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
    } as unknown as Response);

    // Mock get coverage result.
    const status = getRandomCoverageStatus();
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ status }),
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    const coverageResult = await backend.checkCoverage(txMeta);
    expect(coverageResult).toStrictEqual({ status });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAccessToken).toHaveBeenCalledTimes(2);
  });

  it('should check coverage with delay', async () => {
    const { backend, fetchMock, getAccessToken } = setup({
      getCoverageResultPollInterval: 100,
    });

    // Mock init coverage check.
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
    } as unknown as Response);

    // Mock get coverage result: result unavailable.
    fetchMock.mockResolvedValueOnce({
      status: 404,
      json: jest.fn().mockResolvedValue({ status: 'unavailable' }),
    } as unknown as Response);

    // Mock get coverage result: result available.
    const status = getRandomCoverageStatus();
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ status }),
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    const coverageResult = await backend.checkCoverage(txMeta);
    expect(coverageResult).toStrictEqual({ status });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAccessToken).toHaveBeenCalledTimes(2);
  });

  it('should throw on init coverage check failure', async () => {
    const { backend, fetchMock, getAccessToken } = setup({
      getCoverageResultTimeout: 0,
    });

    // Mock init coverage check.
    const status = 500;
    fetchMock.mockResolvedValueOnce({
      status,
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    await expect(backend.checkCoverage(txMeta)).rejects.toThrow(
      `Failed to init coverage check: ${status}`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('should throw on check coverage timeout', async () => {
    const { backend, fetchMock } = setup({
      getCoverageResultTimeout: 0,
      getCoverageResultPollInterval: 0,
    });

    // Mock init coverage check.
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
    } as unknown as Response);

    // Mock get coverage result: result unavailable.
    fetchMock.mockResolvedValue({
      status: 404,
      json: jest.fn().mockResolvedValue({ status: 'unavailable' }),
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    await expect(backend.checkCoverage(txMeta)).rejects.toThrow(
      'Timeout waiting for coverage result',
    );

    // Waiting here ensures coverage of the unexpected error and lets us know
    // that the polling loop is exited as expected.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
