import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { UNKNOWN_LOCATION } from './geolocation-api-service/geolocation-api-service';
import type { GeolocationControllerMessenger } from './GeolocationController';
import {
  GeolocationController,
  getDefaultGeolocationControllerState,
} from './GeolocationController';

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
    it('sets location, status to complete, and lastFetchedAt after fetch', async () => {
      await withController(
        { serviceResponse: 'GB' },
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

    it('transitions status from idle to loading to complete', async () => {
      const states: string[] = [];
      let resolveService!: (value: string) => void;

      await withController(
        {
          serviceHandler: () =>
            new Promise<string>((resolve) => {
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

          resolveService('DE');
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
                return Promise.resolve('US');
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

  describe('refreshGeolocation', () => {
    it('resets lastFetchedAt and calls service with bypassCache', async () => {
      let callCount = 0;
      const mockServiceHandler = jest.fn(
        (_options?: { bypassCache?: boolean }) => {
          callCount += 1;
          return Promise.resolve(callCount === 1 ? 'US' : 'GB');
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

    it('does not let a stale in-flight getGeolocation overwrite refreshed state', async () => {
      let resolveOld!: (value: string) => void;
      let resolveNew!: (value: string) => void;

      let callCount = 0;
      const mockServiceHandler = jest.fn(() => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<string>((resolve) => {
            resolveOld = resolve;
          });
        }
        return new Promise<string>((resolve) => {
          resolveNew = resolve;
        });
      });

      await withController(
        { serviceHandler: mockServiceHandler },
        async ({ controller }) => {
          const oldPromise = controller.getGeolocation();

          const refreshPromise = controller.refreshGeolocation();

          resolveNew('GB');
          await refreshPromise;
          expect(controller.state.location).toBe('GB');

          resolveOld('US');
          await oldPromise;

          expect(controller.state.location).toBe('GB');
          expect(controller.state.status).toBe('complete');
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
              return Promise.resolve('US');
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
            .mockResolvedValueOnce('US')
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

    it('does not let a stale in-flight error overwrite refreshed state', async () => {
      let rejectOld!: (reason: Error) => void;

      let callCount = 0;
      const mockServiceHandler = jest.fn(() => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<string>((_resolve, reject) => {
            rejectOld = reject;
          });
        }
        return Promise.resolve('DE');
      });

      await withController(
        { serviceHandler: mockServiceHandler },
        async ({ controller }) => {
          const oldPromise = controller.getGeolocation();

          const refreshPromise = controller.refreshGeolocation();
          await refreshPromise;
          expect(controller.state.location).toBe('DE');
          expect(controller.state.status).toBe('complete');

          rejectOld(new Error('Network timeout'));
          await oldPromise;

          expect(controller.state.status).toBe('complete');
          expect(controller.state.error).toBeNull();
          expect(controller.state.location).toBe('DE');
        },
      );
    });
  });

  describe('GeolocationController:getGeolocation', () => {
    it('resolves with the fetched country code', async () => {
      await withController(
        { serviceResponse: 'JP' },
        async ({ rootMessenger }) => {
          const result = await rootMessenger.call(
            'GeolocationController:getGeolocation',
          );

          expect(result).toBe('JP');
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
            return Promise.resolve(callCount === 1 ? 'US' : 'CA');
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
  serviceResponse?: string;
  serviceHandler?: (options?: { bypassCache?: boolean }) => Promise<string>;
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
    actions: ['GeolocationApiService:fetchGeolocation'],
    events: [],
    messenger,
  });
  return messenger;
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor and optionally a
 * `serviceResponse` string or a `serviceHandler` function to mock the
 * `GeolocationApiService:fetchGeolocation` action. The function is called
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

  const handler: (options?: { bypassCache?: boolean }) => Promise<string> =
    serviceHandler ??
    ((): Promise<string> =>
      Promise.resolve(serviceResponse ?? UNKNOWN_LOCATION));

  rootMessenger.registerActionHandler(
    'GeolocationApiService:fetchGeolocation',
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
