import {
  GeolocationApiService,
  UNKNOWN_LOCATION,
} from './geolocation-api-service';

const MOCK_URL = 'https://on-ramp.api.cx.metamask.io/geolocation';

describe('GeolocationApiService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('falls back to globalThis.fetch when fetch option is omitted', async () => {
      const spy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(createMockResponse('SE', 200)),
        );

      try {
        const service = new GeolocationApiService({
          getGeolocationUrl: (): string => MOCK_URL,
        });

        const result = await service.fetchGeolocation();
        expect(result).toBe('SE');
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });

    it('accepts a custom TTL', async () => {
      const mockFetch = createMockFetch('US');

      const service = new GeolocationApiService({
        fetch: mockFetch,
        getGeolocationUrl: (): string => MOCK_URL,
        ttlMs: 100,
      });

      await service.fetchGeolocation();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await service.fetchGeolocation();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(101);

      await service.fetchGeolocation();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache behaviour', () => {
    it('returns cached value when TTL has not expired', async () => {
      const mockFetch = createMockFetch('US');
      const service = createService({ fetch: mockFetch });

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
      const service = createService({ fetch: mockFetch });

      await service.fetchGeolocation();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      await service.fetchGeolocation();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('promise deduplication', () => {
    it('deduplicates concurrent calls into a single fetch', async () => {
      const mockFetch = createMockFetch('IT');
      const service = createService({ fetch: mockFetch });

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

  describe('fetch success', () => {
    it('returns the fetched country code', async () => {
      const mockFetch = createMockFetch('GB');
      const service = createService({ fetch: mockFetch });

      const result = await service.fetchGeolocation();
      expect(result).toBe('GB');
    });

    it('fetches from the URL returned by getGeolocationUrl', async () => {
      const customUrl = 'https://custom-api.example.com/geo';
      const mockFetch = createMockFetch('FR');
      const service = createService({
        fetch: mockFetch,
        getGeolocationUrl: () => customUrl,
      });

      await service.fetchGeolocation();
      expect(mockFetch).toHaveBeenCalledWith(customUrl);
    });
  });

  describe('fetch failure', () => {
    it('throws on network error', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const service = createService({ fetch: mockFetch });

      await expect(service.fetchGeolocation()).rejects.toThrow('Network error');
    });

    it('throws on non-OK response', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementation(() => Promise.resolve(createMockResponse('', 500)));
      const service = createService({ fetch: mockFetch });

      await expect(service.fetchGeolocation()).rejects.toThrow(
        'Geolocation fetch failed: 500',
      );
    });

    it('throws non-Error values as-is', async () => {
      const mockFetch = jest.fn().mockRejectedValue('string error');
      const service = createService({ fetch: mockFetch });

      await expect(service.fetchGeolocation()).rejects.toBe('string error');
    });
  });

  describe('ISO 3166-1 alpha-2 validation', () => {
    it('maps empty response body to UNKNOWN', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementation(() => Promise.resolve(createMockResponse('', 200)));
      const service = createService({ fetch: mockFetch });

      const result = await service.fetchGeolocation();
      expect(result).toBe(UNKNOWN_LOCATION);
    });

    it('trims whitespace from response body', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(createMockResponse('  US  \n', 200)),
        );
      const service = createService({ fetch: mockFetch });

      const result = await service.fetchGeolocation();
      expect(result).toBe('US');
    });

    it('rejects non-ISO-3166-1 alpha-2 response as UNKNOWN', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(createMockResponse('<html>error page</html>', 200)),
        );
      const service = createService({ fetch: mockFetch });

      const result = await service.fetchGeolocation();
      expect(result).toBe(UNKNOWN_LOCATION);
    });

    it('rejects lowercase country codes as UNKNOWN', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(createMockResponse('us', 200)),
        );
      const service = createService({ fetch: mockFetch });

      const result = await service.fetchGeolocation();
      expect(result).toBe(UNKNOWN_LOCATION);
    });

    it('rejects three-letter codes as UNKNOWN', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(createMockResponse('USA', 200)),
        );
      const service = createService({ fetch: mockFetch });

      const result = await service.fetchGeolocation();
      expect(result).toBe(UNKNOWN_LOCATION);
    });
  });

  describe('bypassCache', () => {
    it('bypasses cache and triggers a new fetch', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(createMockResponse('US', 200)),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(createMockResponse('GB', 200)),
        );
      const service = createService({ fetch: mockFetch });

      const first = await service.fetchGeolocation();
      expect(first).toBe('US');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const second = await service.fetchGeolocation({ bypassCache: true });
      expect(second).toBe('GB');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not let a stale in-flight fetch overwrite refreshed cache', async () => {
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
      const service = createService({ fetch: mockFetch });

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

    it('preserves deduplication for the refresh fetch after old finally runs', async () => {
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
      const service = createService({ fetch: mockFetch });

      const oldPromise = service.fetchGeolocation();

      const refreshPromise = service.fetchGeolocation({ bypassCache: true });

      resolveOldFetch(createMockResponse('US', 200));
      await oldPromise;
      await refreshPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not let a stale in-flight error affect refreshed cache', async () => {
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
      const service = createService({ fetch: mockFetch });

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
 * Creates a {@link GeolocationApiService} with sensible defaults for testing.
 *
 * @param overrides - Optional overrides for the service options.
 * @returns A configured service instance.
 */
function createService(
  overrides: Partial<
    ConstructorParameters<typeof GeolocationApiService>[0]
  > = {},
): GeolocationApiService {
  return new GeolocationApiService({
    fetch: createMockFetch(UNKNOWN_LOCATION),
    getGeolocationUrl: (): string => MOCK_URL,
    ...overrides,
  });
}
