import { Messenger, deriveStateFromMetadata } from '@metamask/base-controller';
import { SampleGasPricesController } from '@metamask/sample-controllers';
import type { SampleGasPricesControllerMessenger } from '@metamask/sample-controllers';

import { flushPromises } from '../../../tests/helpers';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../base-controller/tests/helpers';
import { buildMockGetNetworkClientById } from '../../network-controller/tests/helpers';

describe('SampleGasPricesController', () => {
  describe('constructor', () => {
    it('accepts initial state', async () => {
      const givenState = {
        gasPricesByChainId: {
          '0x1': {
            low: 10,
            average: 15,
            high: 20,
            fetchedDate: '2024-01-01',
          },
        },
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(givenState);
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "gasPricesByChainId": Object {},
          }
        `);
      });
    });
  });

  describe('on NetworkController:stateChange', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-02'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('fetches and updates gas prices for the newly selected chain ID, if it has changed', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const chainId = '0x42';
        rootMessenger.registerActionHandler(
          'SampleGasPricesService:fetchGasPrices',
          async (givenChainId) => {
            // eslint-disable-next-line jest/no-conditional-in-test
            if (givenChainId === chainId) {
              return {
                low: 5,
                average: 10,
                high: 15,
              };
            }

            throw new Error(`Unrecognized chain ID '${givenChainId}'`);
          },
        );
        rootMessenger.registerActionHandler(
          'NetworkController:getNetworkClientById',
          buildMockGetNetworkClientById({
            // @ts-expect-error We are not supplying a complete NetworkClient.
            'AAAA-AAAA-AAAA-AAAA': {
              chainId,
            },
          }),
        );

        rootMessenger.publish(
          'NetworkController:stateChange',
          // @ts-expect-error We are not supplying a complete NetworkState.
          { selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA' },
          [],
        );
        await flushPromises();

        expect(controller.state).toStrictEqual({
          gasPricesByChainId: {
            [chainId]: {
              low: 5,
              average: 10,
              high: 15,
              fetchedDate: '2024-01-02T00:00:00.000Z',
            },
          },
        });
      });
    });

    it('does not fetch gas prices again if the selected network client ID changed but the selected chain ID did not', async () => {
      await withController(async ({ rootMessenger }) => {
        const chainId = '0x42';
        let i = 0;
        const delays = [5000, 1000];
        const fetchGasPrices = jest.fn(async (givenChainId) => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (givenChainId === chainId) {
            jest.advanceTimersByTime(delays[i]);
            i += 1;
            return {
              low: 5,
              average: 10,
              high: 15,
            };
          }

          throw new Error(`Unrecognized chain ID '${givenChainId}'`);
        });
        rootMessenger.registerActionHandler(
          'SampleGasPricesService:fetchGasPrices',
          fetchGasPrices,
        );
        rootMessenger.registerActionHandler(
          'NetworkController:getNetworkClientById',
          buildMockGetNetworkClientById({
            // @ts-expect-error We are not supplying a complete NetworkClient.
            'AAAA-AAAA-AAAA-AAAA': {
              chainId,
            },
            // @ts-expect-error We are not supplying a complete NetworkClient.
            'BBBB-BBBB-BBBB-BBBB': {
              chainId,
            },
          }),
        );

        rootMessenger.publish(
          'NetworkController:stateChange',
          // @ts-expect-error We are not supplying a complete NetworkState.
          { selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA' },
          [],
        );
        rootMessenger.publish(
          'NetworkController:stateChange',
          // @ts-expect-error We are not supplying a complete NetworkState.
          { selectedNetworkClientId: 'BBBB-BBBB-BBBB-BBBB' },
          [],
        );
        jest.runAllTimers();
        await flushPromises();

        expect(fetchGasPrices).toHaveBeenCalledTimes(1);
      });
    });

    it('does not fetch gas prices for the selected chain ID again if it has not changed', async () => {
      await withController(async ({ rootMessenger }) => {
        const chainId = '0x42';
        const fetchGasPrices = jest.fn(async (givenChainId) => {
          // eslint-disable-next-line jest/no-conditional-in-test
          if (givenChainId === chainId) {
            return {
              low: 5,
              average: 10,
              high: 15,
            };
          }

          throw new Error(`Unrecognized chain ID '${givenChainId}'`);
        });
        rootMessenger.registerActionHandler(
          'SampleGasPricesService:fetchGasPrices',
          fetchGasPrices,
        );
        rootMessenger.registerActionHandler(
          'NetworkController:getNetworkClientById',
          buildMockGetNetworkClientById({
            // @ts-expect-error We are not supplying a complete NetworkClient.
            'AAAA-AAAA-AAAA-AAAA': {
              chainId,
            },
          }),
        );

        rootMessenger.publish(
          'NetworkController:stateChange',
          // @ts-expect-error We are not supplying a complete NetworkState.
          { selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA' },
          [],
        );
        rootMessenger.publish(
          'NetworkController:stateChange',
          // @ts-expect-error We are not supplying a complete NetworkState.
          { selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA' },
          [],
        );
        await flushPromises();

        expect(fetchGasPrices).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('SampleGasPricesController:updateGasPrices', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-02'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('fetches and persists gas prices for the current chain through the service object', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const chainId = '0x42';
        rootMessenger.registerActionHandler(
          'SampleGasPricesService:fetchGasPrices',
          async (givenChainId) => {
            // eslint-disable-next-line jest/no-conditional-in-test
            if (givenChainId === chainId) {
              return {
                low: 5,
                average: 10,
                high: 15,
              };
            }

            throw new Error(`Unrecognized chain ID '${givenChainId}'`);
          },
        );

        await rootMessenger.call('SampleGasPricesController:updateGasPrices', {
          chainId,
        });

        expect(controller.state).toStrictEqual({
          gasPricesByChainId: {
            [chainId]: {
              low: 5,
              average: 10,
              high: 15,
              fetchedDate: '2024-01-02T00:00:00.000Z',
            },
          },
        });
      });
    });
  });

  describe('updateGasPrices', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-02'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does the same thing as the messenger action', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const chainId = '0x42';
        rootMessenger.registerActionHandler(
          'SampleGasPricesService:fetchGasPrices',
          async (givenChainId) => {
            // eslint-disable-next-line jest/no-conditional-in-test
            if (givenChainId === chainId) {
              return {
                low: 5,
                average: 10,
                high: 15,
              };
            }

            throw new Error(`Unrecognized chain ID '${givenChainId}'`);
          },
        );

        await controller.updateGasPrices({ chainId });

        expect(controller.state).toStrictEqual({
          gasPricesByChainId: {
            [chainId]: {
              low: 5,
              average: 10,
              high: 15,
              fetchedDate: '2024-01-02T00:00:00.000Z',
            },
          },
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
            'anonymous',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
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
            "gasPricesByChainId": Object {},
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
            "gasPricesByChainId": Object {},
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
            "gasPricesByChainId": Object {},
          }
        `);
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  ExtractAvailableAction<SampleGasPricesControllerMessenger>,
  ExtractAvailableEvent<SampleGasPricesControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: SampleGasPricesController;
  rootMessenger: RootMessenger;
  messenger: SampleGasPricesControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options bag that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof SampleGasPricesController>[0]>;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger();
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
): SampleGasPricesControllerMessenger {
  return rootMessenger.getRestricted({
    name: 'SampleGasPricesController',
    allowedActions: [
      'SampleGasPricesService:fetchGasPrices',
      'NetworkController:getNetworkClientById',
    ],
    allowedEvents: ['NetworkController:stateChange'],
  });
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
  const controller = new SampleGasPricesController({
    messenger,
    ...options,
  });
  return await testFunction({ controller, rootMessenger, messenger });
}
