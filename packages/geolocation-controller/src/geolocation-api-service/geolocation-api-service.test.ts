import { HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { Env } from '../types.js';
import type { GeolocationApiServiceMessenger } from './geolocation-api-service.js';
import {
  GeolocationApiService,
  UNKNOWN_LOCATION,
} from './geolocation-api-service.js';

describe('GeolocationApiService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('GeolocationApiService:fetchGeolocation', () => {
    it('returns the fetched location code', async () => {
      const { rootMessenger } = getService({
        options: { fetch: createMockFetch({ country: 'GB' }) },
      });

      const result = await rootMessenger.call(
        'GeolocationApiService:fetchGeolocation',
      );

      expect(result).toBe('GB');
    });

    it('fetches from the production URL by default', async () => {
      const mockFetch = createMockFetch({ country: 'FR' });
      const { rootMessenger } = getService({
        options: { fetch: mockFetch },
      });

      await rootMessenger.call('GeolocationApiService:fetchGeolocation');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://geolocation.api.cx.metamask.io/v2/geolocation',
      );
    });

    it('fetches from the production URL when env is UAT, since API Platform has not provisioned a dedicated UAT deployment', async () => {
      const mockFetch = createMockFetch({ country: 'FR' });
      const { rootMessenger } = getService({
        options: { fetch: mockFetch, env: Env.UAT },
      });

      await rootMessenger.call('GeolocationApiService:fetchGeolocation');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://geolocation.api.cx.metamask.io/v2/geolocation',
      );
    });

    it('fetches from the DEV URL when env is DEV', async () => {
      const mockFetch = createMockFetch({ country: 'FR' });
      const { rootMessenger } = getService({
        options: { fetch: mockFetch, env: Env.DEV },
      });

      await rootMessenger.call('GeolocationApiService:fetchGeolocation');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://geolocation.dev-api.cx.metamask.io/v2/geolocation',
      );
    });
  });

  describe('fetchGeolocationData', () => {
    it('returns the fetched country, region, and timezone', async () => {
      const { rootMessenger } = getService({
        options: {
          fetch: createMockFetch({
            country: 'US',
            region: 'WA',
            timezone: 'America/Los_Angeles',
          }),
        },
      });

      const result = await rootMessenger.call(
        'GeolocationApiService:fetchGeolocationData',
      );

      expect(result).toStrictEqual({
        country: 'US',
        region: 'WA',
        timezone: 'America/Los_Angeles',
      });
    });
  });

  describe('fetchGeolocation', () => {
    it('returns the same result as the messenger action', async () => {
      const mockFetch = createMockFetch({ country: 'GB' });
      const { service } = getService({ options: { fetch: mockFetch } });

      const result = await service.fetchGeolocation();

      expect(result).toBe('GB');
    });

    it('joins the country and region into an ISO 3166-2 code', async () => {
      const mockFetch = createMockFetch({ country: 'US', region: 'NY' });
      const { service } = getService({ options: { fetch: mockFetch } });

      const result = await service.fetchGeolocation();

      expect(result).toBe('US-NY');
    });

    it('omits the region when the API does not return one', async () => {
      const mockFetch = createMockFetch({
        country: 'FR',
        timezone: 'Europe/Paris',
      });
      const { service } = getService({ options: { fetch: mockFetch } });

      const result = await service.fetchGeolocation();

      expect(result).toBe('FR');
    });

    it('returns UNKNOWN_LOCATION when the country is missing', async () => {
      const mockFetch = createMockFetch({ region: 'WA' });
      const { service } = getService({ options: { fetch: mockFetch } });

      const result = await service.fetchGeolocation();

      expect(result).toBe(UNKNOWN_LOCATION);
    });

    describe('cache', () => {
      it('returns cached value when TTL has not expired', async () => {
        const mockFetch = createMockFetch({ country: 'US' });
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
        const mockFetch = createMockFetch({ country: 'US' });
        const { service } = getService({ options: { fetch: mockFetch } });

        await service.fetchGeolocation();
        expect(mockFetch).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(5 * 60 * 1000 + 1);

        await service.fetchGeolocation();
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('uses the provided TTL instead of the default', async () => {
        const mockFetch = createMockFetch({ country: 'US' });
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

      it('shares the cache between fetchGeolocation and fetchGeolocationData', async () => {
        const mockFetch = createMockFetch({ country: 'US', region: 'WA' });
        const { service } = getService({ options: { fetch: mockFetch } });

        await service.fetchGeolocation();
        const data = await service.fetchGeolocationData();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(data.region).toBe('WA');
      });

      it('does not cache UNKNOWN responses', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementationOnce(() =>
            Promise.resolve(createMockResponse('', 200)),
          )
          .mockImplementationOnce(() =>
            Promise.resolve(
              createMockResponse(JSON.stringify({ country: 'US' }), 200),
            ),
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
        const mockFetch = createMockFetch({ country: 'IT' });
        const { service } = getService({ options: { fetch: mockFetch } });

        const [result1, result2, result3] = await Promise.all([
          service.fetchGeolocation(),
          service.fetchGeolocation(),
          service.fetchGeolocationData(),
        ]);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(result1).toBe('IT');
        expect(result2).toBe('IT');
        expect(result3).toStrictEqual({
          country: 'IT',
          region: null,
          timezone: null,
        });
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
      it('returns unknown data for an empty response body', async () => {
        const { service } = getService({
          options: { fetch: createMockRawFetch('') },
        });

        const result = await service.fetchGeolocationData();

        expect(result).toStrictEqual({
          country: null,
          region: null,
          timezone: null,
        });
      });

      it('returns unknown data for a non-JSON response body', async () => {
        const { service } = getService({
          options: { fetch: createMockRawFetch('<html>error page</html>') },
        });

        const result = await service.fetchGeolocationData();

        expect(result).toStrictEqual({
          country: null,
          region: null,
          timezone: null,
        });
      });

      it('returns unknown data when the response body is a JSON array', async () => {
        const { service } = getService({
          options: { fetch: createMockRawFetch('[{"country":"US"}]') },
        });

        const result = await service.fetchGeolocationData();

        expect(result).toStrictEqual({
          country: null,
          region: null,
          timezone: null,
        });
      });

      it('returns unknown data when the response body is JSON null', async () => {
        const { service } = getService({
          options: { fetch: createMockRawFetch('null') },
        });

        const result = await service.fetchGeolocationData();

        expect(result).toStrictEqual({
          country: null,
          region: null,
          timezone: null,
        });
      });

      it('trims whitespace from field values', async () => {
        const { service } = getService({
          options: {
            fetch: createMockFetch({
              country: '  US  ',
              region: ' WA ',
              timezone: ' America/Los_Angeles ',
            }),
          },
        });

        const result = await service.fetchGeolocationData();

        expect(result).toStrictEqual({
          country: 'US',
          region: 'WA',
          timezone: 'America/Los_Angeles',
        });
      });

      it('rejects a lowercase country code', async () => {
        const { service } = getService({
          options: { fetch: createMockFetch({ country: 'us' }) },
        });

        const result = await service.fetchGeolocationData();

        expect(result.country).toBeNull();
      });

      it('rejects a three-letter country code', async () => {
        const { service } = getService({
          options: { fetch: createMockFetch({ country: 'USA' }) },
        });

        const result = await service.fetchGeolocationData();

        expect(result.country).toBeNull();
      });

      it('rejects a non-string country', async () => {
        const { service } = getService({
          options: { fetch: createMockFetch({ country: 42 }) },
        });

        const result = await service.fetchGeolocationData();

        expect(result.country).toBeNull();
      });

      it('accepts a numeric region code', async () => {
        const { service } = getService({
          options: { fetch: createMockFetch({ country: 'FR', region: '75' }) },
        });

        const result = await service.fetchGeolocationData();

        expect(result.region).toBe('75');
      });

      it('accepts a single-character region code', async () => {
        const { service } = getService({
          options: { fetch: createMockFetch({ country: 'ES', region: 'M' }) },
        });

        const result = await service.fetchGeolocationData();

        expect(result.region).toBe('M');
      });

      it('rejects a region code with too many characters', async () => {
        const { service } = getService({
          options: {
            fetch: createMockFetch({ country: 'US', region: 'ABCD' }),
          },
        });

        const result = await service.fetchGeolocationData();

        expect(result).toStrictEqual({
          country: 'US',
          region: null,
          timezone: null,
        });
      });

      it('rejects a lowercase region code', async () => {
        const { service } = getService({
          options: { fetch: createMockFetch({ country: 'US', region: 'ny' }) },
        });

        const result = await service.fetchGeolocationData();

        expect(result.region).toBeNull();
      });

      it('accepts a single-segment timezone', async () => {
        const { service } = getService({
          options: {
            fetch: createMockFetch({ country: 'GB', timezone: 'UTC' }),
          },
        });

        const result = await service.fetchGeolocationData();

        expect(result.timezone).toBe('UTC');
      });

      it('accepts a three-segment timezone', async () => {
        const { service } = getService({
          options: {
            fetch: createMockFetch({
              country: 'US',
              timezone: 'America/Indiana/Knox',
            }),
          },
        });

        const result = await service.fetchGeolocationData();

        expect(result.timezone).toBe('America/Indiana/Knox');
      });

      it('rejects a timezone with unexpected characters', async () => {
        const { service } = getService({
          options: {
            fetch: createMockFetch({
              country: 'US',
              timezone: 'America/Los Angeles',
            }),
          },
        });

        const result = await service.fetchGeolocationData();

        expect(result.timezone).toBeNull();
      });

      it('ignores unexpected extra fields', async () => {
        const { service } = getService({
          options: {
            fetch: createMockFetch({ country: 'US', city: 'Seattle' }),
          },
        });

        const result = await service.fetchGeolocationData();

        expect(result).toStrictEqual({
          country: 'US',
          region: null,
          timezone: null,
        });
      });
    });

    describe('bypassCache', () => {
      it('invalidates the TTL cache and triggers a new fetch', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementationOnce(() =>
            Promise.resolve(
              createMockResponse(JSON.stringify({ country: 'US' }), 200),
            ),
          )
          .mockImplementationOnce(() =>
            Promise.resolve(
              createMockResponse(JSON.stringify({ country: 'GB' }), 200),
            ),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        const first = await service.fetchGeolocation();
        expect(first).toBe('US');
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const second = await service.fetchGeolocation({ bypassCache: true });
        expect(second).toBe('GB');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('reuses an in-flight request instead of starting a second one', async () => {
        const mockFetch = createMockFetch({ country: 'US' });
        const { service } = getService({ options: { fetch: mockFetch } });

        const [first, second] = await Promise.all([
          service.fetchGeolocation(),
          service.fetchGeolocation({ bypassCache: true }),
        ]);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(first).toBe('US');
        expect(second).toBe('US');
      });

      it('invalidates the TTL cache for fetchGeolocationData', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementationOnce(() =>
            Promise.resolve(
              createMockResponse(JSON.stringify({ country: 'US' }), 200),
            ),
          )
          .mockImplementationOnce(() =>
            Promise.resolve(
              createMockResponse(JSON.stringify({ country: 'GB' }), 200),
            ),
          );
        const { service } = getService({ options: { fetch: mockFetch } });

        await service.fetchGeolocationData();
        const second = await service.fetchGeolocationData({
          bypassCache: true,
        });

        expect(second.country).toBe('GB');
        expect(mockFetch).toHaveBeenCalledTimes(2);
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
          Promise.resolve(
            createMockResponse(JSON.stringify({ country: 'US' }), 200),
          ),
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
              resolve(
                createMockResponse(JSON.stringify({ country: 'US' }), 200),
              );
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
          Promise.resolve(
            createMockResponse(JSON.stringify({ country: 'SE' }), 200),
          ),
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
 * Creates a mock fetch function that resolves with the given raw response body.
 * Each call returns a fresh mock Response.
 *
 * @param body - The raw body to return.
 * @returns A jest mock function.
 */
function createMockRawFetch(
  body: string,
): jest.Mock<Promise<Response>, [string]> {
  return jest
    .fn()
    .mockImplementation(() => Promise.resolve(createMockResponse(body, 200)));
}

/**
 * Creates a mock fetch function that resolves with the given geolocation
 * payload serialized as JSON. Each call returns a fresh mock Response.
 *
 * @param payload - The geolocation payload to return.
 * @returns A jest mock function.
 */
function createMockFetch(
  payload: Record<string, unknown>,
): jest.Mock<Promise<Response>, [string]> {
  return createMockRawFetch(JSON.stringify(payload));
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
    fetch: createMockFetch({}),
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
