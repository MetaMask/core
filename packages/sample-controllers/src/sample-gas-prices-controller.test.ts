import {
  Messenger,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';

import {
  getDefaultNetworkControllerState,
  type NetworkControllerGetStateAction,
} from './network-controller-types';
import { SampleGasPricesController } from './sample-gas-prices-controller';
import type { SampleGasPricesControllerMessenger } from './sample-gas-prices-controller';
import type { SampleAbstractGasPricesService } from './sample-gas-prices-service';

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
 * The union of all SampleGasPricesController actions.
 */
type AllSampleGasPricesControllerActions =
  MessengerActions<SampleGasPricesControllerMessenger>;

/**
 * The union of all SampleGasPricesController events.
 */
type AllSampleGasPricesControllerEvents =
  MessengerEvents<SampleGasPricesControllerMessenger>;

/**
 * Construct the root messenger that is populated with all external actions/events that the
 * SampleGasPricesController needs.
 *
 * @param args - The arguments to this function.
 * @param args.networkControllerGetStateActionHandler - Used to mock the
 * `NetworkController:getState` action on the messenger.
 * @returns A root messenger that is populated with all external actions/events that the
 * SampleGasPricesController needs.
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
} = {}): Messenger<
  'Root',
  AllSampleGasPricesControllerActions,
  AllSampleGasPricesControllerEvents
> {
  const rootMessenger = new Messenger<
    'Root',
    AllSampleGasPricesControllerActions,
    AllSampleGasPricesControllerEvents
  >({ namespace: 'Root' });
  // Create NetworkController messenger just so that it can delegate to root
  const networkControllerMessenger = new Messenger<
    'NetworkController',
    NetworkControllerGetStateAction,
    never,
    typeof rootMessenger
  >({ namespace: 'NetworkController', parent: rootMessenger });
  // Register stubs for required action handlers
  networkControllerMessenger.registerActionHandler(
    'NetworkController:getState',
    networkControllerGetStateActionHandler,
  );

  return rootMessenger;
}

/**
 * Constructs the SampleGasPricesController messenger.
 *
 * @param rootMessenger - The root messenger, with all external actions/events required by the
 * SampleGasPricesController messenger.
 * @returns The restricted messenger.
 */
function getMessenger(
  rootMessenger = getRootMessenger(),
): SampleGasPricesControllerMessenger {
  const messenger = new Messenger<
    'SampleGasPricesController',
    AllSampleGasPricesControllerActions,
    AllSampleGasPricesControllerEvents,
    typeof rootMessenger
  >({
    namespace: 'SampleGasPricesController',
    parent: rootMessenger,
  });
  // Delegate external actions/events
  rootMessenger.delegate({
    actions: ['NetworkController:getState'],
    messenger,
  });
  return messenger;
}

/**
 * Constructs a mock SampleGasPricesService object for use in testing.
 *
 * @returns The mock SampleGasPricesService object.
 */
function buildGasPricesService(): SampleAbstractGasPricesService {
  return {
    fetchGasPrices: jest.fn(),
  };
}
