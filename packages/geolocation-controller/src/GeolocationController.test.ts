import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { GeolocationData } from './geolocation-api-service/geolocation-api-service.js';
import {
  getUnknownGeolocationData,
  UNKNOWN_LOCATION,
} from './geolocation-api-service/geolocation-api-service.js';
import type { GeolocationControllerMessenger } from './GeolocationController.js';
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
    it('sets location, status to complete, and lastFetchedAt after fetch', async () => {
      await withController(
        { serviceResponse: { country: 'GB' } },
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

    it('joins the country and region into the location code', async () => {
      await withController(
        { serviceResponse: { country: 'US', region: 'NY' } },
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
          serviceResponse: {
            country: 'US',
            region: 'WA',
            timezone: 'America/Los_Angeles',
          },
        },
        async ({ controller }) => {
          await controller.getGeolocation();

          expect(controller.state.country).toBe('US');
          expect(controller.state.region).toBe('WA');
          expect(controller.state.timezone).toBe('America/Los_Angeles');
        },
      );
    });

    it('transitions status from idle to loading to complete', async () => {
      const states: string[] = [];
      let resolveService!: (value: GeolocationData) => void;

      await withController(
        {
          serviceHandler: () =>
            new Promise<GeolocationData>((resolve) => {
              resolveService = resolve;
            }),
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.subscribe(
            'GeolocationController:stateChange',
            (state) => {
              states.push(state.status);
            },
          );

          const promise = controller.getGeolocation();
          expect(controller.state.status).toBe('loading');

          resolveService(buildGeolocationData({ country: 'DE' }));
          await promise;

          expect(states).toStrictEqual(['loading', 'complete']);
        },
      );
    });

    describe('when the service throws', () => {
      it('sets status to error with the error message', async () => {
        await withController(
          {
            serviceHandler: () => {
              throw new Error('Network error');
            },
          },
          async ({ controller }) => {
            await controller.getGeolocation();

            expect(controller.state.status).toBe('error');
            expect(controller.state.error).toBe('Network error');
          },
        );
      });

      it('preserves the last known location', async () => {
        let callCount = 0;

        await withController(
          {
            serviceHandler: () => {
              callCount += 1;
              if (callCount === 1) {
                return Promise.resolve(buildGeolocationData({ country: 'US' }));
              }
              throw new Error('Network error');
            },
          },
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
          {
            serviceHandler: () => {
              throw new Error('Network error');
            },
          },
          async ({ controller }) => {
            const result = await controller.getGeolocation();

            expect(result).toBe(UNKNOWN_LOCATION);
            expect(controller.state.location).toBe(UNKNOWN_LOCATION);
          },
        );
      });

      it('stores string representation of non-Error thrown values', async () => {
        await withController(
          {
            serviceHandler: jest.fn().mockRejectedValue('string error'),
          },
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
          serviceResponse: {
            country: 'FR',
            region: '75',
            timezone: 'Europe/Paris',
          },
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

    it('rejects when the service throws instead of returning stale data', async () => {
      let callCount = 0;

      await withController(
        {
          serviceHandler: () => {
            callCount += 1;
            if (callCount === 1) {
              return Promise.resolve(
                buildGeolocationData({
                  country: 'US',
                  region: 'WA',
                  timezone: 'America/Los_Angeles',
                }),
              );
            }
            throw new Error('Network error');
          },
        },
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

    it('rejects when the service throws and no prior value exists', async () => {
      await withController(
        {
          serviceHandler: () => {
            throw new Error('Network error');
          },
        },
        async ({ controller }) => {
          await expect(controller.getGeolocationData()).rejects.toThrow(
            'Network error',
          );
        },
      );
    });
  });

  describe('refreshGeolocation', () => {
    it('resets lastFetchedAt and calls service with bypassCache', async () => {
      let callCount = 0;
      const mockServiceHandler = jest.fn(
        (_options?: { bypassCache?: boolean }) => {
          callCount += 1;
          return Promise.resolve(
            buildGeolocationData({ country: callCount === 1 ? 'US' : 'GB' }),
          );
        },
      );

      await withController(
        { serviceHandler: mockServiceHandler },
        async ({ controller }) => {
          await controller.getGeolocation();
          expect(controller.state.location).toBe('US');
          expect(controller.state.lastFetchedAt).not.toBeNull();

          const refreshPromise = controller.refreshGeolocation();
          expect(controller.state.lastFetchedAt).toBeNull();

          const result = await refreshPromise;
          expect(result).toBe('GB');
          expect(controller.state.location).toBe('GB');
          expect(mockServiceHandler).toHaveBeenLastCalledWith({
            bypassCache: true,
          });
        },
      );
    });

    it('sets status to error when the service throws', async () => {
      let callCount = 0;

      await withController(
        {
          serviceHandler: () => {
            callCount += 1;
            if (callCount === 1) {
              return Promise.resolve(buildGeolocationData({ country: 'US' }));
            }
            throw new Error('Refresh failed');
          },
        },
        async ({ controller }) => {
          await controller.getGeolocation();
          expect(controller.state.location).toBe('US');

          const result = await controller.refreshGeolocation();
          expect(result).toBe('US');
          expect(controller.state.status).toBe('error');
          expect(controller.state.error).toBe('Refresh failed');
        },
      );
    });

    it('stores string representation of non-Error thrown values', async () => {
      await withController(
        {
          serviceHandler: jest
            .fn()
            .mockResolvedValueOnce(buildGeolocationData({ country: 'US' }))
            .mockRejectedValueOnce('string refresh error'),
        },
        async ({ controller }) => {
          await controller.getGeolocation();

          await controller.refreshGeolocation();
          expect(controller.state.status).toBe('error');
          expect(controller.state.error).toBe('string refresh error');
        },
      );
    });
  });

  describe('GeolocationController:getGeolocation', () => {
    it('resolves with the fetched country code', async () => {
      await withController(
        { serviceResponse: { country: 'JP' } },
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
          serviceResponse: {
            country: 'JP',
            region: '13',
            timezone: 'Asia/Tokyo',
          },
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
      let callCount = 0;

      await withController(
        {
          serviceHandler: () => {
            callCount += 1;
            return Promise.resolve(
              buildGeolocationData({ country: callCount === 1 ? 'US' : 'CA' }),
            );
          },
        },
        async ({ rootMessenger }) => {
          await rootMessenger.call('GeolocationController:getGeolocation');

          const result = await rootMessenger.call(
            'GeolocationController:refreshGeolocation',
          );

          expect(result).toBe('CA');
        },
      );
    });
  });
});

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
  options?: Partial<
    Omit<ConstructorParameters<typeof GeolocationController>[0], 'messenger'>
  >;
  serviceResponse?: Partial<GeolocationData>;
  serviceHandler?: (options?: {
    bypassCache?: boolean;
  }) => Promise<GeolocationData>;
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
 * Builds complete geolocation data from a partial fixture.
 *
 * @param data - The known geolocation fields.
 * @returns The geolocation data with unknown fields set to null.
 */
function buildGeolocationData(
  data: Partial<GeolocationData> = {},
): GeolocationData {
  return { ...getUnknownGeolocationData(), ...data };
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor and optionally a
 * `serviceResponse` fixture or a `serviceHandler` function to mock the
 * `GeolocationApiService:fetchGeolocationData` action. The function is called
 * with the instantiated controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {}, serviceResponse, serviceHandler } = {}, testFunction] =
    args.length === 2 ? args : [{}, args[0]];

  jest.useFakeTimers();

  const rootMessenger = getRootMessenger();
  const controllerMessenger = getMessenger(rootMessenger);

  const handler: (options?: {
    bypassCache?: boolean;
  }) => Promise<GeolocationData> =
    serviceHandler ??
    ((): Promise<GeolocationData> =>
      Promise.resolve(buildGeolocationData(serviceResponse)));

  rootMessenger.registerActionHandler(
    'GeolocationApiService:fetchGeolocationData',
    handler,
  );

  const controller = new GeolocationController({
    messenger: controllerMessenger,
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
