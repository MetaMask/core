import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import type { RampsServiceMessenger } from './RampsService';
import { RampsService, RampsEnvironment } from './RampsService';

describe('RampsService', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('RampsService:getGeolocation', () => {
    it('returns the geolocation from the API', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .reply(200, 'US-TX');
      const { rootMessenger } = getService();

      const geolocationResponse = await rootMessenger.call(
        'RampsService:getGeolocation',
      );

      expect(geolocationResponse).toBe('US-TX');
    });

    it('uses the production URL when environment is Production', async () => {
      nock('https://on-ramp.api.cx.metamask.io')
        .get('/geolocation')
        .reply(200, 'US-TX');
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Production },
      });

      const geolocationResponse = await rootMessenger.call(
        'RampsService:getGeolocation',
      );

      expect(geolocationResponse).toBe('US-TX');
    });

    it('uses localhost URL when environment is Development', async () => {
      nock('http://localhost:3000').get('/geolocation').reply(200, 'US-TX');
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Development },
      });

      const geolocationResponse = await rootMessenger.call(
        'RampsService:getGeolocation',
      );

      expect(geolocationResponse).toBe('US-TX');
    });

    it('throws if the environment is invalid', () => {
      expect(() =>
        getService({
          options: { environment: 'invalid' as RampsEnvironment },
        }),
      ).toThrow('Invalid environment: invalid');
    });

    it('throws if the API returns an empty response', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .reply(200, '');
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('RampsService:getGeolocation'),
      ).rejects.toThrow('Malformed response received from geolocation API');
    });

    it('calls onDegraded listeners if the request takes longer than 5 seconds to resolve', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .reply(200, () => {
          clock.tick(6000);
          return 'US-TX';
        });
      const { service, rootMessenger } = getService();
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await rootMessenger.call('RampsService:getGeolocation');

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .times(4)
        .reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      await expect(
        rootMessenger.call('RampsService:getGeolocation'),
      ).rejects.toThrow(
        "Fetching 'https://on-ramp.uat-api.cx.metamask.io/geolocation' failed with status '500'",
      );
    });

    it('allows registering onBreak listeners', () => {
      const { service } = getService();
      const onBreakListener = jest.fn();

      const subscription = service.onBreak(onBreakListener);

      expect(subscription).toBeDefined();
      expect(subscription).toHaveProperty('dispose');
    });
  });

  describe('getGeolocation', () => {
    it('does the same thing as the messenger action', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .reply(200, 'US-TX');
      const { service } = getService();

      const geolocationResponse = await service.getGeolocation();

      expect(geolocationResponse).toBe('US-TX');
    });
  });

  describe('RampsService:getCountries', () => {
    const mockCountriesResponse = [
      {
        isoCode: 'US',
        flag: '🇺🇸',
        name: 'United States of America',
        phone: {
          prefix: '+1',
          placeholder: '(555) 123-4567',
          template: '(XXX) XXX-XXXX',
        },
        currency: 'USD',
        supported: true,
        recommended: true,
        unsupportedStates: ['ny'],
        transakSupported: true,
      },
      {
        isoCode: 'AT',
        flag: '🇦🇹',
        name: 'Austria',
        phone: {
          prefix: '+43',
          placeholder: '660 1234567',
          template: 'XXX XXXXXXX',
        },
        currency: 'EUR',
        supported: true,
        transakSupported: true,
      },
    ];

    it('returns the countries from the cache API', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({ action: 'deposit', sdk: '2.1.6', context: 'mobile-ios' })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService();

      const countriesResponse = await rootMessenger.call(
        'RampsService:getCountries',
        'deposit',
      );

      expect(countriesResponse).toMatchInlineSnapshot(`
        Array [
          Object {
            "currency": "USD",
            "flag": "🇺🇸",
            "isoCode": "US",
            "name": "United States of America",
            "phone": Object {
              "placeholder": "(555) 123-4567",
              "prefix": "+1",
              "template": "(XXX) XXX-XXXX",
            },
            "recommended": true,
            "supported": true,
            "transakSupported": true,
            "unsupportedStates": Array [
              "ny",
            ],
          },
          Object {
            "currency": "EUR",
            "flag": "🇦🇹",
            "isoCode": "AT",
            "name": "Austria",
            "phone": Object {
              "placeholder": "660 1234567",
              "prefix": "+43",
              "template": "XXX XXXXXXX",
            },
            "supported": true,
            "transakSupported": true,
          },
        ]
      `);
    });

    it('uses the production cache URL when environment is Production', async () => {
      nock('https://on-ramp-cache.api.cx.metamask.io')
        .get('/regions/countries')
        .query({ action: 'deposit', sdk: '2.1.6', context: 'mobile-ios' })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Production },
      });

      const countriesResponse = await rootMessenger.call(
        'RampsService:getCountries',
        'deposit',
      );

      expect(countriesResponse).toMatchInlineSnapshot(`
        Array [
          Object {
            "currency": "USD",
            "flag": "🇺🇸",
            "isoCode": "US",
            "name": "United States of America",
            "phone": Object {
              "placeholder": "(555) 123-4567",
              "prefix": "+1",
              "template": "(XXX) XXX-XXXX",
            },
            "recommended": true,
            "supported": true,
            "transakSupported": true,
            "unsupportedStates": Array [
              "ny",
            ],
          },
          Object {
            "currency": "EUR",
            "flag": "🇦🇹",
            "isoCode": "AT",
            "name": "Austria",
            "phone": Object {
              "placeholder": "660 1234567",
              "prefix": "+43",
              "template": "XXX XXXXXXX",
            },
            "supported": true,
            "transakSupported": true,
          },
        ]
      `);
    });

    it('uses localhost cache URL when environment is Development', async () => {
      nock('http://localhost:3001')
        .get('/regions/countries')
        .query({ action: 'deposit', sdk: '2.1.6', context: 'mobile-ios' })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Development },
      });

      const countriesResponse = await rootMessenger.call(
        'RampsService:getCountries',
        'deposit',
      );

      expect(countriesResponse).toMatchInlineSnapshot(`
        Array [
          Object {
            "currency": "USD",
            "flag": "🇺🇸",
            "isoCode": "US",
            "name": "United States of America",
            "phone": Object {
              "placeholder": "(555) 123-4567",
              "prefix": "+1",
              "template": "(XXX) XXX-XXXX",
            },
            "recommended": true,
            "supported": true,
            "transakSupported": true,
            "unsupportedStates": Array [
              "ny",
            ],
          },
          Object {
            "currency": "EUR",
            "flag": "🇦🇹",
            "isoCode": "AT",
            "name": "Austria",
            "phone": Object {
              "placeholder": "660 1234567",
              "prefix": "+43",
              "template": "XXX XXXXXXX",
            },
            "supported": true,
            "transakSupported": true,
          },
        ]
      `);
    });

    it('passes the action parameter correctly', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({ action: 'withdraw', sdk: '2.1.6', context: 'mobile-ios' })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService();

      const countriesResponse = await rootMessenger.call(
        'RampsService:getCountries',
        'withdraw',
      );

      expect(countriesResponse).toMatchInlineSnapshot(`
        Array [
          Object {
            "currency": "USD",
            "flag": "🇺🇸",
            "isoCode": "US",
            "name": "United States of America",
            "phone": Object {
              "placeholder": "(555) 123-4567",
              "prefix": "+1",
              "template": "(XXX) XXX-XXXX",
            },
            "recommended": true,
            "supported": true,
            "transakSupported": true,
            "unsupportedStates": Array [
              "ny",
            ],
          },
          Object {
            "currency": "EUR",
            "flag": "🇦🇹",
            "isoCode": "AT",
            "name": "Austria",
            "phone": Object {
              "placeholder": "660 1234567",
              "prefix": "+43",
              "template": "XXX XXXXXXX",
            },
            "supported": true,
            "transakSupported": true,
          },
        ]
      `);
    });

    it('throws if the API returns an error', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({ action: 'deposit', sdk: '2.1.6', context: 'mobile-ios' })
        .times(4)
        .reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      await expect(
        rootMessenger.call('RampsService:getCountries', 'deposit'),
      ).rejects.toThrow(
        "Fetching 'https://on-ramp-cache.uat-api.cx.metamask.io/regions/countries?action=deposit&sdk=2.1.6&context=mobile-ios' failed with status '500'",
      );
    });
  });

  describe('getCountries', () => {
    it('does the same thing as the messenger action', async () => {
      const mockCountries = [
        {
          isoCode: 'US',
          flag: '🇺🇸',
          name: 'United States',
          phone: { prefix: '+1', placeholder: '', template: '' },
          currency: 'USD',
          supported: true,
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({ action: 'deposit', sdk: '2.1.6', context: 'mobile-ios' })
        .reply(200, mockCountries);
      const { service } = getService();

      const countriesResponse = await service.getCountries('deposit');

      expect(countriesResponse).toMatchInlineSnapshot(`
        Array [
          Object {
            "currency": "USD",
            "flag": "🇺🇸",
            "isoCode": "US",
            "name": "United States",
            "phone": Object {
              "placeholder": "",
              "prefix": "+1",
              "template": "",
            },
            "supported": true,
          },
        ]
      `);
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<RampsServiceMessenger>,
  MessengerEvents<RampsServiceMessenger>
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
function getMessenger(rootMessenger: RootMessenger): RampsServiceMessenger {
  return new Messenger({
    namespace: 'RampsService',
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
  options?: Partial<ConstructorParameters<typeof RampsService>[0]>;
} = {}): {
  service: RampsService;
  rootMessenger: RootMessenger;
  messenger: RampsServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const service = new RampsService({
    fetch,
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
