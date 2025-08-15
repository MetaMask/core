import { Messenger } from '@metamask/base-controller';
import { SampleGasPricesController } from '@metamask/sample-controllers';
import type { SampleGasPricesControllerMessenger } from '@metamask/sample-controllers';

import type { SampleGasPricesControllerUpdateGasPricesAction } from './sample-gas-prices-controller-method-action-types';
import { flushPromises } from '../../../tests/helpers';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../base-controller/tests/helpers';
import { buildMockGetNetworkClientById } from '../../network-controller/tests/helpers';

describe('SampleGasPricesController', () => {
  describe('constructor', () => {
    it('uses all of the given state properties to initialize state', async () => {
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

      await withController({ state: givenState }, ({ controller }) => {
        expect(controller.state).toStrictEqual(givenState);
      });
    });

    it('fills in missing state properties with default values', async () => {
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
      const chainId = '0x42';
      const unrestrictedMessenger = buildUnrestrictedMessenger();
      const restrictedMessenger = buildRestrictedMessenger(
        unrestrictedMessenger,
      );
      unrestrictedMessenger.registerActionHandler(
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
      unrestrictedMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        buildMockGetNetworkClientById({
          // @ts-expect-error We are not supplying a complete NetworkClient.
          'AAAA-AAAA-AAAA-AAAA': {
            chainId,
          },
        }),
      );

      await withController(
        { messenger: restrictedMessenger },
        async ({ controller }) => {
          unrestrictedMessenger.publish(
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
        },
      );
    });

    it('does not fetch gas prices again if the selected network client ID changed but the selected chain ID did not', async () => {
      const chainId = '0x42';
      const unrestrictedMessenger = buildUnrestrictedMessenger();
      const restrictedMessenger = buildRestrictedMessenger(
        unrestrictedMessenger,
      );
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
      unrestrictedMessenger.registerActionHandler(
        'SampleGasPricesService:fetchGasPrices',
        fetchGasPrices,
      );
      unrestrictedMessenger.registerActionHandler(
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

      await withController({ messenger: restrictedMessenger }, async () => {
        unrestrictedMessenger.publish(
          'NetworkController:stateChange',
          // @ts-expect-error We are not supplying a complete NetworkState.
          { selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA' },
          [],
        );
        unrestrictedMessenger.publish(
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
      const chainId = '0x42';
      const unrestrictedMessenger = buildUnrestrictedMessenger();
      const restrictedMessenger = buildRestrictedMessenger(
        unrestrictedMessenger,
      );
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
      unrestrictedMessenger.registerActionHandler(
        'SampleGasPricesService:fetchGasPrices',
        fetchGasPrices,
      );
      unrestrictedMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        buildMockGetNetworkClientById({
          // @ts-expect-error We are not supplying a complete NetworkClient.
          'AAAA-AAAA-AAAA-AAAA': {
            chainId,
          },
        }),
      );

      await withController({ messenger: restrictedMessenger }, async () => {
        unrestrictedMessenger.publish(
          'NetworkController:stateChange',
          // @ts-expect-error We are not supplying a complete NetworkState.
          { selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA' },
          [],
        );
        unrestrictedMessenger.publish(
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

  describe.each([
    {
      description: 'updateGasPrices',
      updateGasPrices: ({
        controller,
        args,
      }: {
        controller: SampleGasPricesController;
        args: Parameters<SampleGasPricesController['updateGasPrices']>;
      }) => controller.updateGasPrices(...args),
    },
    {
      description: 'SampleGasPricesController:updateGasPrices',
      updateGasPrices: ({
        messenger,
        args,
      }: {
        messenger: UnrestrictedMessenger;
        args: Parameters<
          SampleGasPricesControllerUpdateGasPricesAction['handler']
        >;
      }) =>
        messenger.call('SampleGasPricesController:updateGasPrices', ...args),
    },
  ])('$description', ({ updateGasPrices }) => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-02'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('fetches and persists gas prices for the current chain through the service object', async () => {
      const chainId = '0x42';
      const unrestrictedMessenger = buildUnrestrictedMessenger();
      unrestrictedMessenger.registerActionHandler(
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

      await withController(
        { messenger: buildRestrictedMessenger(unrestrictedMessenger) },
        async ({ controller }) => {
          await updateGasPrices({
            controller,
            messenger: unrestrictedMessenger,
            args: [{ chainId }],
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
        },
      );
    });
  });
});

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: SampleGasPricesController;
  unrestrictedMessenger: UnrestrictedMessenger;
  restrictedMessenger: SampleGasPricesControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options that `withController` take.
 */
type WithControllerOptions = Partial<
  ConstructorParameters<typeof SampleGasPricesController>[0]
>;

/**
 * The arguments that `withController` takes.
 */
type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * The type of the messenger where all actions and events will be registered.
 */
type UnrestrictedMessenger = Messenger<
  ExtractAvailableAction<SampleGasPricesControllerMessenger>,
  ExtractAvailableEvent<SampleGasPricesControllerMessenger>
>;

/**
 * Constructs a SampleGasPricesController based on the given options, and calls
 * the given function with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag is equivalent to the options that the controller takes, but `messenger`
 * is filled in if not given. The function will be called with the built
 * controller, unrestricted messenger, and restricted messenger.
 * @returns The same return value as the given callback.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const unrestrictedMessenger = buildUnrestrictedMessenger();
  const restrictedMessenger = buildRestrictedMessenger(unrestrictedMessenger);
  const controller = new SampleGasPricesController({
    messenger: restrictedMessenger,
    ...rest,
  });
  return await fn({ controller, unrestrictedMessenger, restrictedMessenger });
}

/**
 * Constructs the unrestricted messenger for these tests. This is where all
 * actions and events will ultimately be registered.
 *
 * @returns The unrestricted messenger.
 */
function buildUnrestrictedMessenger(): UnrestrictedMessenger {
  const unrestrictedMessenger: UnrestrictedMessenger = new Messenger();
  return unrestrictedMessenger;
}

/**
 * Constructs the messenger suited for SampleGasPricesController.
 *
 * @param unrestrictedMessenger - The messenger from which the controller
 * messenger will be derived.
 * @returns The restricted messenger.
 */
function buildRestrictedMessenger(
  unrestrictedMessenger = buildUnrestrictedMessenger(),
): SampleGasPricesControllerMessenger {
  return unrestrictedMessenger.getRestricted({
    name: 'SampleGasPricesController',
    allowedActions: [
      'SampleGasPricesService:fetchGasPrices',
      'NetworkController:getNetworkClientById',
    ],
    allowedEvents: ['NetworkController:stateChange'],
  });
}
