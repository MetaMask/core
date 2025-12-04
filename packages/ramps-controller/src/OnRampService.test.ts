import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import type { OnRampServiceMessenger } from './OnRampService';
import { OnRampService, OnRampEnvironment } from './OnRampService';

describe('OnRampService', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('OnRampService:getGeolocation', () => {
    it('returns the country from the API', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .reply(200, {
          country: 'US',
        });
      const { rootMessenger } = getService();

      const geolocationResponse = await rootMessenger.call(
        'OnRampService:getGeolocation',
      );

      expect(geolocationResponse).toBe('US');
    });

    it('uses the production URL when environment is Production', async () => {
      nock('https://on-ramp.api.cx.metamask.io')
        .get('/geolocation')
        .reply(200, {
          country: 'GB',
        });
      const { rootMessenger } = getService({
        options: { environment: OnRampEnvironment.Production },
      });

      const geolocationResponse = await rootMessenger.call(
        'OnRampService:getGeolocation',
      );

      expect(geolocationResponse).toBe('GB');
    });

    it('uses localhost URL when environment is Development', async () => {
      nock('http://localhost:3000')
        .get('/geolocation')
        .reply(200, {
          country: 'CA',
        });
      const { rootMessenger } = getService({
        options: { environment: OnRampEnvironment.Development },
      });

      const geolocationResponse = await rootMessenger.call(
        'OnRampService:getGeolocation',
      );

      expect(geolocationResponse).toBe('CA');
    });

    it.each([
      'not an object',
      { missing: 'country' },
      { country: 123 },
      { country: null },
    ])(
      'throws if the API returns a malformed response %o',
      async (response) => {
        nock('https://on-ramp.uat-api.cx.metamask.io')
          .get('/geolocation')
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = getService();

        await expect(
          rootMessenger.call('OnRampService:getGeolocation'),
        ).rejects.toThrow('Malformed response received from geolocation API');
      },
    );

    it('calls onDegraded listeners if the request takes longer than 5 seconds to resolve', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .reply(200, () => {
          clock.tick(6000);
          return {
            country: 'US',
          };
        });
      const { service, rootMessenger } = getService();
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await rootMessenger.call('OnRampService:getGeolocation');

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .times(4)
        .reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(async () => {
        await clock.nextAsync();
      });

      await expect(
        rootMessenger.call('OnRampService:getGeolocation'),
      ).rejects.toThrow(
        "Fetching 'https://on-ramp.uat-api.cx.metamask.io/geolocation' failed with status '500'",
      );
    });
  });

  describe('getGeolocation', () => {
    it('does the same thing as the messenger action', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .reply(200, {
          country: 'US',
        });
      const { service } = getService();

      const geolocationResponse = await service.getGeolocation();

      expect(geolocationResponse).toBe('US');
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<OnRampServiceMessenger>,
  MessengerEvents<OnRampServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(rootMessenger: RootMessenger): OnRampServiceMessenger {
  return new Messenger({
    namespace: 'OnRampService',
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
function getService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof OnRampService>[0]>;
} = {}): {
  service: OnRampService;
  rootMessenger: RootMessenger;
  messenger: OnRampServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const service = new OnRampService({
    fetch,
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}

