import { ShieldRemoteBackend } from './backend';
import {
  generateMockSignatureRequest,
  generateMockTxMeta,
  getRandomCoverageStatus,
} from '../tests/utils';

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
    fetch,
    baseUrl: 'https://rule-engine.metamask.io',
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
    const coverageId = 'coverageId';
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
    expect(coverageResult).toStrictEqual({ coverageId, status });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAccessToken).toHaveBeenCalledTimes(2);
  });

  it('should check coverage with delay', async () => {
    const { backend, fetchMock, getAccessToken } = setup({
      getCoverageResultPollInterval: 100,
    });

    // Mock init coverage check.
    const coverageId = 'coverageId';
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId }),
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
    expect(coverageResult).toStrictEqual({ coverageId, status });
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

  describe('checkSignatureCoverage', () => {
    it('should check signature coverage', async () => {
      const { backend, fetchMock, getAccessToken } = setup();

      // Mock init coverage check.
      const coverageId = 'coverageId';
      fetchMock.mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue({ coverageId }),
      } as unknown as Response);

      // Mock get coverage result.
      const status = getRandomCoverageStatus();
      fetchMock.mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue({ status }),
      } as unknown as Response);

      const signatureRequest = generateMockSignatureRequest();
      const coverageResult =
        await backend.checkSignatureCoverage(signatureRequest);
      expect(coverageResult).toStrictEqual({ coverageId, status });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(getAccessToken).toHaveBeenCalledTimes(2);
    });

    it('throws with invalid data', async () => {
      const { backend } = setup();

      const signatureRequest = generateMockSignatureRequest();
      signatureRequest.messageParams.data = [];
      await expect(
        backend.checkSignatureCoverage(signatureRequest),
      ).rejects.toThrow('Signature data must be a string');
    });
  });

  describe('logSignature', () => {
    it('logs signature', async () => {
      const { backend, fetchMock, getAccessToken } = setup();

      fetchMock.mockResolvedValueOnce({ status: 200 } as unknown as Response);

      await backend.logSignature({
        coverageId: 'coverageId',
        signature: '0x00',
        status: 'shown',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('logs signature without coverageId', async () => {
      const { backend, fetchMock, getAccessToken } = setup();

      fetchMock.mockResolvedValueOnce({ status: 200 } as unknown as Response);

      await backend.logSignature({
        coverageId: undefined,
        signatureRequest: generateMockSignatureRequest(),
        signature: '0x00',
        status: 'not_shown',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('throws on status 500', async () => {
      const { backend, fetchMock } = setup();

      fetchMock.mockResolvedValueOnce({ status: 500 } as unknown as Response);

      await expect(
        backend.logSignature({
          coverageId: 'coverageId',
          signature: '0x00',
          status: 'shown',
        }),
      ).rejects.toThrow('Failed to log signature: 500');
    });
  });

  describe('logTransaction', () => {
    it('logs transaction', async () => {
      const { backend, fetchMock, getAccessToken } = setup();

      fetchMock.mockResolvedValueOnce({ status: 200 } as unknown as Response);

      await backend.logTransaction({
        coverageId: 'coverageId',
        transactionHash: '0x00',
        status: 'shown',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('logs transaction without coverageId', async () => {
      const { backend, fetchMock, getAccessToken } = setup();

      fetchMock.mockResolvedValueOnce({ status: 200 } as unknown as Response);

      await backend.logTransaction({
        coverageId: undefined,
        txMeta: generateMockTxMeta(),
        transactionHash: '0x00',
        status: 'not_shown',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('throws on status 500', async () => {
      const { backend, fetchMock } = setup();

      fetchMock.mockResolvedValueOnce({ status: 500 } as unknown as Response);

      await expect(
        backend.logTransaction({
          coverageId: 'coverageId',
          transactionHash: '0x00',
          status: 'shown',
        }),
      ).rejects.toThrow('Failed to log transaction: 500');
    });
  });
});
