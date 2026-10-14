import { StatusTypes } from '@metamask/bridge-controller';

import { BridgeClientId, BridgeStatusControllerMessenger } from '../types.js';
import {
  QuoteStatusUpdateBackendErrorType,
  QuoteStatusBackendStatus,
  QuoteStatusFetchWithRetryOutcomeType,
} from './constants.js';
import { QuoteStatusGetError, QuoteStatusUpdateError } from './errors.js';
import { QuoteStatusApiService } from './quote-status-api-service.js';
import type {
  QuoteStatusApiServiceOptions,
  QuoteStatusGetResponse,
} from './types.js';
import * as validators from './validators.js';

const API_BASE_URL = 'https://bridge.api.test';

const REQUEST_DATA = {
  quoteId: 'quote-1',
  srcTxHash: '0xabc',
  newStatus: QuoteStatusBackendStatus.Submitted,
};

const GET_REQUEST_DATA = {
  quoteId: 'quote-1',
};

const GET_RESPONSE_BODY: QuoteStatusGetResponse = {
  submittedTx: {
    status: StatusTypes.SUBMITTED,
    srcChain: {
      chainId: 1,
    },
  },
};

function createFetchResponse({
  ok,
  body,
  status = ok ? 200 : 500,
  statusText = ok ? 'OK' : 'Internal Server Error',
}: {
  ok: boolean;
  body?: unknown;
  status?: number;
  statusText?: string;
}): Response {
  return {
    ok,
    status,
    statusText,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

/**
 * Creates a messenger stub whose `call` resolves the given bearer token.
 *
 * @param token - The bearer token to resolve, or a rejection to simulate failure.
 * @returns An object exposing the stub messenger and its `call` mock.
 */
function createMessenger(token: string | undefined = 'test-jwt'): {
  messenger: BridgeStatusControllerMessenger;
  call: jest.Mock;
} {
  const call = jest.fn().mockResolvedValue(token);
  const messenger = { call } as unknown as BridgeStatusControllerMessenger;
  return { messenger, call };
}

/**
 * Builds a {@link QuoteStatusApiService} with sensible test defaults.
 *
 * @param overrides - Partial options to override the defaults.
 * @returns The constructed service and the options used to build it.
 */
function createService(overrides: Partial<QuoteStatusApiServiceOptions> = {}): {
  service: QuoteStatusApiService;
  onError: jest.Mock;
  messengerCall: jest.Mock;
} {
  const { messenger, call } = createMessenger();
  const onError = jest.fn();

  const options: QuoteStatusApiServiceOptions = {
    messenger,
    clientId: BridgeClientId.EXTENSION,
    clientProduct: 'test-product',
    apiBaseUrl: API_BASE_URL,
    onError,
    ...overrides,
  };

  return {
    service: new QuoteStatusApiService(options),
    onError,
    messengerCall: call,
  };
}

describe('QuoteStatusApiService', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateQuoteStatus', () => {
    it('returns null for a 2xx response', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const { service } = createService();

      const result = await service.updateQuoteStatus(REQUEST_DATA);

      expect(result).toBeNull();
    });

    it('sends a POST request to the updateStatus endpoint with the payload as the body', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const { service } = createService();

      await service.updateQuoteStatus(REQUEST_DATA);

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE_URL}/quote/updateStatus`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(REQUEST_DATA),
        }),
      );
    });

    it('sends the client product, content type, and authorization headers', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const { service } = createService();

      await service.updateQuoteStatus(REQUEST_DATA);

      const { headers } = fetchSpy.mock.calls[0][1];
      expect(headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-metamask-clientproduct': 'test-product',
        'X-Client-Id': BridgeClientId.EXTENSION,
        Authorization: 'Bearer test-jwt',
      });
    });

    it('includes the client version header when configured', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const { service } = createService({ clientVersion: '1.2.3' });

      await service.updateQuoteStatus(REQUEST_DATA);

      const { headers } = fetchSpy.mock.calls[0][1];
      expect(headers).toMatchObject({ 'x-metamask-clientversion': '1.2.3' });
    });

    it('omits the client version header when not configured', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const { service } = createService();

      await service.updateQuoteStatus(REQUEST_DATA);

      const { headers } = fetchSpy.mock.calls[0][1];
      expect(headers).not.toHaveProperty('x-metamask-clientversion');
    });

    it('omits the authorization header when no JWT is available', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const messenger = {
        call: jest.fn().mockRejectedValue(new Error('no token')),
      } as unknown as BridgeStatusControllerMessenger;
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { service } = createService({ messenger });

      await service.updateQuoteStatus(REQUEST_DATA);

      const { headers } = fetchSpy.mock.calls[0][1];
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('forwards the abort signal to fetch', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const { service } = createService();
      const controller = new AbortController();

      await service.updateQuoteStatus(REQUEST_DATA, controller.signal);

      expect(fetchSpy.mock.calls[0][1].signal).toBe(controller.signal);
    });

    it('returns the validated error response for a non-2xx response', async () => {
      const errorBody = {
        statusCode: 404,
        message: 'quote not found',
        type: QuoteStatusUpdateBackendErrorType.QuoteNotFound,
      };
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: false, body: errorBody }),
      );
      const { service } = createService();

      const result = await service.updateQuoteStatus(REQUEST_DATA);

      expect(result).toStrictEqual(errorBody);
    });

    it('throws and notifies onError when the error response shape is unexpected', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: false, body: { unexpected: true } }),
      );
      const { service, onError } = createService();

      await expect(service.updateQuoteStatus(REQUEST_DATA)).rejects.toThrow(
        'Expected the value to satisfy a union of',
      );
      expect(onError).toHaveBeenCalledTimes(1);
      const [error] = onError.mock.calls[0];
      expect(error).toBeInstanceOf(QuoteStatusUpdateError);
      expect(error.message).toBe(
        'unexpected response shape from quote/updateStatus',
      );
      expect(error.details).toStrictEqual({
        quoteId: REQUEST_DATA.quoteId,
        srcTxHash: REQUEST_DATA.srcTxHash,
      });
    });

    it('throws on an unexpected error response shape when no onError callback is provided', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: false, body: { unexpected: true } }),
      );
      const { service } = createService({ onError: undefined });

      await expect(service.updateQuoteStatus(REQUEST_DATA)).rejects.toThrow(
        'Expected the value to satisfy a union of',
      );
    });
  });

  describe('updateQuoteStatusWithRetry', () => {
    const RETRY_OPTIONS = { maxRetries: 2, delayMsBetweenRetries: 0 };

    it('returns an Accepted outcome when the update succeeds on the first attempt', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const { service } = createService();

      const outcome = await service.updateQuoteStatusWithRetry(
        REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(QuoteStatusFetchWithRetryOutcomeType.Accepted);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns a NonRetryable outcome with the response for a non-retryable error', async () => {
      const errorBody = {
        statusCode: 404,
        message: 'quote not found',
        type: QuoteStatusUpdateBackendErrorType.QuoteNotFound,
      };
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: false, body: errorBody }),
      );
      const { service } = createService();

      const outcome = await service.updateQuoteStatusWithRetry(
        REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
      );
      expect(outcome.response).toStrictEqual(errorBody);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('retries on a retryable error and returns RetryableExhausted after all attempts', async () => {
      const errorBody = {
        statusCode: 409,
        message: 'concurrent update',
        type: QuoteStatusUpdateBackendErrorType.ConcurrentUpdate,
      };
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: false, body: errorBody }),
      );
      const { service } = createService();

      const outcome = await service.updateQuoteStatusWithRetry(
        REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
      );
      expect(fetchSpy).toHaveBeenCalledTimes(RETRY_OPTIONS.maxRetries + 1);
    });

    it('returns Accepted when a retryable error is followed by a success', async () => {
      const errorBody = {
        statusCode: 409,
        message: 'concurrent update',
        type: QuoteStatusUpdateBackendErrorType.ConcurrentUpdate,
      };
      fetchSpy
        .mockResolvedValueOnce(
          createFetchResponse({ ok: false, body: errorBody }),
        )
        .mockResolvedValueOnce(createFetchResponse({ ok: true }));
      const { service } = createService();

      const outcome = await service.updateQuoteStatusWithRetry(
        REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(QuoteStatusFetchWithRetryOutcomeType.Accepted);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('returns Interrupted when the signal is already aborted', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const { service } = createService();
      const controller = new AbortController();
      controller.abort();

      const outcome = await service.updateQuoteStatusWithRetry(
        REQUEST_DATA,
        RETRY_OPTIONS,
        controller.signal,
      );

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.Interrupted,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns Interrupted when retry returns false before the first attempt', async () => {
      fetchSpy.mockResolvedValue(createFetchResponse({ ok: true }));
      const { service } = createService();

      const outcome = await service.updateQuoteStatusWithRetry(REQUEST_DATA, {
        ...RETRY_OPTIONS,
        retry: () => false,
      });

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.Interrupted,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('stops retrying once retry returns false between attempts', async () => {
      const errorBody = {
        statusCode: 409,
        message: 'concurrent update',
        type: QuoteStatusUpdateBackendErrorType.ConcurrentUpdate,
      };
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: false, body: errorBody }),
      );
      const { service } = createService();
      let proceed = true;

      const outcome = await service.updateQuoteStatusWithRetry(REQUEST_DATA, {
        ...RETRY_OPTIONS,
        // Allow the first attempt, then stop before the retry.
        retry: () => {
          const current = proceed;
          proceed = false;
          return current;
        },
      });

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.Interrupted,
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns Interrupted when fetch rejects after the signal is aborted', async () => {
      const controller = new AbortController();
      fetchSpy.mockImplementation(async () => {
        controller.abort();
        throw new Error('aborted');
      });
      const { service } = createService();

      const outcome = await service.updateQuoteStatusWithRetry(
        REQUEST_DATA,
        RETRY_OPTIONS,
        controller.signal,
      );

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.Interrupted,
      );
    });

    it('rethrows when fetch rejects and the signal is not aborted', async () => {
      fetchSpy.mockRejectedValue(new Error('network failure'));
      const { service } = createService();

      await expect(
        service.updateQuoteStatusWithRetry(REQUEST_DATA, RETRY_OPTIONS),
      ).rejects.toThrow('network failure');
    });
  });

  describe('getQuoteStatus', () => {
    it('returns the validated response for a 2xx response', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      const { service } = createService();

      const result = await service.getQuoteStatus(GET_REQUEST_DATA);

      expect(result).toStrictEqual(GET_RESPONSE_BODY);
    });

    it('sends a GET request to the getQuoteStatus endpoint with the quoteId query param', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      const { service } = createService();

      await service.getQuoteStatus(GET_REQUEST_DATA);

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE_URL}/getQuoteStatus?quoteId=${GET_REQUEST_DATA.quoteId}`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('sends the client product, content type, and authorization headers', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      const { service } = createService();

      await service.getQuoteStatus(GET_REQUEST_DATA);

      const { headers } = fetchSpy.mock.calls[0][1];
      expect(headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-metamask-clientproduct': 'test-product',
        'X-Client-Id': BridgeClientId.EXTENSION,
        Authorization: 'Bearer test-jwt',
      });
    });

    it('includes the client version header when configured', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      const { service } = createService({ clientVersion: '1.2.3' });

      await service.getQuoteStatus(GET_REQUEST_DATA);

      const { headers } = fetchSpy.mock.calls[0][1];
      expect(headers).toMatchObject({ 'x-metamask-clientversion': '1.2.3' });
    });

    it('omits the client version header when not configured', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      const { service } = createService();

      await service.getQuoteStatus(GET_REQUEST_DATA);

      const { headers } = fetchSpy.mock.calls[0][1];
      expect(headers).not.toHaveProperty('x-metamask-clientversion');
    });

    it('omits the authorization header when no JWT is available', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      const messenger = {
        call: jest.fn().mockRejectedValue(new Error('no token')),
      } as unknown as BridgeStatusControllerMessenger;
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { service } = createService({ messenger });

      await service.getQuoteStatus(GET_REQUEST_DATA);

      const { headers } = fetchSpy.mock.calls[0][1];
      expect(headers).not.toHaveProperty('Authorization');
    });

    it('forwards the abort signal to fetch', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      const { service } = createService();
      const controller = new AbortController();

      await service.getQuoteStatus(GET_REQUEST_DATA, controller.signal);

      expect(fetchSpy.mock.calls[0][1].signal).toBe(controller.signal);
    });

    it('throws QuoteStatusGetError and notifies onError for a non-2xx response', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      );
      const { service, onError } = createService();

      await expect(service.getQuoteStatus(GET_REQUEST_DATA)).rejects.toThrow(
        QuoteStatusGetError,
      );
      expect(onError).toHaveBeenCalledTimes(1);
      const [error] = onError.mock.calls[0];
      expect(error).toBeInstanceOf(QuoteStatusGetError);
      expect(error.message).toBe(
        'request error to getQuoteStatus [404: Not Found]',
      );
      expect(error.details).toStrictEqual({
        quoteId: GET_REQUEST_DATA.quoteId,
      });
    });

    it('sets retryable=false on the error for 4xx responses', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      );
      const { service } = createService();

      const thrown = await service
        .getQuoteStatus(GET_REQUEST_DATA)
        .catch((error) => error);

      expect(thrown).toBeInstanceOf(QuoteStatusGetError);
      expect(thrown.retryable).toBe(false);
    });

    it('sets retryable=true on the error for 5xx responses', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        }),
      );
      const { service } = createService();

      const thrown = await service
        .getQuoteStatus(GET_REQUEST_DATA)
        .catch((error) => error);

      expect(thrown).toBeInstanceOf(QuoteStatusGetError);
      expect(thrown.retryable).toBe(true);
    });

    it('sets retryable=false on validation-failure errors', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({
          ok: true,
          body: { submittedTx: { status: 'NOT_A_STATUS_TYPE' } },
        }),
      );
      const { service } = createService();

      const thrown = await service
        .getQuoteStatus(GET_REQUEST_DATA)
        .catch((error) => error);

      expect(thrown).toBeInstanceOf(QuoteStatusGetError);
      expect(thrown.retryable).toBe(false);
    });

    it('throws and notifies onError when the success response shape is unexpected', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({
          ok: true,
          body: {
            submittedTx: {
              status: 'NOT_A_STATUS_TYPE',
            },
          },
        }),
      );
      const { service, onError } = createService();

      await expect(service.getQuoteStatus(GET_REQUEST_DATA)).rejects.toThrow(
        'unexpected response shape from getQuoteStatus',
      );
      expect(onError).toHaveBeenCalledTimes(1);
      const [error] = onError.mock.calls[0];
      expect(error).toBeInstanceOf(QuoteStatusGetError);
      expect(error.message).toBe(
        'unexpected response shape from getQuoteStatus',
      );
      expect(error.details).toStrictEqual({
        quoteId: GET_REQUEST_DATA.quoteId,
        validationFailures: expect.arrayContaining([
          expect.stringContaining('submittedTx.status'),
        ]),
      });
    });

    it('throws on an unexpected success response shape when no onError callback is provided', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({
          ok: true,
          body: {
            submittedTx: {
              status: 'NOT_A_STATUS_TYPE',
            },
          },
        }),
      );
      const { service } = createService({ onError: undefined });

      await expect(service.getQuoteStatus(GET_REQUEST_DATA)).rejects.toThrow(
        'unexpected response shape from getQuoteStatus',
      );
    });

    it('re-throws a non-StructError thrown during validation without calling onError', async () => {
      const nonStructError = new Error('unexpected validator crash');
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      jest
        .spyOn(validators, 'validateQuoteStatusGetResponse')
        .mockImplementationOnce(() => {
          throw nonStructError;
        });
      const { service, onError } = createService();

      await expect(service.getQuoteStatus(GET_REQUEST_DATA)).rejects.toThrow(
        nonStructError,
      );
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('getQuoteStatusWithRetry', () => {
    const RETRY_OPTIONS = { maxRetries: 2, delayMsBetweenRetries: 0 };

    it('returns an Accepted outcome with the response when the fetch succeeds on the first attempt', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      const { service } = createService();

      const outcome = await service.getQuoteStatusWithRetry(
        GET_REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(QuoteStatusFetchWithRetryOutcomeType.Accepted);
      expect(outcome.response).toStrictEqual(GET_RESPONSE_BODY);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns NonRetryable with the error when getQuoteStatus throws a non-retryable QuoteStatusGetError', async () => {
      const { service } = createService();
      const quoteStatusGetError = new QuoteStatusGetError(
        'api error',
        { quoteId: GET_REQUEST_DATA.quoteId },
        false, // non-retryable (e.g. 4xx or validation failure)
      );
      jest
        .spyOn(service, 'getQuoteStatus')
        .mockRejectedValue(quoteStatusGetError);

      const outcome = await service.getQuoteStatusWithRetry(
        GET_REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
      );
      expect(outcome.error).toBe(quoteStatusGetError);
    });

    it('does not retry when getQuoteStatus throws a non-retryable QuoteStatusGetError', async () => {
      const { service } = createService();
      const quoteStatusGetError = new QuoteStatusGetError(
        'api error',
        { quoteId: GET_REQUEST_DATA.quoteId },
        false,
      );
      const getQuoteStatusSpy = jest
        .spyOn(service, 'getQuoteStatus')
        .mockRejectedValue(quoteStatusGetError);

      await service.getQuoteStatusWithRetry(GET_REQUEST_DATA, RETRY_OPTIONS);

      // Non-retryable errors short-circuit immediately; only 1 attempt.
      expect(getQuoteStatusSpy).toHaveBeenCalledTimes(1);
    });

    it('retries and returns RetryableExhausted when getQuoteStatus always throws a retryable QuoteStatusGetError', async () => {
      const { service } = createService();
      const retryableError = new QuoteStatusGetError(
        'request error to getQuoteStatus [500: Internal Server Error]',
        { quoteId: GET_REQUEST_DATA.quoteId },
        true, // retryable (5xx)
      );
      const getQuoteStatusSpy = jest
        .spyOn(service, 'getQuoteStatus')
        .mockRejectedValue(retryableError);

      const outcome = await service.getQuoteStatusWithRetry(
        GET_REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
      );
      expect(getQuoteStatusSpy).toHaveBeenCalledTimes(
        RETRY_OPTIONS.maxRetries + 1,
      );
    });

    it('returns Accepted when a retryable error is followed by a success', async () => {
      const { service } = createService();
      const retryableError = new QuoteStatusGetError(
        'request error to getQuoteStatus [503: Service Unavailable]',
        { quoteId: GET_REQUEST_DATA.quoteId },
        true,
      );
      const getQuoteStatusSpy = jest
        .spyOn(service, 'getQuoteStatus')
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce(GET_RESPONSE_BODY);

      const outcome = await service.getQuoteStatusWithRetry(
        GET_REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(QuoteStatusFetchWithRetryOutcomeType.Accepted);
      expect(outcome.response).toStrictEqual(GET_RESPONSE_BODY);
      expect(getQuoteStatusSpy).toHaveBeenCalledTimes(2);
    });

    it('returns RetryableExhausted after all attempts fail with a non-QuoteStatusGetError', async () => {
      const { service } = createService();
      const getQuoteStatusSpy = jest
        .spyOn(service, 'getQuoteStatus')
        .mockRejectedValue(new Error('network error'));

      const outcome = await service.getQuoteStatusWithRetry(
        GET_REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
      );
      expect(getQuoteStatusSpy).toHaveBeenCalledTimes(
        RETRY_OPTIONS.maxRetries + 1,
      );
    });

    it('returns Accepted when failures are followed by a success', async () => {
      const { service } = createService();
      const getQuoteStatusSpy = jest
        .spyOn(service, 'getQuoteStatus')
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce(GET_RESPONSE_BODY);

      const outcome = await service.getQuoteStatusWithRetry(
        GET_REQUEST_DATA,
        RETRY_OPTIONS,
      );

      expect(outcome.type).toBe(QuoteStatusFetchWithRetryOutcomeType.Accepted);
      expect(outcome.response).toStrictEqual(GET_RESPONSE_BODY);
      expect(getQuoteStatusSpy).toHaveBeenCalledTimes(2);
    });

    it('returns Interrupted when the signal is already aborted', async () => {
      fetchSpy.mockResolvedValue(
        createFetchResponse({ ok: true, body: GET_RESPONSE_BODY }),
      );
      const { service } = createService();
      const controller = new AbortController();
      controller.abort();

      const outcome = await service.getQuoteStatusWithRetry(
        GET_REQUEST_DATA,
        RETRY_OPTIONS,
        controller.signal,
      );

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.Interrupted,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns Interrupted when getQuoteStatus rejects after the signal is aborted', async () => {
      const controller = new AbortController();
      fetchSpy.mockImplementation(async () => {
        controller.abort();
        throw new Error('aborted');
      });
      const { service } = createService();

      const outcome = await service.getQuoteStatusWithRetry(
        GET_REQUEST_DATA,
        RETRY_OPTIONS,
        controller.signal,
      );

      expect(outcome.type).toBe(
        QuoteStatusFetchWithRetryOutcomeType.Interrupted,
      );
    });

    it('forwards the abort signal to getQuoteStatus', async () => {
      const { service } = createService();
      const controller = new AbortController();
      const getQuoteStatusSpy = jest
        .spyOn(service, 'getQuoteStatus')
        .mockResolvedValue(GET_RESPONSE_BODY);

      await service.getQuoteStatusWithRetry(
        GET_REQUEST_DATA,
        RETRY_OPTIONS,
        controller.signal,
      );

      expect(getQuoteStatusSpy).toHaveBeenCalledWith(
        GET_REQUEST_DATA,
        controller.signal,
      );
    });
  });
});
