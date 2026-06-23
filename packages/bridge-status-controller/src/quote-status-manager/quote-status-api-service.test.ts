import { BridgeClientId, BridgeStatusControllerMessenger } from '../types';
import {
  QuoteStatusUpdateBackendErrorType,
  QuoteStatusUpdateBackendStatus,
  QuoteStatusUpdateWithRetryOutcomeType,
} from './constants';
import { QuoteStatusApiService } from './quote-status-api-service';
import type { QuoteStatusApiServiceOptions } from './types';

const API_BASE_URL = 'https://bridge.api.test';

const REQUEST_DATA = {
  quoteId: 'quote-1',
  srcTxHash: '0xabc',
  newStatus: QuoteStatusUpdateBackendStatus.Submitted,
};

/**
 * Builds a minimal fake `Response` for the mocked `fetch`.
 *
 * @param options - Response configuration.
 * @param options.ok - Whether the response represents a 2xx status.
 * @param options.body - Optional JSON body returned by `res.json()`.
 * @returns A fake response with `ok` and `json`.
 */
function createFetchResponse({
  ok,
  body,
}: {
  ok: boolean;
  body?: unknown;
}): Response {
  return {
    ok,
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
      expect(error.message).toBe(
        'unexpected response shape from quote/updateStatus',
      );
      expect(error.details).toStrictEqual({ quoteId: REQUEST_DATA.quoteId });
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

      expect(outcome.type).toBe(QuoteStatusUpdateWithRetryOutcomeType.Accepted);
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
        QuoteStatusUpdateWithRetryOutcomeType.NonRetryable,
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
        QuoteStatusUpdateWithRetryOutcomeType.RetryableExhausted,
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

      expect(outcome.type).toBe(QuoteStatusUpdateWithRetryOutcomeType.Accepted);
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
        QuoteStatusUpdateWithRetryOutcomeType.Interrupted,
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
        QuoteStatusUpdateWithRetryOutcomeType.Interrupted,
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
        QuoteStatusUpdateWithRetryOutcomeType.Interrupted,
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
        QuoteStatusUpdateWithRetryOutcomeType.Interrupted,
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
});
