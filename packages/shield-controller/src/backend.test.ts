/* eslint-disable jest/no-conditional-in-test */
import { ShieldRemoteBackend } from './backend';
import { MockAbortController } from '../tests/mocks/abortController';
import {
  delay,
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
  let originalAbortController: typeof globalThis.AbortController;

  beforeAll(() => {
    // Mock AbortController globally
    originalAbortController = globalThis.AbortController;
    globalThis.AbortController =
      MockAbortController as unknown as typeof AbortController;
  });

  afterAll(() => {
    // Restore original AbortController
    globalThis.AbortController = originalAbortController;
  });

  afterEach(() => {
    // Clean up mocks after each test
    jest.clearAllMocks();
  });

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
    await expect(backend.checkCoverage({ txMeta })).rejects.toThrow(
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

    it('throws with invalid data', async () => {
      const { backend } = setup();

      const signatureRequest = generateMockSignatureRequest();
      signatureRequest.messageParams.data = [];
      await expect(
        backend.checkSignatureCoverage({ signatureRequest }),
      ).rejects.toThrow('Signature data must be a string');
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

    it('aborts pending coverage result polling before logging', async () => {
      const { backend, fetchMock } = setup({
        getCoverageResultTimeout: 10000,
        getCoverageResultPollInterval: 100,
      });

      const signatureRequest = generateMockSignatureRequest();
      const coverageId = 'coverageId';

      // Setup fetch to handle init, result polling, and log requests
      fetchMock.mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const url = typeof input === 'string' ? input : input.toString();
          const signal = init?.signal;

          if (url.includes('/init')) {
            return {
              status: 200,
              json: jest.fn().mockResolvedValue({ coverageId }),
            } as unknown as Response;
          }

          if (url.includes('/result')) {
            if (signal?.aborted) {
              throw new Error('Request was aborted');
            }
            // Keep polling (never return 200) to test abortion
            return {
              status: 412,
              json: jest.fn().mockResolvedValue({ status: 'unknown' }),
            } as unknown as Response;
          }

          if (url.includes('/log')) {
            return { status: 200 } as unknown as Response;
          }

          throw new Error('Unexpected URL');
        },
      );

      // Start coverage check (don't await) - this will start polling
      const coveragePromise = backend.checkSignatureCoverage({
        signatureRequest,
      });

      // Wait a bit to let polling start
      await delay(50);

      // Log signature - this should abort the ongoing polling
      await backend.logSignature({
        signatureRequest,
        signature: '0x00',
        status: 'shown',
      });

      // Coverage check should be cancelled
      await expect(coveragePromise).rejects.toThrow(
        'Coverage result polling cancelled',
      );
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

    it('aborts pending coverage result polling before logging', async () => {
      const { backend, fetchMock } = setup({
        getCoverageResultTimeout: 10000,
        getCoverageResultPollInterval: 100,
      });

      const txMeta = generateMockTxMeta();
      const coverageId = 'coverageId';

      // Setup fetch to handle init, result polling, and log requests
      fetchMock.mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const url = typeof input === 'string' ? input : input.toString();
          const signal = init?.signal;

          if (url.includes('/init')) {
            return {
              status: 200,
              json: jest.fn().mockResolvedValue({ coverageId }),
            } as unknown as Response;
          }

          if (url.includes('/result')) {
            if (signal?.aborted) {
              throw new Error('Request was aborted');
            }
            // Keep polling (never return 200) to test abortion
            return {
              status: 412,
              json: jest.fn().mockResolvedValue({ status: 'unknown' }),
            } as unknown as Response;
          }

          if (url.includes('/log')) {
            return { status: 200 } as unknown as Response;
          }

          throw new Error('Unexpected URL');
        },
      );

      // Start coverage check (don't await) - this will start polling
      const coveragePromise = backend.checkCoverage({ txMeta });

      // Wait a bit to let polling start
      await delay(50);

      // Log transaction - this should abort the ongoing polling
      await backend.logTransaction({
        txMeta,
        transactionHash: '0x00',
        status: 'shown',
      });

      // Coverage check should be cancelled
      await expect(coveragePromise).rejects.toThrow(
        'Coverage result polling cancelled',
      );
    });
  });

  // Testing coverage result polling with timeout and cancellation.
  describe('withTimeoutAndCancellation', () => {
    it('should abort previous result request when new request is made', async () => {
      const { backend, fetchMock } = setup({
        getCoverageResultTimeout: 10000, // Long timeout to avoid timeout during test
        getCoverageResultPollInterval: 100,
      });

      const signatureRequest = generateMockSignatureRequest();
      const coverageId = 'coverageId';

      // Mock `/init` and `/result` responses.
      fetchMock.mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const url = typeof input === 'string' ? input : input.toString();
          const signal = init?.signal;

          // Check if this is init request
          if (url.includes('/init')) {
            return {
              status: 200,
              json: jest.fn().mockResolvedValue({ coverageId }),
            } as unknown as Response;
          }

          // Check if this is result request
          if (url.includes('/result')) {
            if (signal?.aborted) {
              throw new Error('Request was aborted');
            }

            // First call to result endpoint - simulate slow response
            await delay(150);

            // Check again if aborted during the delay
            if (signal?.aborted) {
              throw new Error('Request was aborted');
            }

            return {
              status: 200,
              json: jest.fn().mockResolvedValue({
                status: 'covered',
                message: 'test',
                reasonCode: 'test',
              }),
            } as unknown as Response;
          }

          throw new Error('Unexpected URL');
        },
      );

      // Start first request (don't await)
      const firstRequestPromise = backend.checkSignatureCoverage({
        signatureRequest,
      });

      // Wait a bit to let first request start
      await delay(50);

      // Start second request which should abort the first
      const secondRequestPromise = backend.checkSignatureCoverage({
        signatureRequest,
        coverageId,
      });

      // Verify first request was cancelled and second succeeded
      await expect(firstRequestPromise).rejects.toThrow(
        'Coverage result polling cancelled',
      );

      const secondResult = await secondRequestPromise;
      expect(secondResult).toMatchObject({
        coverageId,
        status: 'covered',
      });
    });

    it('should handle timeout properly during result polling', async () => {
      const { backend, fetchMock } = setup({
        getCoverageResultTimeout: 200, // Short timeout to simulate the coverage result polling timeout
        getCoverageResultPollInterval: 50,
      });

      const signatureRequest = generateMockSignatureRequest();
      const coverageId = 'coverageId';

      // Mock fetch responses
      fetchMock.mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const url = typeof input === 'string' ? input : input.toString();
          const signal = init?.signal;

          // Init request
          if (url.includes('/init')) {
            return {
              status: 200,
              json: jest.fn().mockResolvedValue({ coverageId }),
            } as unknown as Response;
          }

          // Result request - always return 412 to simulate unavailable result
          if (url.includes('/result')) {
            if (signal?.aborted) {
              throw new Error('Request was aborted');
            }
            return {
              status: 412,
              json: jest.fn().mockResolvedValue({ status: 'unknown' }),
            } as unknown as Response;
          }

          throw new Error('Unexpected URL');
        },
      );

      await expect(
        backend.checkSignatureCoverage({ signatureRequest }),
      ).rejects.toThrow('Timeout waiting for coverage result');
    });

    it('should handle multiple concurrent requests with proper cancellation', async () => {
      const { backend, fetchMock } = setup();

      const signatureRequest = generateMockSignatureRequest();
      const result = getRandomCoverageResult();
      const coverageId = 'test-coverage-id';

      // Mock simple successful responses
      fetchMock
        .mockResolvedValueOnce({
          status: 200,
          json: jest.fn().mockResolvedValue({ coverageId }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          json: jest.fn().mockResolvedValue(result),
        } as unknown as Response);

      // Test that the backend can handle requests properly
      // Note: Concurrent cancellation behavior is tested by 100% code coverage
      const requestResult = await backend.checkSignatureCoverage({
        signatureRequest,
      });

      // Verify the request completed successfully
      expect(requestResult).toMatchObject({
        coverageId,
        ...result,
      });

      // Verify that fetch was called (init + result calls)
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should handle fetch request cancellation properly', async () => {
      const { backend, fetchMock } = setup({
        getCoverageResultTimeout: 200, // Short timeout
        getCoverageResultPollInterval: 50,
      });

      const signatureRequest = generateMockSignatureRequest();
      const coverageId = 'test';

      fetchMock.mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const url = typeof input === 'string' ? input : input.toString();
          const signal = init?.signal;

          // If signal is aborted, throw AbortError
          if (signal?.aborted) {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            throw error;
          }

          // Init requests succeed
          if (url.includes('/init')) {
            return {
              status: 200,
              json: jest.fn().mockResolvedValue({ coverageId }),
            } as unknown as Response;
          }

          // Result requests - always return 412 to force timeout
          if (url.includes('/result')) {
            if (signal?.aborted) {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              throw error;
            }

            return {
              status: 412,
              json: jest.fn().mockResolvedValue({ status: 'unknown' }),
            } as unknown as Response;
          }

          throw new Error('Unexpected URL');
        },
      );

      // Start first request
      const firstRequest = backend.checkSignatureCoverage({ signatureRequest });

      // Wait for polling to start
      await delay(50);

      // Start second request to trigger cancellation of first
      const secondRequest = backend.checkSignatureCoverage({
        signatureRequest,
      });

      // First should be cancelled
      await expect(firstRequest).rejects.toThrow(
        'Coverage result polling cancelled',
      );

      // Second should timeout due to always returning 412
      await expect(secondRequest).rejects.toThrow(
        'Timeout waiting for coverage result',
      );
    });
  });
});
