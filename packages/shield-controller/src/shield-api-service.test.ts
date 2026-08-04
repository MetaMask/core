import { HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  EthMethod,
  SignatureRequestType,
} from '@metamask/signature-controller';

import {
  generateMockSignatureRequest,
  generateMockTxMeta,
  getRandomCoverageResult,
} from '../tests/utils.js';
import {
  Env,
  getShieldApiBaseUrl,
  SHIELD_API_URL_MAP,
  SignTypedDataVersion,
} from './constants.js';
import type { ShieldApiServiceMessenger } from './shield-api-service.js';
import {
  makeInitCoverageCheckBody,
  parseSignatureRequestMethod,
  ShieldApiService,
} from './shield-api-service.js';

const mockCaptureException = jest.fn();
const MOCK_TOKEN = 'token';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ShieldApiServiceMessenger>,
  MessengerEvents<ShieldApiServiceMessenger>
>;

function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function createServiceMessenger(
  rootMessenger: RootMessenger,
): ShieldApiServiceMessenger {
  return new Messenger({
    namespace: 'ShieldApiService',
    parent: rootMessenger,
  });
}

function createService({
  options = {},
  getBearerToken = async (): Promise<string> => MOCK_TOKEN,
}: {
  options?: Partial<ConstructorParameters<typeof ShieldApiService>[0]>;
  getBearerToken?: () => Promise<string>;
} = {}): {
  service: ShieldApiService;
  rootMessenger: RootMessenger;
  messenger: ShieldApiServiceMessenger;
  getBearerToken: jest.Mock;
} {
  const rootMessenger = createRootMessenger();
  const getBearerTokenMock = jest.fn(getBearerToken);
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    getBearerTokenMock,
  );
  const messenger = createServiceMessenger(rootMessenger);
  rootMessenger.delegate({
    messenger,
    actions: ['AuthenticationController:getBearerToken'],
    events: [],
  });
  const service = new ShieldApiService({
    fetch: globalThis.fetch,
    env: Env.PRD,
    captureException: mockCaptureException,
    messenger,
    ...options,
  });

  return {
    service,
    rootMessenger,
    messenger,
    getBearerToken: getBearerTokenMock,
  };
}

/**
 * Setup the test environment.
 *
 * @param options - The options for the setup.
 * @param options.getCoverageResultTimeout - The timeout for the get coverage result.
 * @param options.getCoverageResultPollInterval - The poll interval for the get coverage result.
 * @param options.policyOptions - Options passed through to the service policy.
 * @param options.getBearerToken - Optional bearer-token override.
 * @returns Objects that have been created for testing.
 */
function setup({
  getCoverageResultTimeout,
  getCoverageResultPollInterval,
  policyOptions,
  getBearerToken,
}: {
  getCoverageResultTimeout?: number;
  getCoverageResultPollInterval?: number;
  policyOptions?: ConstructorParameters<
    typeof ShieldApiService
  >[0]['policyOptions'];
  getBearerToken?: () => Promise<string>;
} = {}): {
  service: ShieldApiService;
  fetchMock: jest.MockedFunction<typeof fetch>;
  getBearerToken: jest.Mock;
  rootMessenger: RootMessenger;
} {
  const fetchMock = jest.spyOn(global, 'fetch') as jest.MockedFunction<
    typeof fetch
  >;

  const {
    service,
    getBearerToken: getBearerTokenMock,
    rootMessenger,
  } = createService({
    options: {
      getCoverageResultTimeout,
      getCoverageResultPollInterval,
      policyOptions,
    },
    getBearerToken,
  });

  return {
    service,
    getBearerToken: getBearerTokenMock,
    fetchMock,
    rootMessenger,
  };
}

describe('ShieldApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should check coverage', async () => {
    const { service, fetchMock, getBearerToken } = setup();

    const coverageId = 'coverageId';
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId }),
    } as unknown as Response);

    const result = getRandomCoverageResult();
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue(result),
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    const coverageResult = await service.checkCoverage({ txMeta });
    expect({
      coverageId: coverageResult.coverageId,
      message: result.message,
      reasonCode: result.reasonCode,
      status: result.status,
    }).toStrictEqual({
      coverageId,
      ...result,
    });
    expect(typeof coverageResult.metrics.latency).toBe('number');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getBearerToken).toHaveBeenCalledTimes(2);
  });

  it('exposes checkCoverage through the messenger', async () => {
    const coverageId = 'coverageId';
    const fetchMock = jest.spyOn(global, 'fetch') as jest.MockedFunction<
      typeof fetch
    >;
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId }),
    } as unknown as Response);
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue(getRandomCoverageResult()),
    } as unknown as Response);

    const { rootMessenger } = createService();
    const txMeta = generateMockTxMeta();

    const coverageResult = await rootMessenger.call(
      'ShieldApiService:checkCoverage',
      { txMeta },
    );

    expect(coverageResult.coverageId).toBe(coverageId);
  });

  it('should check coverage with delay', async () => {
    const pollInterval = 100;
    const { service, fetchMock, getBearerToken } = setup({
      getCoverageResultPollInterval: pollInterval,
    });

    const coverageId = 'coverageId';
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId }),
    } as unknown as Response);

    fetchMock.mockResolvedValueOnce({
      status: 404,
      json: jest.fn().mockResolvedValue({ status: 'unavailable' }),
    } as unknown as Response);

    const result = getRandomCoverageResult();
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue(result),
    } as unknown as Response);

    const txMeta = generateMockTxMeta();

    let callCount = 0;
    const startTime = 1000;
    const expectedLatency = pollInterval + 50;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      callCount += 1;
      // `fetchQuery` during init may call `Date.now()` before polling latency is measured.
      if (callCount <= 1) {
        return startTime;
      }
      if (callCount === 2) {
        return startTime;
      }
      return startTime + expectedLatency;
    });

    const coverageResult = await service.checkCoverage({ txMeta });

    expect(coverageResult).toMatchObject({
      coverageId,
      status: result.status,
      message: result.message,
      reasonCode: result.reasonCode,
    });
    expect(coverageResult.metrics.latency).toBe(expectedLatency);
    expect(coverageResult.metrics.latency).toBeGreaterThanOrEqual(pollInterval);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getBearerToken).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it('should throw on init coverage check failure', async () => {
    const { service, fetchMock, getBearerToken } = setup({
      getCoverageResultTimeout: 0,
    });

    const status = 500;
    fetchMock.mockResolvedValueOnce({
      status,
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    await expect(service.checkCoverage({ txMeta })).rejects.toThrow(
      `Failed to init coverage check: ${status}`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Failed to init coverage check',
        cause: expect.objectContaining({
          message: `Failed to init coverage check: ${status}`,
          httpStatus: status,
        }),
      }),
    );
  });

  it('throws HttpError on init coverage check 4xx responses', async () => {
    const { service, fetchMock } = setup();

    fetchMock.mockResolvedValueOnce({
      status: 401,
    } as unknown as Response);

    await expect(
      service.checkCoverage({ txMeta: generateMockTxMeta() }),
    ).rejects.toMatchObject({ httpStatus: 401 });
  });

  it('does not open the circuit for init coverage check 4xx responses', async () => {
    const { service, fetchMock } = setup({
      policyOptions: { maxConsecutiveFailures: 2 },
    });

    fetchMock
      .mockResolvedValueOnce({ status: 401 } as unknown as Response)
      .mockResolvedValueOnce({ status: 401 } as unknown as Response)
      .mockResolvedValueOnce({ status: 401 } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue(getRandomCoverageResult()),
      } as unknown as Response);

    const txMeta = generateMockTxMeta();
    await expect(service.checkCoverage({ txMeta })).rejects.toThrow(HttpError);
    await expect(service.checkCoverage({ txMeta })).rejects.toThrow(HttpError);
    await expect(service.checkCoverage({ txMeta })).rejects.toThrow(HttpError);

    await expect(service.checkCoverage({ txMeta })).resolves.toMatchObject({
      coverageId: 'coverageId',
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('does not open the circuit when getBearerToken fails during init', async () => {
    let shouldFailAuth = true;
    const { service, fetchMock } = setup({
      policyOptions: { maxConsecutiveFailures: 2 },
      getBearerToken: async () => {
        if (shouldFailAuth) {
          throw new Error('User is not signed in');
        }
        return MOCK_TOKEN;
      },
    });

    const txMeta = generateMockTxMeta();
    await expect(service.checkCoverage({ txMeta })).rejects.toThrow(
      'User is not signed in',
    );
    await expect(service.checkCoverage({ txMeta })).rejects.toThrow(
      'User is not signed in',
    );
    await expect(service.checkCoverage({ txMeta })).rejects.toThrow(
      'User is not signed in',
    );

    shouldFailAuth = false;
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue(getRandomCoverageResult()),
      } as unknown as Response);

    await expect(service.checkCoverage({ txMeta })).resolves.toMatchObject({
      coverageId: 'coverageId',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should throw on check coverage timeout with coverage status', async () => {
    const { service, fetchMock } = setup({
      getCoverageResultTimeout: 0,
      getCoverageResultPollInterval: 0,
    });

    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
    } as unknown as Response);

    fetchMock.mockResolvedValue({
      status: 404,
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    await expect(service.checkCoverage({ txMeta })).rejects.toThrow(
      'Failed to get coverage result: 404',
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('should throw on check coverage timeout', async () => {
    const { service, fetchMock } = setup({
      getCoverageResultTimeout: 0,
      getCoverageResultPollInterval: 0,
    });

    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
    } as unknown as Response);

    fetchMock.mockResolvedValue({
      status: 412,
      json: jest.fn().mockResolvedValue({
        message: 'Results are not available yet',
        statusCode: 412,
      }),
    } as unknown as Response);

    const txMeta = generateMockTxMeta();
    await expect(service.checkCoverage({ txMeta })).rejects.toThrow(
      'Failed to get coverage result: Results are not available yet',
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('returns latency in coverageResult', async () => {
    const { service, fetchMock } = setup();

    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
    } as unknown as Response);

    const result = { status: 'covered', message: 'ok', reasonCode: 'E104' };
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue(result),
    } as unknown as Response);

    let nowValue = 1000;
    const latencyMs = 123;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      const val = nowValue;
      nowValue += latencyMs;
      return val;
    });

    const txMeta = generateMockTxMeta();
    const coverageResult = await service.checkCoverage({ txMeta });
    expect(coverageResult.metrics.latency).toBe(latencyMs);

    nowSpy.mockRestore();
  });

  it('returns latency in signatureCoverageResult', async () => {
    const { service, fetchMock } = setup();

    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
    } as unknown as Response);

    const result = { status: 'covered', message: 'ok', reasonCode: 'E104' };
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: jest.fn().mockResolvedValue(result),
    } as unknown as Response);

    let nowValue = 2000;
    const latencyMs = 456;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      const val = nowValue;
      nowValue += latencyMs;
      return val;
    });

    const signatureRequest = generateMockSignatureRequest();
    const coverageResult = await service.checkSignatureCoverage({
      signatureRequest,
    });
    expect(coverageResult.metrics.latency).toBe(latencyMs);

    nowSpy.mockRestore();
  });

  describe('checkSignatureCoverage', () => {
    it('should check signature coverage', async () => {
      const { service, fetchMock, getBearerToken } = setup();

      const coverageId = 'coverageId';
      fetchMock.mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue({ coverageId }),
      } as unknown as Response);

      const result = getRandomCoverageResult();
      fetchMock.mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue(result),
      } as unknown as Response);

      const signatureRequest = generateMockSignatureRequest();
      const coverageResult = await service.checkSignatureCoverage({
        signatureRequest,
      });
      expect({
        coverageId: coverageResult.coverageId,
        message: result.message,
        reasonCode: result.reasonCode,
        status: result.status,
      }).toStrictEqual({
        coverageId,
        ...result,
      });
      expect(typeof coverageResult.metrics.latency).toBe('number');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(getBearerToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('logSignature', () => {
    it('logs signature', async () => {
      const { service, fetchMock, getBearerToken } = setup();

      fetchMock.mockResolvedValueOnce({ status: 200 } as unknown as Response);

      await service.logSignature({
        signatureRequest: generateMockSignatureRequest(),
        signature: '0x00',
        status: 'shown',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getBearerToken).toHaveBeenCalledTimes(1);
    });

    it('throws on status 500', async () => {
      const { service, fetchMock } = setup();

      fetchMock.mockResolvedValueOnce({ status: 500 } as unknown as Response);

      await expect(
        service.logSignature({
          signatureRequest: generateMockSignatureRequest(),
          signature: '0x00',
          status: 'shown',
        }),
      ).rejects.toThrow('Failed to log signature: 500');

      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to log signature',
          cause: expect.objectContaining({
            message: 'Failed to log signature: 500',
            httpStatus: 500,
          }),
        }),
      );
    });

    it('throws HttpError on 4xx responses', async () => {
      const { service, fetchMock } = setup();

      fetchMock.mockResolvedValueOnce({ status: 401 } as unknown as Response);

      await expect(
        service.logSignature({
          signatureRequest: generateMockSignatureRequest(),
          signature: '0x00',
          status: 'shown',
        }),
      ).rejects.toMatchObject({ httpStatus: 401 });
    });

    it('does not open the circuit for 4xx responses', async () => {
      const { service, fetchMock } = setup({
        policyOptions: { maxConsecutiveFailures: 2 },
      });

      fetchMock
        .mockResolvedValueOnce({ status: 401 } as unknown as Response)
        .mockResolvedValueOnce({ status: 401 } as unknown as Response)
        .mockResolvedValueOnce({ status: 401 } as unknown as Response)
        .mockResolvedValueOnce({ status: 200 } as unknown as Response);

      const request = {
        signatureRequest: generateMockSignatureRequest(),
        signature: '0x00',
        status: 'shown' as const,
      };

      await expect(service.logSignature(request)).rejects.toThrow(HttpError);
      await expect(service.logSignature(request)).rejects.toThrow(HttpError);
      await expect(service.logSignature(request)).rejects.toThrow(HttpError);
      await expect(service.logSignature(request)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('logTransaction', () => {
    it('logs transaction', async () => {
      const { service, fetchMock, getBearerToken } = setup();

      fetchMock.mockResolvedValueOnce({ status: 200 } as unknown as Response);

      await service.logTransaction({
        txMeta: generateMockTxMeta(),
        transactionHash: '0x00',
        rawTransactionHex: '0xdeadbeef',
        status: 'shown',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getBearerToken).toHaveBeenCalledTimes(1);
    });

    it('throws on status 500', async () => {
      const { service, fetchMock } = setup();

      fetchMock.mockResolvedValueOnce({ status: 500 } as unknown as Response);

      await expect(
        service.logTransaction({
          txMeta: generateMockTxMeta(),
          transactionHash: '0x00',
          rawTransactionHex: '0xdeadbeef',
          status: 'shown',
        }),
      ).rejects.toThrow('Failed to log transaction: 500');
    });

    it('throws HttpError on 4xx responses', async () => {
      const { service, fetchMock } = setup();

      fetchMock.mockResolvedValueOnce({ status: 403 } as unknown as Response);

      await expect(
        service.logTransaction({
          txMeta: generateMockTxMeta(),
          transactionHash: '0x00',
          rawTransactionHex: '0xdeadbeef',
          status: 'shown',
        }),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });

    it('does not open the circuit for 4xx responses', async () => {
      const { service, fetchMock } = setup({
        policyOptions: { maxConsecutiveFailures: 2 },
      });

      fetchMock
        .mockResolvedValueOnce({ status: 403 } as unknown as Response)
        .mockResolvedValueOnce({ status: 403 } as unknown as Response)
        .mockResolvedValueOnce({ status: 403 } as unknown as Response)
        .mockResolvedValueOnce({ status: 200 } as unknown as Response);

      const request = {
        txMeta: generateMockTxMeta(),
        transactionHash: '0x00',
        rawTransactionHex: '0xdeadbeef',
        status: 'shown' as const,
      };

      await expect(service.logTransaction(request)).rejects.toThrow(HttpError);
      await expect(service.logTransaction(request)).rejects.toThrow(HttpError);
      await expect(service.logTransaction(request)).rejects.toThrow(HttpError);
      await expect(service.logTransaction(request)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('does not open the circuit when getBearerToken fails', async () => {
      let shouldFailAuth = true;
      const { service, fetchMock } = setup({
        policyOptions: { maxConsecutiveFailures: 2 },
        getBearerToken: async () => {
          if (shouldFailAuth) {
            throw new Error('User is not signed in');
          }
          return MOCK_TOKEN;
        },
      });

      const request = {
        txMeta: generateMockTxMeta(),
        transactionHash: '0x00',
        rawTransactionHex: '0xdeadbeef',
        status: 'shown' as const,
      };

      await expect(service.logTransaction(request)).rejects.toThrow(
        'User is not signed in',
      );
      await expect(service.logTransaction(request)).rejects.toThrow(
        'User is not signed in',
      );
      await expect(service.logTransaction(request)).rejects.toThrow(
        'User is not signed in',
      );

      shouldFailAuth = false;
      fetchMock.mockResolvedValueOnce({ status: 200 } as unknown as Response);

      await expect(service.logTransaction(request)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
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

  describe('makeInitCoverageCheckBody', () => {
    it('makes init coverage check body', () => {
      const txMeta = generateMockTxMeta();
      const body = makeInitCoverageCheckBody(txMeta);
      expect(body).toMatchObject({
        txParams: [txMeta.txParams],
      });
    });

    it('makes init coverage check body with authorization list', () => {
      const txMeta = generateMockTxMeta();
      const body = makeInitCoverageCheckBody({
        ...txMeta,
        txParams: {
          ...txMeta.txParams,
          authorizationList: [
            {
              address: '0x0000000000000000000000000000000000000000',
            },
          ],
        },
      });
      expect(body).toMatchObject({
        txParams: [
          {
            ...txMeta.txParams,
            authorizationList: [
              {
                address: '0x0000000000000000000000000000000000000000',
              },
            ],
          },
        ],
      });
    });
  });

  describe('authentication', () => {
    it('uses AuthenticationController:getBearerToken for requests', async () => {
      const fetchMock = jest.spyOn(global, 'fetch') as jest.MockedFunction<
        typeof fetch
      >;
      fetchMock.mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue({ coverageId: 'coverageId' }),
      } as unknown as Response);
      fetchMock.mockResolvedValueOnce({
        status: 200,
        json: jest.fn().mockResolvedValue(getRandomCoverageResult()),
      } as unknown as Response);

      const { service, getBearerToken } = createService({
        getBearerToken: async () => 'bearer-token',
      });

      await service.checkCoverage({ txMeta: generateMockTxMeta() });

      expect(getBearerToken).toHaveBeenCalled();
      const [url, requestInit] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toStrictEqual(
        expect.stringContaining(SHIELD_API_URL_MAP[Env.PRD]),
      );
      expect(requestInit.headers).toMatchObject({
        Authorization: 'Bearer bearer-token',
      });
    });
  });
});

describe('getShieldApiBaseUrl', () => {
  it.each(Object.values(Env))('returns the base URL for %s', (env) => {
    expect(getShieldApiBaseUrl(env)).toBe(SHIELD_API_URL_MAP[env]);
  });

  it('throws on an invalid environment', () => {
    expect(() => getShieldApiBaseUrl('invalid' as Env)).toThrow(
      'invalid environment configuration',
    );
  });
});
