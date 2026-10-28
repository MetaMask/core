import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { onlineManager } from '@tanstack/query-core';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type {
  GeolocationApiServiceMessenger,
  GeolocationData,
} from './geolocation-api-service/geolocation-api-service.js';
import {
  GeolocationApiService,
  getUnknownGeolocationData,
  UNKNOWN_LOCATION,
} from './geolocation-api-service/geolocation-api-service.js';
import type {
  GeolocationControllerMessenger,
  GeolocationControllerState,
} from './GeolocationController.js';
import {
  GeolocationController,
  getDefaultGeolocationControllerState,
} from './GeolocationController.js';

describe('GeolocationController', () => {
  describe('constructor', () => {
    it('initializes with default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual(
          getDefaultGeolocationControllerState(),
        );
      });
    });

    it('merges provided partial state with defaults', async () => {
      await withController(
        { options: { state: { location: 'GB' } } },
        ({ controller }) => {
          expect(controller.state.location).toBe('GB');
          expect(controller.state.status).toBe('idle');
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          {
            "country": null,
            "error": null,
            "lastFetchedAt": null,
            "location": "UNKNOWN",
            "region": null,
            "status": "idle",
            "timezone": null,
          }
        `);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          {
            "country": null,
            "error": null,
            "lastFetchedAt": null,
            "location": "UNKNOWN",
            "region": null,
            "status": "idle",
            "timezone": null,
          }
        `);
      });
    });

    it('persists no state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          {
            "country": null,
            "location": "UNKNOWN",
            "region": null,
            "status": "idle",
            "timezone": null,
          }
        `);
      });
    });
  });

  describe('getGeolocation', () => {
    it('sets location, complete and lastFetchedAt from the query state', async () => {
      await withController(
        { mockFetch: createMockFetch({ country: 'GB' }) },
        async ({ controller }) => {
          vi.setSystemTime(1000);

          const result = await controller.getGeolocation();

          expect(result).toBe('GB');
          expect(controller.state).toStrictEqual({
            location: 'GB',
            country: 'GB',
            region: null,
            timezone: null,
            status: 'complete',
            lastFetchedAt: 1000,
            error: null,
          });
        },
      );
    });

    it('joins the country and region into the location code', async () => {
      await withController(
        { mockFetch: createMockFetch({ country: 'US', region: 'NY' }) },
        async ({ controller }) => {
          const result = await controller.getGeolocation();

          expect(result).toBe('US-NY');
          expect(controller.state.location).toBe('US-NY');
        },
      );
    });

    it('stores the country, region, and timezone in state', async () => {
      await withController(
        {
          mockFetch: createMockFetch({
            country: 'US',
            region: 'WA',
            timezone: 'America/Los_Angeles',
          }),
        },
        async ({ controller }) => {
          await controller.getGeolocation();

          expect(controller.state.country).toBe('US');
          expect(controller.state.region).toBe('WA');
          expect(controller.state.timezone).toBe('America/Los_Angeles');
        },
      );
    });

    it('transitions idle, loading, complete', async () => {
      const { promise: response, resolve: resolveResponse } =
        createDeferredResponse();

      await withController(
        { mockFetch: vi.fn().mockReturnValueOnce(response) },
        async ({ controller, rootMessenger }) => {
          const states: string[] = [];
          rootMessenger.subscribe(
            'GeolocationController:stateChange',
            (state) => {
              states.push(state.status);
            },
          );
          expect(controller.state.status).toBe('idle');

          const promise = controller.getGeolocation();
          await vi.waitFor(() => expect(states).toStrictEqual(['loading']));

          resolveResponse(buildResponse({ country: 'DE' }));
          await promise;

          expect(states).toStrictEqual(['loading', 'complete']);
          expect(controller.state.location).toBe('DE');
        },
      );
    });

    it('shows loading while the first load is paused offline', async () => {
      const mockFetch = createMockFetch();

      await withController({ mockFetch }, async ({ controller }) => {
        onlineManager.setOnline(false);
        try {
          // The paused fetch is dropped when the service is destroyed.
          controller.getGeolocation().catch(() => undefined);
          await vi.waitFor(() =>
            expect(controller.state.status).toBe('loading'),
          );
          expect(mockFetch).not.toHaveBeenCalled();
          expect(controller.state.error).toBeNull();
        } finally {
          onlineManager.setOnline(true);
        }
      });
    });

    it('reflects a cache hit without a network call', async () => {
      const mockFetch = createMockFetch({ country: 'US' });

      await withController(
        { mockFetch },
        async ({ controller, rootMessenger }) => {
          vi.setSystemTime(1000);
          await controller.getGeolocation();

          const states: GeolocationControllerState[] = [];
          rootMessenger.subscribe(
            'GeolocationController:stateChange',
            (state) => {
              states.push(state);
            },
          );
          vi.setSystemTime(2000);
          const result = await controller.getGeolocation();

          expect(result).toBe('US');
          expect(mockFetch).toHaveBeenCalledTimes(1);
          expect(states).toStrictEqual([]);
          expect(controller.state.status).toBe('complete');
          expect(controller.state.lastFetchedAt).toBe(1000);
        },
      );
    });

    it('reaches complete from a cache hit while the controller state is not idle', async () => {
      const mockFetch = createMockFetch({ country: 'FR' });

      await withController(
        {
          mockFetch,
          options: {
            state: { status: 'error', error: 'old error', lastFetchedAt: null },
          },
        },
        async ({ controller, rootMessenger }) => {
          vi.setSystemTime(1000);
          await rootMessenger.call(
            'GeolocationApiService:fetchGeolocationData',
          );
          expect(controller.state.status).toBe('error');

          vi.setSystemTime(5000);
          const result = await controller.getGeolocation();

          expect(result).toBe('FR');
          expect(mockFetch).toHaveBeenCalledTimes(1);
          expect(controller.state).toStrictEqual({
            location: 'FR',
            country: 'FR',
            region: null,
            timezone: null,
            status: 'complete',
            lastFetchedAt: 1000,
            error: null,
          });
        },
      );
    });

    describe('when the fetch fails', () => {
      it('sets error from the serialized query error', async () => {
        await withController(
          { mockFetch: vi.fn().mockRejectedValue(new Error('boom')) },
          async ({ controller }) => {
            await controller.getGeolocation();

            expect(controller.state.status).toBe('error');
            expect(controller.state.error).toBe('boom');
            expect(controller.state.lastFetchedAt).toBeNull();
          },
        );
      });

      it('clears error when a new fetch starts', async () => {
        const mockFetch = vi
          .fn()
          .mockRejectedValueOnce(new Error('boom'))
          .mockResolvedValueOnce(buildResponse({ country: 'US' }));

        await withController(
          { mockFetch },
          async ({ controller, rootMessenger }) => {
            await controller.getGeolocation();
            expect(controller.state.error).toBe('boom');

            const states: GeolocationControllerState[] = [];
            rootMessenger.subscribe(
              'GeolocationController:stateChange',
              (state) => {
                states.push(state);
              },
            );
            await controller.getGeolocation();

            expect(states[0]).toMatchObject({ status: 'loading', error: null });
            expect(controller.state.status).toBe('complete');
            expect(controller.state.error).toBeNull();
          },
        );
      });

      it('preserves the last known location', async () => {
        const mockFetch = vi
          .fn()
          .mockResolvedValueOnce(buildResponse({ country: 'US' }))
          .mockRejectedValueOnce(new Error('Network error'));

        await withController(
          { mockFetch, serviceOptions: { ttlMs: 0 } },
          async ({ controller }) => {
            await controller.getGeolocation();
            expect(controller.state.location).toBe('US');

            const result = await controller.getGeolocation();
            expect(result).toBe('US');
            expect(controller.state.location).toBe('US');
            expect(controller.state.status).toBe('error');
          },
        );
      });

      it('returns UNKNOWN_LOCATION when no prior value exists', async () => {
        await withController(
          { mockFetch: vi.fn().mockRejectedValue(new Error('Network error')) },
          async ({ controller }) => {
            const result = await controller.getGeolocation();

            expect(result).toBe(UNKNOWN_LOCATION);
            expect(controller.state.location).toBe(UNKNOWN_LOCATION);
          },
        );
      });

      it('stores string representation of non-Error thrown values', async () => {
        await withController(
          { mockFetch: vi.fn().mockRejectedValue('string error') },
          async ({ controller }) => {
            await controller.getGeolocation();

            expect(controller.state.status).toBe('error');
            expect(controller.state.error).toBe('string error');
          },
        );
      });
    });
  });

  describe('getGeolocationData', () => {
    it('returns the country, region, and timezone', async () => {
      await withController(
        {
          mockFetch: createMockFetch({
            country: 'FR',
            region: '75',
            timezone: 'Europe/Paris',
          }),
        },
        async ({ controller }) => {
          const result = await controller.getGeolocationData();

          expect(result).toStrictEqual({
            country: 'FR',
            region: '75',
            timezone: 'Europe/Paris',
          });
          expect(controller.state.status).toBe('complete');
        },
      );
    });

    it('rejects when the fetch fails instead of returning stale data', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          buildResponse({
            country: 'US',
            region: 'WA',
            timezone: 'America/Los_Angeles',
          }),
        )
        .mockRejectedValueOnce(new Error('Network error'));

      await withController(
        { mockFetch, serviceOptions: { ttlMs: 0 } },
        async ({ controller }) => {
          await controller.getGeolocationData();

          await expect(controller.getGeolocationData()).rejects.toThrow(
            'Network error',
          );
          expect(controller.state.status).toBe('error');
          expect(controller.state.error).toBe('Network error');
        },
      );
    });

    it('rejects when the fetch fails and no prior value exists', async () => {
      await withController(
        { mockFetch: vi.fn().mockRejectedValue(new Error('Network error')) },
        async ({ controller }) => {
          await expect(controller.getGeolocationData()).rejects.toThrow(
            'Network error',
          );
        },
      );
    });
  });

  describe('refreshGeolocation', () => {
    it('resets lastFetchedAt and bypasses the service cache', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(buildResponse({ country: 'US' }))
        .mockResolvedValueOnce(buildResponse({ country: 'GB' }));

      await withController({ mockFetch }, async ({ controller }) => {
        await controller.getGeolocation();
        expect(controller.state.location).toBe('US');
        expect(controller.state.lastFetchedAt).not.toBeNull();

        const refreshPromise = controller.refreshGeolocation();
        expect(controller.state.lastFetchedAt).toBeNull();

        const result = await refreshPromise;
        expect(result).toBe('GB');
        expect(controller.state.location).toBe('GB');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    it('keeps lastFetchedAt null until the refresh completes', async () => {
      const { promise: refreshResponse, resolve: resolveRefreshResponse } =
        createDeferredResponse();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(buildResponse({ country: 'US' }))
        .mockReturnValueOnce(refreshResponse);

      await withController(
        { mockFetch },
        async ({ controller, rootMessenger }) => {
          vi.setSystemTime(1000);
          await controller.getGeolocation();
          expect(controller.state.lastFetchedAt).toBe(1000);

          const states: Pick<
            GeolocationControllerState,
            'status' | 'lastFetchedAt' | 'location'
          >[] = [];
          rootMessenger.subscribe(
            'GeolocationController:stateChange',
            (state) => {
              states.push({
                status: state.status,
                lastFetchedAt: state.lastFetchedAt,
                location: state.location,
              });
            },
          );

          const refreshPromise = controller.refreshGeolocation();
          await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
          expect(controller.state.status).toBe('loading');
          expect(controller.state.lastFetchedAt).toBeNull();

          vi.setSystemTime(2000);
          resolveRefreshResponse(buildResponse({ country: 'GB' }));
          await refreshPromise;

          // The cached `US` entry is reported as a snapshot before the refetch,
          // but it must not bring back its old `dataUpdatedAt`.
          expect(states).toStrictEqual([
            { status: 'complete', lastFetchedAt: null, location: 'US' },
            { status: 'loading', lastFetchedAt: null, location: 'US' },
            { status: 'complete', lastFetchedAt: 2000, location: 'GB' },
          ]);
        },
      );
    });

    it('shows loading while the refresh is paused offline', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(buildResponse({ country: 'US' }));

      await withController({ mockFetch }, async ({ controller }) => {
        await controller.getGeolocation();
        expect(controller.state.status).toBe('complete');

        onlineManager.setOnline(false);
        try {
          // The paused fetch is dropped when the service is destroyed.
          controller.refreshGeolocation().catch(() => undefined);
          await vi.waitFor(() =>
            expect(controller.state.status).toBe('loading'),
          );
          expect(mockFetch).toHaveBeenCalledTimes(1);
          expect(controller.state.lastFetchedAt).toBeNull();
          expect(controller.state.error).toBeNull();
        } finally {
          onlineManager.setOnline(true);
        }
      });
    });

    it('sets status to error when the fetch fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(buildResponse({ country: 'US' }))
        .mockRejectedValueOnce(new Error('Refresh failed'));

      await withController({ mockFetch }, async ({ controller }) => {
        await controller.getGeolocation();
        expect(controller.state.location).toBe('US');

        const result = await controller.refreshGeolocation();
        expect(result).toBe('US');
        expect(controller.state.status).toBe('error');
        expect(controller.state.error).toBe('Refresh failed');
        expect(controller.state.lastFetchedAt).toBeNull();
      });
    });

    it('stores string representation of non-Error thrown values', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(buildResponse({ country: 'US' }))
        .mockRejectedValueOnce('string refresh error');

      await withController({ mockFetch }, async ({ controller }) => {
        await controller.getGeolocation();

        await controller.refreshGeolocation();
        expect(controller.state.status).toBe('error');
        expect(controller.state.error).toBe('string refresh error');
      });
    });
  });

  describe('GeolocationController:getGeolocation', () => {
    it('resolves with the fetched country code', async () => {
      await withController(
        { mockFetch: createMockFetch({ country: 'JP' }) },
        async ({ rootMessenger }) => {
          const result = await rootMessenger.call(
            'GeolocationController:getGeolocation',
          );

          expect(result).toBe('JP');
        },
      );
    });
  });

  describe('GeolocationController:getGeolocationData', () => {
    it('resolves with the fetched country, region, and timezone', async () => {
      await withController(
        {
          mockFetch: createMockFetch({
            country: 'JP',
            region: '13',
            timezone: 'Asia/Tokyo',
          }),
        },
        async ({ rootMessenger }) => {
          const result = await rootMessenger.call(
            'GeolocationController:getGeolocationData',
          );

          expect(result).toStrictEqual({
            country: 'JP',
            region: '13',
            timezone: 'Asia/Tokyo',
          });
        },
      );
    });
  });

  describe('GeolocationController:refreshGeolocation', () => {
    it('resolves with the updated country code', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(buildResponse({ country: 'US' }))
        .mockResolvedValueOnce(buildResponse({ country: 'CA' }));

      await withController({ mockFetch }, async ({ rootMessenger }) => {
        await rootMessenger.call('GeolocationController:getGeolocation');

        const result = await rootMessenger.call(
          'GeolocationController:refreshGeolocation',
        );

        expect(result).toBe('CA');
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller and the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  | MessengerActions<GeolocationControllerMessenger>
  | MessengerActions<GeolocationApiServiceMessenger>,
  | MessengerEvents<GeolocationControllerMessenger>
  | MessengerEvents<GeolocationApiServiceMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: GeolocationController;
  service: GeolocationApiService;
  rootMessenger: RootMessenger;
  controllerMessenger: GeolocationControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options that `withController` takes.
 */
type WithControllerOptions = {
  options?: Partial<
    Omit<ConstructorParameters<typeof GeolocationController>[0], 'messenger'>
  >;
  mockFetch?: Mock<typeof globalThis.fetch>;
  serviceOptions?: Partial<
    Omit<
      ConstructorParameters<typeof GeolocationApiService>[0],
      'messenger' | 'fetch'
    >
  >;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the controller under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The controller-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): GeolocationControllerMessenger {
  const messenger: GeolocationControllerMessenger = new Messenger({
    namespace: 'GeolocationController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: ['GeolocationApiService:fetchGeolocationData'],
    events: [],
    messenger,
  });
  return messenger;
}

/**
 * Constructs the messenger for the geolocation service.
 *
 * @param rootMessenger - The root messenger.
 * @returns The service-specific messenger.
 */
function getServiceMessenger(
  rootMessenger: RootMessenger,
): GeolocationApiServiceMessenger {
  return new Messenger({
    namespace: 'GeolocationApiService',
    parent: rootMessenger,
  });
}

/**
 * Builds a successful geolocation API response.
 *
 * @param data - The known geolocation fields.
 * @returns The response, with unknown fields set to null.
 */
function buildResponse(data: Partial<GeolocationData> = {}): Response {
  return new Response(
    JSON.stringify({ ...getUnknownGeolocationData(), ...data }),
    { status: 200 },
  );
}

/**
 * Creates a response promise that the test resolves by hand.
 *
 * @returns The promise and the function that resolves it.
 */
function createDeferredResponse(): {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
} {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

/**
 * Creates a fetch mock that answers every call with the given data.
 *
 * @param data - The known geolocation fields.
 * @returns The fetch mock.
 */
function createMockFetch(
  data: Partial<GeolocationData> = {},
): Mock<typeof globalThis.fetch> {
  return vi.fn<typeof globalThis.fetch>(async () => buildResponse(data));
}

/**
 * Wrap tests for the controller under test by ensuring that the controller and
 * a real {@link GeolocationApiService} are created ahead of time on the same
 * root messenger, and then safely destroyed afterward.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor, a `mockFetch` used by
 * the service, and extra service options. The function is called with the
 * instantiated controller, service, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [
    { options = {}, mockFetch = createMockFetch(), serviceOptions = {} } = {},
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];

  vi.useFakeTimers({ toFake: ['Date'] });

  const rootMessenger = getRootMessenger();
  const service = new GeolocationApiService({
    messenger: getServiceMessenger(rootMessenger),
    fetch: mockFetch,
    policyOptions: { maxRetries: 0 },
    ...serviceOptions,
  });
  const controllerMessenger = getMessenger(rootMessenger);
  const controller = new GeolocationController({
    messenger: controllerMessenger,
    ...options,
  });

  try {
    return await testFunction({
      controller,
      service,
      rootMessenger,
      controllerMessenger,
    });
  } finally {
    service.destroy();
    vi.useRealTimers();
  }
}
