import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';

import { RampsController, SdkEnvironment, Context } from './RampsController';
import type { RampsControllerMessenger } from './RampsController';

describe('RampsController', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let mockConsoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.spyOn(global, 'fetch') as jest.MockedFunction<
      typeof fetch
    >;
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initializes with default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          metamaskEnvironment: SdkEnvironment.Staging,
          context: Context.Browser,
          region: null,
        });
      });
    });

    it('initializes with custom state', async () => {
      const customState = {
        metamaskEnvironment: SdkEnvironment.Production,
        context: Context.Browser,
        region: {
          id: 'US',
          deposit: true,
          aggregator: false,
          global: true,
        },
      };

      await withController(
        { options: { state: customState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(customState);
        },
      );
    });
  });

  describe('getCountries', () => {
    it('fetches geolocation and countries, then updates state', async () => {
      const mockGeolocation = 'US';
      const mockCountriesData = {
        deposit: true,
        aggregator: false,
        global: true,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCountriesData,
        } as Response);

      await withController(async ({ controller }) => {
        await controller.getCountries();

        expect(mockFetch).toHaveBeenCalledTimes(2);
        // Default state is 'staging', which matches SdkEnvironment.Staging, so uses staging URL
        expect(mockFetch).toHaveBeenNthCalledWith(
          1,
          'https://on-ramp.uat-api.cx.metamask.io/geolocation',
        );
        expect(mockFetch).toHaveBeenNthCalledWith(
          2,
          'https://on-ramp.uat-api.cx.metamask.io/regions/countries/US',
        );

        expect(controller.state.region).toStrictEqual({
          id: mockGeolocation,
          deposit: mockCountriesData.deposit,
          aggregator: mockCountriesData.aggregator,
          global: mockCountriesData.global,
        });
      });
    });

    it('uses production API URL when metamaskEnvironment matches SdkEnvironment.Production', async () => {
      const mockGeolocation = 'CA';
      const mockCountriesData = {
        deposit: true,
        aggregator: true,
        global: false,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCountriesData,
        } as Response);

      await withController(
        {
          options: {
            state: {
              metamaskEnvironment: SdkEnvironment.Production,
              context: Context.Browser,
            },
          },
        },
        async ({ controller }) => {
          await controller.getCountries();

          expect(mockFetch).toHaveBeenNthCalledWith(
            1,
            'https://on-ramp.api.cx.metamask.io/geolocation',
          );
          expect(mockFetch).toHaveBeenNthCalledWith(
            2,
            'https://on-ramp.api.cx.metamask.io/regions/countries/CA',
          );
        },
      );
    });

    it('uses staging API URL when metamaskEnvironment matches SdkEnvironment.Staging', async () => {
      const mockGeolocation = 'GB';
      const mockCountriesData = {
        deposit: false,
        aggregator: true,
        global: true,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCountriesData,
        } as Response);

      await withController(
        {
          options: {
            state: {
              metamaskEnvironment: SdkEnvironment.Staging,
              context: Context.Browser,
            },
          },
        },
        async ({ controller }) => {
          await controller.getCountries();

          expect(mockFetch).toHaveBeenNthCalledWith(
            1,
            'https://on-ramp.uat-api.cx.metamask.io/geolocation',
          );
          expect(mockFetch).toHaveBeenNthCalledWith(
            2,
            'https://on-ramp.uat-api.cx.metamask.io/regions/countries/GB',
          );
        },
      );
    });

    it('uses localhost API URL when metamaskEnvironment is not Production or Staging', async () => {
      const mockGeolocation = 'DE';
      const mockCountriesData = {
        deposit: true,
        aggregator: false,
        global: false,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCountriesData,
        } as Response);

      // Test with a value that doesn't match Production or Staging, which should use localhost
      await withController(
        {
          options: {
            state: {
              // Use a string literal that doesn't match the enum values
              metamaskEnvironment: 'unknown' as unknown as SdkEnvironment,
              context: Context.Browser,
            },
          },
        },
        async ({ controller }) => {
          await controller.getCountries();

          expect(mockFetch).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/geolocation',
          );
          expect(mockFetch).toHaveBeenNthCalledWith(
            2,
            'http://localhost:3000/regions/countries/DE',
          );
        },
      );
    });

    it('handles geolocation fetch errors', async () => {
      const error = new Error('Network error');
      mockFetch.mockRejectedValueOnce(error);

      await withController(async ({ controller }) => {
        await controller.getCountries();

        // Verify both console.error calls: one from #getGeolocation and one from getCountries
        expect(mockConsoleError).toHaveBeenCalledTimes(2);
        expect(mockConsoleError).toHaveBeenNthCalledWith(
          1,
          'Error fetching geolocation:',
          error,
        );
        expect(mockConsoleError).toHaveBeenNthCalledWith(
          2,
          'Error in getCountries:',
          error,
        );
        expect(controller.state.region).toBeNull();
      });
    });

    it('handles countries fetch errors', async () => {
      const mockGeolocation = 'US';
      const error = new Error('Countries fetch failed');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockRejectedValueOnce(error);

      await withController(async ({ controller }) => {
        await controller.getCountries();

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Error in getCountries:',
          error,
        );
        expect(controller.state.region).toBeNull();
      });
    });

    it('handles non-ok geolocation response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      } as Response);

      await withController(async ({ controller }) => {
        await controller.getCountries();

        // The error occurs when trying to parse the response, which will be caught
        // by #getGeolocation and then re-thrown to be caught by getCountries
        expect(mockConsoleError).toHaveBeenCalled();
        expect(controller.state.region).toBeNull();
      });
    });

    it('handles non-ok countries response', async () => {
      const mockGeolocation = 'US';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
        } as Response);

      await withController(async ({ controller }) => {
        await controller.getCountries();

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Error in getCountries:',
          expect.objectContaining({
            message: 'Failed to fetch country data: Not Found',
          }),
        );
        expect(controller.state.region).toBeNull();
      });
    });

    it('handles invalid country data format - null data', async () => {
      const mockGeolocation = 'US';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => null,
        } as Response);

      await withController(async ({ controller }) => {
        await controller.getCountries();

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Error in getCountries:',
          expect.objectContaining({
            message: 'Invalid country data format',
          }),
        );
        expect(controller.state.region).toBeNull();
      });
    });

    it('handles invalid country data format - missing properties', async () => {
      const mockGeolocation = 'US';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deposit: true,
            // missing aggregator and global
          }),
        } as Response);

      await withController(async ({ controller }) => {
        await controller.getCountries();

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Error in getCountries:',
          expect.objectContaining({
            message: 'Invalid country data format',
          }),
        );
        expect(controller.state.region).toBeNull();
      });
    });

    it('handles invalid country data format - wrong property types', async () => {
      const mockGeolocation = 'US';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            deposit: 'true', // string instead of boolean
            aggregator: false,
            global: true,
          }),
        } as Response);

      await withController(async ({ controller }) => {
        await controller.getCountries();

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Error in getCountries:',
          expect.objectContaining({
            message: 'Invalid country data format',
          }),
        );
        expect(controller.state.region).toBeNull();
      });
    });

    it('clears existing region state on error', async () => {
      const initialRegion = {
        id: 'US',
        deposit: true,
        aggregator: false,
        global: true,
      };
      const error = new Error('Network error');

      mockFetch.mockRejectedValueOnce(error);

      await withController(
        {
          options: {
            state: {
              region: initialRegion,
              context: Context.Browser,
            },
          },
        },
        async ({ controller }) => {
          expect(controller.state.region).toStrictEqual(initialRegion);

          await controller.getCountries();

          expect(mockConsoleError).toHaveBeenCalled();
          expect(controller.state.region).toBeNull();
        },
      );
    });
  });

  describe('messenger action handlers', () => {
    it('registers getCountries action handler', async () => {
      const mockGeolocation = 'US';
      const mockCountriesData = {
        deposit: true,
        aggregator: false,
        global: true,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCountriesData,
        } as Response);

      await withController(async ({ rootMessenger, controller }) => {
        await rootMessenger.call('RampsController:getCountries');

        expect(controller.state.region).toStrictEqual({
          id: mockGeolocation,
          deposit: mockCountriesData.deposit,
          aggregator: mockCountriesData.aggregator,
          global: mockCountriesData.global,
        });
      });
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
          Object {
            "context": "browser",
            "metamaskEnvironment": "stg",
            "region": null,
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
          Object {
            "context": "browser",
            "metamaskEnvironment": "stg",
            "region": null,
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "context": "browser",
            "metamaskEnvironment": "stg",
            "region": null,
          }
        `);
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
          Object {
            "context": "browser",
            "metamaskEnvironment": "stg",
            "region": null,
          }
        `);
      });
    });
  });

  describe('state updates', () => {
    it('updates region state when getCountries is called', async () => {
      const mockGeolocation = 'FR';
      const mockCountriesData = {
        deposit: true,
        aggregator: true,
        global: true,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCountriesData,
        } as Response);

      await withController(async ({ controller }) => {
        expect(controller.state.region).toBeNull();

        await controller.getCountries();

        expect(controller.state.region).toStrictEqual({
          id: mockGeolocation,
          deposit: mockCountriesData.deposit,
          aggregator: mockCountriesData.aggregator,
          global: mockCountriesData.global,
        });
      });
    });

    it('overwrites existing region state when getCountries is called again', async () => {
      const initialRegion = {
        id: 'US',
        deposit: false,
        aggregator: false,
        global: false,
      };

      const mockGeolocation = 'JP';
      const mockCountriesData = {
        deposit: true,
        aggregator: true,
        global: true,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockGeolocation,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCountriesData,
        } as Response);

      await withController(
        {
          options: {
            state: {
              region: initialRegion,
              context: Context.Browser,
            },
          },
        },
        async ({ controller }) => {
          expect(controller.state.region).toStrictEqual(initialRegion);

          await controller.getCountries();

          expect(controller.state.region).toStrictEqual({
            id: mockGeolocation,
            deposit: mockCountriesData.deposit,
            aggregator: mockCountriesData.aggregator,
            global: mockCountriesData.global,
          });
          expect(controller.state.region).not.toStrictEqual(initialRegion);
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
  MessengerActions<RampsControllerMessenger>,
  MessengerEvents<RampsControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: RampsController;
  rootMessenger: RootMessenger;
  messenger: RampsControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options bag that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof RampsController>[0]>;
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
function getMessenger(rootMessenger: RootMessenger): RampsControllerMessenger {
  const messenger: RampsControllerMessenger = new Messenger({
    namespace: 'RampsController',
    parent: rootMessenger,
  });
  return messenger;
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults in as needed
 * (including `messenger`). The function is called with the new
 * controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const controller = new RampsController({
    messenger,
    state: options.state ?? {},
  });
  return await testFunction({ controller, rootMessenger, messenger });
}
