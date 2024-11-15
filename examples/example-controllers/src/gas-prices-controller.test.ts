import { ControllerMessenger } from '@metamask/base-controller';
import { GasPricesController } from '@metamask/example-controllers';
import type { GasPricesControllerMessenger } from '@metamask/example-controllers';

import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../packages/base-controller/tests/helpers';
import type { AbstractGasPricesService } from './gas-prices-service/abstract-gas-prices-service';
import {
  getDefaultNetworkControllerState,
  type NetworkControllerGetStateAction,
} from './network-controller-types';

describe('GasPricesController', () => {
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
      const controller = new GasPricesController({
        messenger: getControllerMessenger(),
        state: givenState,
        gasPricesService,
      });

      expect(controller.state).toStrictEqual(givenState);
    });

    it('fills in missing state properties with default values', () => {
      const gasPricesService = buildGasPricesService();
      const controller = new GasPricesController({
        messenger: getControllerMessenger(),
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
      const rootMessenger = getRootControllerMessenger({
        networkControllerGetStateActionHandler: () => ({
          ...getDefaultNetworkControllerState(),
          chainId: '0x42',
        }),
      });
      const controller = new GasPricesController({
        messenger: getControllerMessenger(rootMessenger),
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
type RootAction = ExtractAvailableAction<GasPricesControllerMessenger>;

/**
 * The union of events that the root messenger allows.
 */
type RootEvent = ExtractAvailableEvent<GasPricesControllerMessenger>;

/**
 * Constructs the unrestricted messenger. This can be used to call actions and
 * publish events within the tests for this controller.
 *
 * @param args - The arguments to this function.
 * @param args.networkControllerGetStateActionHandler - Used to mock the
 * `NetworkController:getState` action on the messenger.
 * @returns The unrestricted messenger suited for GasPricesController.
 */
function getRootControllerMessenger({
  networkControllerGetStateActionHandler = jest
    .fn<
      ReturnType<NetworkControllerGetStateAction['handler']>,
      Parameters<NetworkControllerGetStateAction['handler']>
    >()
    .mockReturnValue(getDefaultNetworkControllerState()),
}: {
  networkControllerGetStateActionHandler?: NetworkControllerGetStateAction['handler'];
} = {}): ControllerMessenger<RootAction, RootEvent> {
  const rootMessenger = new ControllerMessenger<RootAction, RootEvent>();
  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    networkControllerGetStateActionHandler,
  );
  return rootMessenger;
}

/**
 * Constructs the messenger which is restricted to relevant GasPricesController
 * actions and events.
 *
 * @param rootMessenger - The root messenger to restrict.
 * @returns The restricted messenger.
 */
function getControllerMessenger(
  rootMessenger = getRootControllerMessenger(),
): GasPricesControllerMessenger {
  return rootMessenger.getRestricted({
    name: 'GasPricesController',
    allowedActions: ['NetworkController:getState'],
    allowedEvents: [],
  });
}

/**
 * Constructs a mock GasPricesService object for use in testing.
 *
 * @returns The mock GasPricesService object.
 */
function buildGasPricesService(): AbstractGasPricesService {
  return {
    fetchGasPrices: jest.fn(),
  };
}
