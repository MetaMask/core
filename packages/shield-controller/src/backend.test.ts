import {
  EthMethod,
  SignatureRequestType,
} from '@metamask/signature-controller';

import { parseSignatureRequestMethod, ShieldRemoteBackend } from './backend';
import { SignTypedDataVersion } from './constants';
import {
  generateMockSignatureRequest,
  generateMockTxMeta,
  getRandomCoverageResult,
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
      json: jest.fn().mockResolvedValue({ coverageId }),
    } as unknown as Response);

    // Mock get coverage result.
    const result = getRandomCoverageResult();
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue(result),
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    const coverageResult = await backend.checkCoverage({ txMeta });
    expect(coverageResult).toStrictEqual({ coverageId, ...result });
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
    const result = getRandomCoverageResult();
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue(result),
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    const coverageResult = await backend.checkCoverage({ txMeta });
    expect(coverageResult).toStrictEqual({
      coverageId,
      ...result,
    });
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
    await expect(backend.checkCoverage({ txMeta })).rejects.toThrow(
      `Failed to init coverage check: ${status}`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('should throw on check coverage timeout with coverage status', async () => {
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
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    await expect(backend.checkCoverage({ txMeta })).rejects.toThrow(
      'Failed to get coverage result: 404',
    );

    // Waiting here ensures coverage of the unexpected error and lets us know
    // that the polling loop is exited as expected.
    await new Promise((resolve) => setTimeout(resolve, 10));
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
      status: 412,
      json: jest.fn().mockResolvedValue({
        message: 'Results are not available yet',
        statusCode: 412,
      }),
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    await expect(backend.checkCoverage({ txMeta })).rejects.toThrow(
      'Failed to get coverage result: Results are not available yet',
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
      const result = getRandomCoverageResult();
      fetchMock.mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue(result),
      } as unknown as Response);

      const signatureRequest = generateMockSignatureRequest();
      const coverageResult = await backend.checkSignatureCoverage({
        signatureRequest,
      });
      expect(coverageResult).toStrictEqual({
        coverageId,
        ...result,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(getAccessToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('logSignature', () => {
    it('logs signature', async () => {
      const { backend, fetchMock, getAccessToken } = setup();

      fetchMock.mockResolvedValueOnce({ status: 200 } as unknown as Response);

      await backend.logSignature({
        signatureRequest: generateMockSignatureRequest(),
        signature: '0x00',
        status: 'shown',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('throws on status 500', async () => {
      const { backend, fetchMock } = setup();

      fetchMock.mockResolvedValueOnce({ status: 500 } as unknown as Response);

      await expect(
        backend.logSignature({
          signatureRequest: generateMockSignatureRequest(),
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
        txMeta: generateMockTxMeta(),
        transactionHash: '0x00',
        status: 'shown',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('throws on status 500', async () => {
      const { backend, fetchMock } = setup();

      fetchMock.mockResolvedValueOnce({ status: 500 } as unknown as Response);

      await expect(
        backend.logTransaction({
          txMeta: generateMockTxMeta(),
          transactionHash: '0x00',
          status: 'shown',
        }),
      ).rejects.toThrow('Failed to log transaction: 500');
    });
  });

  describe('parseSignatureRequestMethod', () => {
    it('parses personal sign', () => {
      const signatureRequest = generateMockSignatureRequest();
      expect(parseSignatureRequestMethod(signatureRequest)).toBe(
        EthMethod.PersonalSign,
      );
    });

    it('parses typed sign', () => {
      const signatureRequest = generateMockSignatureRequest(
        SignatureRequestType.TypedSign,
        SignTypedDataVersion.V1,
      );
      expect(parseSignatureRequestMethod(signatureRequest)).toBe(
        SignatureRequestType.TypedSign,
      );
    });

    it('parses typed sign v3', () => {
      const signatureRequest = generateMockSignatureRequest(
        SignatureRequestType.TypedSign,
        SignTypedDataVersion.V3,
      );
      expect(parseSignatureRequestMethod(signatureRequest)).toBe(
        EthMethod.SignTypedDataV3,
      );
    });

    it('parses typed sign v4', () => {
      const signatureRequest = generateMockSignatureRequest(
        SignatureRequestType.TypedSign,
        SignTypedDataVersion.V4,
      );
      expect(parseSignatureRequestMethod(signatureRequest)).toBe(
        EthMethod.SignTypedDataV4,
      );
    });
  });
});
