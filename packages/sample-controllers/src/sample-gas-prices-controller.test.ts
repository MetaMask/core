import { Messenger } from '@metamask/base-controller';
import { SampleGasPricesController } from '@metamask/sample-controllers';
import type { SampleGasPricesControllerMessenger } from '@metamask/sample-controllers';

import {
  getDefaultNetworkControllerState,
  type NetworkControllerGetStateAction,
} from './network-controller-types';
import type { AbstractGasPricesService } from './sample-gas-prices-service';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../base-controller/tests/helpers';

describe('SampleGasPricesController', () => {
  describe('constructor', () => {
    it('uses all of the given state properties to initialize state', () => {
      const gasPricesService = buildGasPricesService();
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
      const controller = new SampleGasPricesController({
        messenger: getMessenger(),
        state: givenState,
        gasPricesService,
      });

      expect(controller.state).toStrictEqual(givenState);
    });

    it('fills in missing state properties with default values', () => {
      const gasPricesService = buildGasPricesService();
      const controller = new SampleGasPricesController({
        messenger: getMessenger(),
        gasPricesService,
      });

      expect(controller.state).toMatchInlineSnapshot(`
        Object {
          "gasPricesByChainId": Object {},
        }
      `);
    });
  });

  describe('updateGasPrices', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-02'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('fetches gas prices for the current chain through the service object and updates state accordingly', async () => {
      const gasPricesService = buildGasPricesService();
      jest.spyOn(gasPricesService, 'fetchGasPrices').mockResolvedValue({
        low: 5,
        average: 10,
        high: 15,
      });
      const rootMessenger = getRootMessenger({
        networkControllerGetStateActionHandler: () => ({
          ...getDefaultNetworkControllerState(),
          chainId: '0x42',
        }),
      });
      const controller = new SampleGasPricesController({
        messenger: getMessenger(rootMessenger),
        gasPricesService,
      });

      await controller.updateGasPrices();

      expect(controller.state).toStrictEqual({
        gasPricesByChainId: {
          '0x42': {
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

/**
 * The union of actions that the root messenger allows.
 */
type RootAction = ExtractAvailableAction<SampleGasPricesControllerMessenger>;

/**
 * The union of events that the root messenger allows.
 */
type RootEvent = ExtractAvailableEvent<SampleGasPricesControllerMessenger>;

/**
 * Constructs the unrestricted messenger. This can be used to call actions and
 * publish events within the tests for this controller.
 *
 * @param args - The arguments to this function.
 * @param args.networkControllerGetStateActionHandler - Used to mock the
 * `NetworkController:getState` action on the messenger.
 * @returns The unrestricted messenger suited for SampleGasPricesController.
 */
function getRootMessenger({
  networkControllerGetStateActionHandler = jest
    .fn<
      ReturnType<NetworkControllerGetStateAction['handler']>,
      Parameters<NetworkControllerGetStateAction['handler']>
    >()
    .mockReturnValue(getDefaultNetworkControllerState()),
}: {
  networkControllerGetStateActionHandler?: NetworkControllerGetStateAction['handler'];
} = {}): Messenger<RootAction, RootEvent> {
  const rootMessenger = new Messenger<RootAction, RootEvent>();
  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    networkControllerGetStateActionHandler,
  );
  return rootMessenger;
}

/**
 * Constructs the messenger which is restricted to relevant SampleGasPricesController
 * actions and events.
 *
 * @param rootMessenger - The root messenger to restrict.
 * @returns The restricted messenger.
 */
function getMessenger(
  rootMessenger = getRootMessenger(),
): SampleGasPricesControllerMessenger {
  return rootMessenger.getRestricted({
    name: 'SampleGasPricesController',
    allowedActions: ['NetworkController:getState'],
    allowedEvents: [],
  });
}

/**
 * Constructs a mock SampleGasPricesService object for use in testing.
 *
 * @returns The mock SampleGasPricesService object.
 */
function buildGasPricesService(): AbstractGasPricesService {
  return {
    fetchGasPrices: jest.fn(),
  };
}
