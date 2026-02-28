import { HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { GeolocationApiServiceMessenger } from './geolocation-api-service';
import {
  GeolocationApiService,
  UNKNOWN_LOCATION,
} from './geolocation-api-service';
import { Env } from '../types';

describe('GeolocationApiService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('GeolocationApiService:fetchGeolocation', () => {
    it('returns the fetched country code', async () => {
      const { rootMessenger } = getService({
        options: { fetch: createMockFetch('GB') },
      });

      const result = await rootMessenger.call(
        'GeolocationApiService:fetchGeolocation',
      );

      expect(result).toBe('GB');
    });

    it('fetches from the production URL by default', async () => {
      const mockFetch = createMockFetch('FR');
      const { rootMessenger } = getService({
        options: { fetch: mockFetch },
      });

      await rootMessenger.call('GeolocationApiService:fetchGeolocation');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://on-ramp.api.cx.metamask.io/geolocation',
      );
    });

    it('fetches from the UAT URL when env is UAT', async () => {
      const mockFetch = createMockFetch('FR');
      const { rootMessenger } = getService({
        options: { fetch: mockFetch, env: Env.UAT },
      });

      await rootMessenger.call('GeolocationApiService:fetchGeolocation');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://on-ramp.uat-api.cx.metamask.io/geolocation',
      );
    });

    it('fetches from the DEV URL when env is DEV', async () => {
      const mockFetch = createMockFetch('FR');
      const { rootMessenger } = getService({
        options: { fetch: mockFetch, env: Env.DEV },
      });

      await rootMessenger.call('GeolocationApiService:fetchGeolocation');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://on-ramp.dev-api.cx.metamask.io/geolocation',
      );
    });
  });

  describe('fetchGeolocation', () => {
    it('returns the same result as the messenger action', async () => {
      const mockFetch = createMockFetch('GB');
      const { service } = getService({ options: { fetch: mockFetch } });

      const result = await service.fetchGeolocation();

      expect(result).toBe('GB');
    });

    describe('cache', () => {
      it('returns cached value when TTL has not expired', async () => {
        const mockFetch = createMockFetch('US');
        const { service } = getService({ options: { fetch: mockFetch } });

        const first = await service.fetchGeolocation();
        expect(first).toBe('US');
        expect(mockFetch).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(4 * 60 * 1000);

        const second = await service.fetchGeolocation();
        expect(second).toBe('US');
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('re-fetches when TTL has expired', async () => {
        const mockFetch = createMockFetch('US');
        const { service } = getService({ options: { fetch: mockFetch } });

        await service.fetchGeolocation();
        expect(mockFetch).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(5 * 60 * 1000 + 1);

        await service.fetchGeolocation();
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('uses the provided TTL instead of the default', async () => {
        const mockFetch = createMockFetch('US');
        const { service } = getService({
          options: { fetch: mockFetch, ttlMs: 100 },
        });

        await service.fetchGeolocation();
        expect(mockFetch).toHaveBeenCalledTimes(1);

        await service.fetchGeolocation();
        expect(mockFetch).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(101);

        await service.fetchGeolocation();
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('does not cache UNKNOWN responses', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementationOnce(() =>
            Promise.resolve(createMockResponse('', 200)),
          )
          .mockImplementationOnce(() =>
            Promise.resolve(createMockResponse('US', 200)),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const first = await service.fetchGeolocation();
        expect(first).toBe(UNKNOWN_LOCATION);
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const second = await service.fetchGeolocation();
        expect(second).toBe('US');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    describe('promise deduplication', () => {
      it('shares a single in-flight request across concurrent callers', async () => {
        const mockFetch = createMockFetch('IT');
        const { service } = getService({ options: { fetch: mockFetch } });

        const [result1, result2, result3] = await Promise.all([
          service.fetchGeolocation(),
          service.fetchGeolocation(),
          service.fetchGeolocation(),
        ]);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(result1).toBe('IT');
        expect(result2).toBe('IT');
        expect(result3).toBe('IT');
      });
    });

    describe('when the fetch fails', () => {
      it('throws the network error', async () => {
        const mockFetch = jest
          .fn()
          .mockRejectedValue(new Error('Network error'));
        const { service } = getService({
          options: {
            fetch: mockFetch,
            policyOptions: { maxRetries: 0 },
          },
        });

        await expect(service.fetchGeolocation()).rejects.toThrow(
          'Network error',
        );
      });

      it('throws an HttpError on non-OK response', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('', 500)),
          );
        const { service } = getService({
          options: {
            fetch: mockFetch,
            policyOptions: { maxRetries: 0 },
          },
        });

        await expect(service.fetchGeolocation()).rejects.toThrow(
          'Geolocation fetch failed: 500',
        );
      });

      it('rethrows non-Error values as-is', async () => {
        const mockFetch = jest.fn().mockRejectedValue('string error');
        const { service } = getService({
          options: {
            fetch: mockFetch,
            policyOptions: { maxRetries: 0 },
          },
        });

        await expect(service.fetchGeolocation()).rejects.toBe('string error');
      });
    });

    describe('response validation', () => {
      it('returns UNKNOWN_LOCATION for an empty response body', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('', 200)),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const result = await service.fetchGeolocation();

        expect(result).toBe(UNKNOWN_LOCATION);
      });

      it('trims whitespace from the response body', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('  US  \n', 200)),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const result = await service.fetchGeolocation();

        expect(result).toBe('US');
      });

      it('returns UNKNOWN_LOCATION for non-ISO-3166-1 alpha-2 responses', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('<html>error page</html>', 200)),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const result = await service.fetchGeolocation();

        expect(result).toBe(UNKNOWN_LOCATION);
      });

      it('returns UNKNOWN_LOCATION for lowercase country codes', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('us', 200)),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const result = await service.fetchGeolocation();

        expect(result).toBe(UNKNOWN_LOCATION);
      });

      it('returns UNKNOWN_LOCATION for three-letter codes', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('USA', 200)),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const result = await service.fetchGeolocation();

        expect(result).toBe(UNKNOWN_LOCATION);
      });
    });

    describe('bypassCache', () => {
      it('forces a new fetch even when the cache is valid', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementationOnce(() =>
            Promise.resolve(createMockResponse('US', 200)),
          )
          .mockImplementationOnce(() =>
            Promise.resolve(createMockResponse('GB', 200)),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const first = await service.fetchGeolocation();
        expect(first).toBe('US');
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const second = await service.fetchGeolocation({ bypassCache: true });
        expect(second).toBe('GB');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('does not let a stale in-flight fetch overwrite the refreshed cache', async () => {
        let resolveOldFetch: (value: Response) => void = () => undefined;
        let resolveNewFetch: (value: Response) => void = () => undefined;

        const mockFetch = jest
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<Response>((resolve) => {
                resolveOldFetch = resolve;
              }),
          )
          .mockImplementationOnce(
            () =>
              new Promise<Response>((resolve) => {
                resolveNewFetch = resolve;
              }),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const oldPromise = service.fetchGeolocation();

        const refreshPromise = service.fetchGeolocation({ bypassCache: true });
        expect(mockFetch).toHaveBeenCalledTimes(2);

        resolveNewFetch(createMockResponse('GB', 200));
        const refreshResult = await refreshPromise;
        expect(refreshResult).toBe('GB');

        resolveOldFetch(createMockResponse('US', 200));
        await oldPromise;

        const cached = await service.fetchGeolocation();
        expect(cached).toBe('GB');
      });

      it('preserves deduplication for the refresh fetch after the old finally block runs', async () => {
        let resolveOldFetch: (value: Response) => void = () => undefined;

        const mockFetch = jest
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<Response>((resolve) => {
                resolveOldFetch = resolve;
              }),
          )
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('FR', 200)),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const oldPromise = service.fetchGeolocation();

        const refreshPromise = service.fetchGeolocation({ bypassCache: true });

        resolveOldFetch(createMockResponse('US', 200));
        await oldPromise;
        await refreshPromise;

        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('does not let a stale in-flight error affect the refreshed cache', async () => {
        let rejectOldFetch: (reason: Error) => void = () => undefined;

        const mockFetch = jest
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<Response>((_resolve, reject) => {
                rejectOldFetch = reject;
              }),
          )
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('DE', 200)),
          );
        const { service } = getService({
          options: { fetch: mockFetch, policyOptions: { maxRetries: 0 } },
        });

        const oldPromise = service.fetchGeolocation();

        const refreshResult = await service.fetchGeolocation({
          bypassCache: true,
        });
        expect(refreshResult).toBe('DE');

        rejectOldFetch(new Error('Network timeout'));
        await expect(oldPromise).rejects.toThrow('Network timeout');

        const cached = await service.fetchGeolocation();
        expect(cached).toBe('DE');
      });
    });
  });

  describe('service policy', () => {
    it('retries on 500 and returns the result from the second attempt', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(createMockResponse('', 500)),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(createMockResponse('US', 200)),
        );
      const { service } = getService({ options: { fetch: mockFetch } });
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });

      const result = await service.fetchGeolocation();

      expect(result).toBe('US');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all retry attempts', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementation(() => Promise.resolve(createMockResponse('', 500)));
      const { service } = getService({ options: { fetch: mockFetch } });
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });

      await expect(service.fetchGeolocation()).rejects.toThrow(
        'Geolocation fetch failed: 500',
      );

      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('fires onDegraded when the request exceeds the degraded threshold', async () => {
      const mockFetch = jest.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => {
              resolve(createMockResponse('US', 200));
            }, 6000);
          }),
      );
      const { service } = getService({ options: { fetch: mockFetch } });
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      const fetchPromise = service.fetchGeolocation();
      await jest.advanceTimersByTimeAsync(6000);
      await fetchPromise;

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('fires onBreak after repeated failures trip the circuit breaker', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementation(() => Promise.resolve(createMockResponse('', 500)));
      const { service } = getService({
        options: {
          fetch: mockFetch,
          policyOptions: { maxConsecutiveFailures: 4 },
        },
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });
      const onBreakListener = jest.fn();
      service.onBreak(onBreakListener);

      await expect(service.fetchGeolocation()).rejects.toThrow(
        'Geolocation fetch failed: 500',
      );

      expect(onBreakListener).toHaveBeenCalledWith({
        error: expect.any(HttpError),
      });
    });
  });

  describe('constructor', () => {
    it('falls back to globalThis.fetch when fetch option is omitted', async () => {
      const spy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(createMockResponse('SE', 200)),
        );

      try {
        const rootMessenger = getRootMessenger();
        const messenger = getMessenger(rootMessenger);
        const service = new GeolocationApiService({ messenger });

        const result = await service.fetchGeolocation();
        expect(result).toBe('SE');
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<GeolocationApiServiceMessenger>,
  MessengerEvents<GeolocationApiServiceMessenger>
>;

/**
 * Constructs the root messenger for the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): GeolocationApiServiceMessenger {
  return new Messenger({
    namespace: 'GeolocationApiService',
    parent: rootMessenger,
  });
}

/**
 * Creates a mock Response-like object compatible with the service's fetch
 * usage, without relying on the global `Response` constructor.
 *
 * @param body - The text body to return.
 * @param status - The HTTP status code.
 * @returns A mock Response object.
 */
function createMockResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Creates a mock fetch function that resolves with the given country code.
 * Each call returns a fresh mock Response.
 *
 * @param countryCode - The country code to return.
 * @returns A jest mock function.
 */
function createMockFetch(
  countryCode: string,
): jest.Mock<Promise<Response>, [string]> {
  return jest
    .fn()
    .mockImplementation(() =>
      Promise.resolve(createMockResponse(countryCode, 200)),
    );
}

/**
 * Constructs the service under test with sensible defaults.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults as needed (including
 * `messenger`).
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof GeolocationApiService>[0]>;
} = {}): {
  service: GeolocationApiService;
  rootMessenger: RootMessenger;
  messenger: GeolocationApiServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const service = new GeolocationApiService({
    fetch: createMockFetch(UNKNOWN_LOCATION),
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
