import { DEFAULT_MAX_RETRIES } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import type { ChompApiServiceMessenger } from './chomp-api-service';
import { ChompApiService } from './chomp-api-service';

describe('ChompApiService', () => {
  describe('ChompApiService:fetch', () => {
    it('returns the response from the API', async () => {
      nock('https://api.chomp.example.com')
        .get('/items/abc')
        .reply(200, { id: 'abc' });
      const { rootMessenger } = createService();

      const response = await rootMessenger.call(
        'ChompApiService:fetch',
        'abc',
      );

      expect(response).toStrictEqual({ id: 'abc' });
    });

    it('throws if the API returns a non-200 status', async () => {
      nock('https://api.chomp.example.com')
        .get('/items/abc')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);
      const { rootMessenger } = createService();

      await expect(
        rootMessenger.call('ChompApiService:fetch', 'abc'),
      ).rejects.toThrow("Chomp API failed with status '500'");
    });

    it.each([
      'not an object',
      { missing: 'id' },
      { id: 123 },
    ])(
      'throws if the API returns a malformed response %o',
      async (response) => {
        nock('https://api.chomp.example.com')
          .get('/items/abc')
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = createService();

        await expect(
          rootMessenger.call('ChompApiService:fetch', 'abc'),
        ).rejects.toThrow('Malformed response received from Chomp API');
      },
    );
  });

  describe('fetch', () => {
    it('does the same thing as the messenger action', async () => {
      nock('https://api.chomp.example.com')
        .get('/items/abc')
        .reply(200, { id: 'abc' });
      const { service } = createService();

      const response = await service.fetch('abc');

      expect(response).toStrictEqual({ id: 'abc' });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ChompApiServiceMessenger>,
  MessengerEvents<ChompApiServiceMessenger>
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
): ChompApiServiceMessenger {
  return new Messenger({
    namespace: 'ChompApiService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults as needed (including
 * `messenger`).
 * @returns The new service, root messenger, and service messenger.
 */
function createService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof ChompApiService>[0]>;
} = {}): {
  service: ChompApiService;
  rootMessenger: RootMessenger;
  messenger: ChompApiServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  const messenger = createServiceMessenger(rootMessenger);
  const service = new ChompApiService({
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
