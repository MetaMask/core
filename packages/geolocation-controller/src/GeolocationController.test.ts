import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { GeolocationControllerMessenger } from './GeolocationController';
import {
  GeolocationController,
  getDefaultGeolocationControllerState,
  UNKNOWN_LOCATION,
} from './GeolocationController';

const MOCK_URL = 'https://on-ramp.api.cx.metamask.io/geolocation';

describe('GeolocationController', () => {
  describe('constructor', () => {
    it('initializes with default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual(
          getDefaultGeolocationControllerState(),
        );
      });
    });

    it('accepts custom initial state', async () => {
      await withController(
        { options: { state: { location: 'GB' } } },
        ({ controller }) => {
          expect(controller.state.location).toBe('GB');
          expect(controller.state.status).toBe('idle');
        },
      );
    });

    it('accepts custom TTL', async () => {
      const mockFetch = createMockFetch('US');

      await withController(
        { options: { ttlMs: 100, fetch: mockFetch } },
        async ({ controller }) => {
          await controller.getGeolocation();
          expect(mockFetch).toHaveBeenCalledTimes(1);

          await controller.getGeolocation();
          expect(mockFetch).toHaveBeenCalledTimes(1);

          jest.advanceTimersByTime(101);

          await controller.getGeolocation();
          expect(mockFetch).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('registers getGeolocation action handler on the messenger', async () => {
      await withController(async ({ rootMessenger }) => {
        const result = await rootMessenger.call(
          'GeolocationController:getGeolocation',
        );
        expect(typeof result).toBe('string');
      });
    });

    it('registers refreshGeolocation action handler on the messenger', async () => {
      await withController(async ({ rootMessenger }) => {
        const result = await rootMessenger.call(
          'GeolocationController:refreshGeolocation',
        );
        expect(typeof result).toBe('string');
      });
    });

    it('falls back to globalThis.fetch when fetch option is omitted', async () => {
      const mockGlobalFetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(createMockResponse('SE', 200)),
        );

      const saved = globalThis.fetch;

      try {
        globalThis.fetch = mockGlobalFetch;
        await withController(
          { options: { fetch: undefined } },
          async ({ controller }) => {
            const result = await controller.getGeolocation();
            expect(result).toBe('SE');
            expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
          },
        );
      } finally {
        // eslint-disable-next-line require-atomic-updates
        globalThis.fetch = saved;
      }
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
            "error": null,
            "lastFetchedAt": null,
            "location": "UNKNOWN",
            "status": "idle",
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
            "error": null,
            "lastFetchedAt": null,
            "location": "UNKNOWN",
            "status": "idle",
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
            "location": "UNKNOWN",
            "status": "idle",
          }
        `);
      });
    });
  });

  describe('getGeolocation', () => {
    describe('cache behaviour', () => {
      it('returns cached value when TTL has not expired', async () => {
        const mockFetch = createMockFetch('US');

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            const first = await controller.getGeolocation();
            expect(first).toBe('US');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(4 * 60 * 1000);

            const second = await controller.getGeolocation();
            expect(second).toBe('US');
            expect(mockFetch).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('re-fetches when TTL has expired', async () => {
        const mockFetch = createMockFetch('US');

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            await controller.getGeolocation();
            expect(mockFetch).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(5 * 60 * 1000 + 1);

            await controller.getGeolocation();
            expect(mockFetch).toHaveBeenCalledTimes(2);
          },
        );
      });
    });

    describe('promise deduplication', () => {
      it('deduplicates concurrent calls into a single fetch', async () => {
        const mockFetch = createMockFetch('IT');

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            const [result1, result2, result3] = await Promise.all([
              controller.getGeolocation(),
              controller.getGeolocation(),
              controller.getGeolocation(),
            ]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(result1).toBe('IT');
            expect(result2).toBe('IT');
            expect(result3).toBe('IT');
          },
        );
      });

      it('deduplicates re-entrant calls from stateChange listeners', async () => {
        const mockFetch = createMockFetch('BR');

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller, rootMessenger }) => {
            let reEntrantPromise: Promise<string> | undefined;

            rootMessenger.subscribe(
              'GeolocationController:stateChange',
              (state) => {
                if (state.status === 'loading' && !reEntrantPromise) {
                  reEntrantPromise = controller.getGeolocation();
                }
              },
            );

            const result = await controller.getGeolocation();
            const reEntrantResult = await reEntrantPromise;

            expect(result).toBe('BR');
            expect(reEntrantResult).toBe('BR');
            expect(mockFetch).toHaveBeenCalledTimes(1);
          },
        );
      });
    });

    describe('fetch success', () => {
      it('updates state with location, complete status, and timestamp', async () => {
        const mockFetch = createMockFetch('GB');

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            const now = Date.now();
            const result = await controller.getGeolocation();

            expect(result).toBe('GB');
            expect(controller.state.location).toBe('GB');
            expect(controller.state.status).toBe('complete');
            expect(controller.state.lastFetchedAt).toBeGreaterThanOrEqual(now);
            expect(controller.state.error).toBeNull();
          },
        );
      });

      it('fetches from the URL returned by getGeolocationUrl', async () => {
        const customUrl = 'https://custom-api.example.com/geo';
        const mockFetch = createMockFetch('FR');

        await withController(
          {
            options: {
              fetch: mockFetch,
              getGeolocationUrl: () => customUrl,
            },
          },
          async ({ controller }) => {
            await controller.getGeolocation();
            expect(mockFetch).toHaveBeenCalledWith(customUrl);
          },
        );
      });

      it('transitions state from idle to loading to complete', async () => {
        const states: string[] = [];
        let resolveFetch: (value: Response) => void = () => undefined;
        const mockFetch = jest.fn().mockReturnValue(
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
        );

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller, rootMessenger }) => {
            rootMessenger.subscribe(
              'GeolocationController:stateChange',
              (state) => {
                states.push(state.status);
              },
            );

            const promise = controller.getGeolocation();
            expect(controller.state.status).toBe('loading');

            resolveFetch(createMockResponse('DE', 200));
            await promise;

            expect(states).toStrictEqual(['loading', 'complete']);
          },
        );
      });
    });

    describe('fetch failure', () => {
      it('sets status to error and stores error message', async () => {
        const mockFetch = jest
          .fn()
          .mockRejectedValue(new Error('Network error'));

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            await controller.getGeolocation();

            expect(controller.state.status).toBe('error');
            expect(controller.state.error).toBe('Network error');
          },
        );
      });

      it('preserves last known location on failure', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementationOnce(() =>
            Promise.resolve(createMockResponse('US', 200)),
          )
          .mockRejectedValueOnce(new Error('Network error'));

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            await controller.getGeolocation();
            expect(controller.state.location).toBe('US');

            jest.advanceTimersByTime(5 * 60 * 1000 + 1);

            const result = await controller.getGeolocation();
            expect(result).toBe('US');
            expect(controller.state.location).toBe('US');
            expect(controller.state.status).toBe('error');
          },
        );
      });

      it('returns UNKNOWN when no prior value exists and fetch fails', async () => {
        const mockFetch = jest
          .fn()
          .mockRejectedValue(new Error('Network error'));

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            const result = await controller.getGeolocation();

            expect(result).toBe(UNKNOWN_LOCATION);
            expect(controller.state.location).toBe(UNKNOWN_LOCATION);
          },
        );
      });

      it('treats non-OK response as an error', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('', 500)),
          );

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            await controller.getGeolocation();

            expect(controller.state.status).toBe('error');
            expect(controller.state.error).toBe(
              'Geolocation fetch failed: 500',
            );
          },
        );
      });

      it('handles non-Error thrown values', async () => {
        const mockFetch = jest.fn().mockRejectedValue('string error');

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            await controller.getGeolocation();

            expect(controller.state.status).toBe('error');
            expect(controller.state.error).toBe('string error');
          },
        );
      });
    });

    describe('edge cases', () => {
      it('maps empty response body to UNKNOWN', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('', 200)),
          );

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            const result = await controller.getGeolocation();

            expect(result).toBe(UNKNOWN_LOCATION);
            expect(controller.state.location).toBe(UNKNOWN_LOCATION);
            expect(controller.state.status).toBe('complete');
          },
        );
      });

      it('trims whitespace from response body', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('  US  \n', 200)),
          );

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            const result = await controller.getGeolocation();
            expect(result).toBe('US');
          },
        );
      });

      it('rejects non-ISO-3166-1 alpha-2 response as UNKNOWN', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('<html>error page</html>', 200)),
          );

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            const result = await controller.getGeolocation();
            expect(result).toBe(UNKNOWN_LOCATION);
            expect(controller.state.location).toBe(UNKNOWN_LOCATION);
            expect(controller.state.status).toBe('complete');
          },
        );
      });

      it('rejects lowercase country codes as UNKNOWN', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('us', 200)),
          );

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            const result = await controller.getGeolocation();
            expect(result).toBe(UNKNOWN_LOCATION);
          },
        );
      });

      it('rejects three-letter codes as UNKNOWN', async () => {
        const mockFetch = jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(createMockResponse('USA', 200)),
          );

        await withController(
          { options: { fetch: mockFetch } },
          async ({ controller }) => {
            const result = await controller.getGeolocation();
            expect(result).toBe(UNKNOWN_LOCATION);
          },
        );
      });
    });
  });

  describe('refreshGeolocation', () => {
    it('bypasses cache and triggers a new fetch', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(createMockResponse('US', 200)),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(createMockResponse('GB', 200)),
        );

      await withController(
        { options: { fetch: mockFetch } },
        async ({ controller }) => {
          await controller.getGeolocation();
          expect(controller.state.location).toBe('US');
          expect(mockFetch).toHaveBeenCalledTimes(1);

          const result = await controller.refreshGeolocation();
          expect(result).toBe('GB');
          expect(controller.state.location).toBe('GB');
          expect(mockFetch).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('resets lastFetchedAt before re-fetching', async () => {
      const mockFetch = createMockFetch('US');

      await withController(
        { options: { fetch: mockFetch } },
        async ({ controller }) => {
          await controller.getGeolocation();
          expect(controller.state.lastFetchedAt).not.toBeNull();

          const refreshPromise = controller.refreshGeolocation();
          expect(controller.state.lastFetchedAt).toBeNull();

          await refreshPromise;
          expect(controller.state.lastFetchedAt).not.toBeNull();
        },
      );
    });

    it('does not let a stale in-flight fetch overwrite refreshed data', async () => {
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

      await withController(
        { options: { fetch: mockFetch } },
        async ({ controller }) => {
          const oldPromise = controller.getGeolocation();

          const refreshPromise = controller.refreshGeolocation();
          expect(mockFetch).toHaveBeenCalledTimes(2);

          resolveNewFetch(createMockResponse('GB', 200));
          await refreshPromise;
          expect(controller.state.location).toBe('GB');

          resolveOldFetch(createMockResponse('US', 200));
          await oldPromise;

          expect(controller.state.location).toBe('GB');
          expect(controller.state.status).toBe('complete');
        },
      );
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

      await withController(
        { options: { fetch: mockFetch } },
        async ({ controller }) => {
          const oldPromise = controller.getGeolocation();

          const refreshPromise = controller.refreshGeolocation();

          resolveOldFetch(createMockResponse('US', 200));
          await oldPromise;
          await refreshPromise;

          expect(mockFetch).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('does not let a stale in-flight error overwrite refreshed state', async () => {
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

      await withController(
        { options: { fetch: mockFetch } },
        async ({ controller }) => {
          const oldPromise = controller.getGeolocation();

          const refreshPromise = controller.refreshGeolocation();
          await refreshPromise;
          expect(controller.state.location).toBe('DE');
          expect(controller.state.status).toBe('complete');

          rejectOldFetch(new Error('Network timeout'));
          await oldPromise;

          expect(controller.state.status).toBe('complete');
          expect(controller.state.error).toBeNull();
          expect(controller.state.location).toBe('DE');
        },
      );
    });
  });

  describe('messenger integration', () => {
    it('getGeolocation action resolves correctly via messenger', async () => {
      const mockFetch = createMockFetch('JP');

      await withController(
        { options: { fetch: mockFetch } },
        async ({ rootMessenger }) => {
          const result = await rootMessenger.call(
            'GeolocationController:getGeolocation',
          );

          expect(result).toBe('JP');
        },
      );
    });

    it('refreshGeolocation action resolves correctly via messenger', async () => {
      const mockFetch = jest
        .fn()
        .mockImplementationOnce(() =>
          Promise.resolve(createMockResponse('US', 200)),
        )
        .mockImplementationOnce(() =>
          Promise.resolve(createMockResponse('CA', 200)),
        );

      await withController(
        { options: { fetch: mockFetch } },
        async ({ rootMessenger }) => {
          await rootMessenger.call('GeolocationController:getGeolocation');

          const result = await rootMessenger.call(
            'GeolocationController:refreshGeolocation',
          );

          expect(result).toBe('CA');
        },
      );
    });

    it('getState returns current state via messenger', async () => {
      const mockFetch = createMockFetch('AU');

      await withController(
        { options: { fetch: mockFetch } },
        async ({ controller, rootMessenger }) => {
          await controller.getGeolocation();

          const state = rootMessenger.call('GeolocationController:getState');

          expect(state.location).toBe('AU');
          expect(state.status).toBe('complete');
        },
      );
    });

    it('stateChange event fires on state updates', async () => {
      const mockFetch = createMockFetch('NZ');
      const stateChanges: string[] = [];

      await withController(
        { options: { fetch: mockFetch } },
        async ({ controller, rootMessenger }) => {
          rootMessenger.subscribe(
            'GeolocationController:stateChange',
            (state) => {
              stateChanges.push(state.status);
            },
          );

          await controller.getGeolocation();

          expect(stateChanges).toStrictEqual(['loading', 'complete']);
        },
      );
    });
  });
});

/**
 * Creates a mock Response-like object compatible with the controller's fetch
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
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<GeolocationControllerMessenger>,
  MessengerEvents<GeolocationControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: GeolocationController;
  rootMessenger: RootMessenger;
  controllerMessenger: GeolocationControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<
    Omit<ConstructorParameters<typeof GeolocationController>[0], 'messenger'>
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
  return new Messenger({
    namespace: 'GeolocationController',
    parent: rootMessenger,
  });
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults as needed
 * (including `messenger` and `getGeolocationUrl`). The function is called
 * with the instantiated controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];

  jest.useFakeTimers();

  const rootMessenger = getRootMessenger();
  const controllerMessenger = getMessenger(rootMessenger);
  const defaultFetch = createMockFetch(UNKNOWN_LOCATION);

  const controller = new GeolocationController({
    messenger: controllerMessenger,
    getGeolocationUrl: (): string => MOCK_URL,
    fetch: defaultFetch,
    ...options,
  });

  try {
    return await testFunction({
      controller,
      rootMessenger,
      controllerMessenger,
    });
  } finally {
    jest.useRealTimers();
  }
}
