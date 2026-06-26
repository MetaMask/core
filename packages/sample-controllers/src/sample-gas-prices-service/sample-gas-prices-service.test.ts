import { DEFAULT_MAX_RETRIES } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import type { SampleGasPricesServiceMessenger } from './sample-gas-prices-service';
import { SampleGasPricesService } from './sample-gas-prices-service';

describe('SampleGasPricesService', () => {
  describe('SampleGasPricesService:fetchGasPrices', () => {
    it('returns the low, average, and high gas prices from the API', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const { rootMessenger } = createService();

      const gasPricesResponse = await rootMessenger.call(
        'SampleGasPricesService:fetchGasPrices',
        '0x1',
      );

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });

    it('throws if the API returns a non-200 status', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow("Gas prices API failed with status '500'");
    });

    it.each([
      'not an object',
      { missing: 'data' },
      { data: 'not an object' },
      { data: { missing: 'low', average: 2, high: 3 } },
      { data: { low: 1, missing: 'average', high: 3 } },
      { data: { low: 1, average: 2, missing: 'high' } },
      { data: { low: 'not a number', average: 2, high: 3 } },
      { data: { low: 1, average: 'not a number', high: 3 } },
      { data: { low: 1, average: 2, high: 'not a number' } },
    ])(
      'throws if the API returns a malformed response %o',
      async (response) => {
        nock('https://api.example.com')
          .get('/gas-prices')
          .query({ chainId: 'eip155:1' })
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = createService();

        await expect(
          rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
        ).rejects.toThrow('Malformed response received from gas prices API');
      },
    );
  });

  describe('fetchGasPrices', () => {
    it('does the same thing as the messenger action', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const { service } = createService();

      const gasPricesResponse = await service.fetchGasPrices('0x1');

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SampleGasPricesServiceMessenger>,
  MessengerEvents<SampleGasPricesServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The service-specific messenger.
 */
function createServiceMessenger(
  rootMessenger: RootMessenger,
): SampleGasPricesServiceMessenger {
  return new Messenger({
    namespace: 'SampleGasPricesService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults in as needed (including
 * `messenger`).
 * @returns The new service, root messenger, and service messenger.
 */
function createService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof SampleGasPricesService>[0]>;
} = {}): {
  service: SampleGasPricesService;
  rootMessenger: RootMessenger;
  messenger: SampleGasPricesServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  const messenger = createServiceMessenger(rootMessenger);
  const service = new SampleGasPricesService({
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
