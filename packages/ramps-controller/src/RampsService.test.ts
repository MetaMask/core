import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import { flushPromises } from '../../../tests/helpers';
import packageJson from '../package.json';
import type { RampsServiceMessenger } from './RampsService';
import { RampsService, RampsEnvironment } from './RampsService';

const CONTROLLER_VERSION = packageJson.version;

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
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .reply(200, 'us-tx');
      const { rootMessenger } = getService();

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
      await clock.runAllAsync();
      await flushPromises();
      const geolocationResponse = await geolocationPromise;

      expect(geolocationResponse).toBe('us-tx');
    });

    it('uses the production URL when environment is Production', async () => {
      nock('https://on-ramp.api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .reply(200, 'us-tx');
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Production },
      });

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
      await clock.runAllAsync();
      await flushPromises();
      const geolocationResponse = await geolocationPromise;

      expect(geolocationResponse).toBe('us-tx');
    });

    it('uses staging URL when environment is Development', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .reply(200, 'us-tx');
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Development },
      });

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
      await clock.runAllAsync();
      await flushPromises();
      const geolocationResponse = await geolocationPromise;

      expect(geolocationResponse).toBe('us-tx');
    });

    it('throws if the API returns an empty response', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .reply(200, '');
      const { rootMessenger } = getService();

      const geolocationPromise = rootMessenger.call('RampsService:getGeolocation');
      await clock.runAllAsync();
      await flushPromises();
      await expect(geolocationPromise).rejects.toThrow('Malformed response received from geolocation API');
    });

    it('throws when primary API fails', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .times(4)
        .reply(500, 'Internal Server Error');
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      const geolocationPromise = rootMessenger.call('RampsService:getGeolocation');
      await clock.runAllAsync();
      await flushPromises();
      await expect(geolocationPromise).rejects.toThrow(
        `Fetching 'https://on-ramp.uat-api.cx.metamask.io/geolocation?sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios' failed with status '500'`,
      );
    });

    it('calls onDegraded listeners if the request takes longer than 5 seconds to resolve', async () => {
      let resolveDelayedResponse: () => void;
      const delayedResponsePromise = new Promise<void>((resolve) => {
        resolveDelayedResponse = resolve;
      });

      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .reply(200, () => {
          return new Promise<string>((resolve) => {
            setTimeout(() => {
              resolve('US-TX');
            }, 6000);
          });
        });
      const { service, rootMessenger } = getService();
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      const geolocationPromise = rootMessenger.call('RampsService:getGeolocation');
      await clock.tickAsync(6000);
      await flushPromises();
      await clock.runAllAsync();
      await flushPromises();
      const geolocationResponse = await geolocationPromise;

      expect(onDegradedListener).toHaveBeenCalled();
      expect(geolocationResponse).toBe('US-TX');
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .times(4)
        .reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      const geolocationPromise = rootMessenger.call('RampsService:getGeolocation');
      await clock.runAllAsync();
      await flushPromises();
      await expect(geolocationPromise).rejects.toThrow(
        `Fetching 'https://on-ramp.uat-api.cx.metamask.io/geolocation?sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios' failed with status '500'`,
      );
    });

    it('allows registering onBreak listeners', () => {
      const { service } = getService();
      const onBreakListener = jest.fn();

      const subscription = service.onBreak(onBreakListener);

      expect(subscription).toBeDefined();
      expect(subscription).toHaveProperty('dispose');
    });

    it('throws error for invalid environment', async () => {
      const { service, rootMessenger } = getService({
        options: {
          environment: 'invalid' as unknown as RampsEnvironment,
        },
      });
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      await expect(
        rootMessenger.call('RampsService:getGeolocation'),
      ).rejects.toThrow('Invalid environment: invalid');
    });
  });

  describe('getGeolocation', () => {
    it('does the same thing as the messenger action', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .reply(200, 'us-tx');
      const { service } = getService();

      const geolocationPromise = service.getGeolocation();
      await clock.runAllAsync();
      await flushPromises();
      const geolocationResponse = await geolocationPromise;

      expect(geolocationResponse).toBe('us-tx');
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
      },
    ];

    it('returns the countries from the cache API filtered by support', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService();

      const countriesPromise = rootMessenger.call(
        'RampsService:getCountries',
        'buy',
      );
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

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
          },
        ]
      `);
    });

    it('uses the production cache URL when environment is Production', async () => {
      nock('https://on-ramp-cache.api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Production },
      });

      const countriesPromise = rootMessenger.call(
        'RampsService:getCountries',
        'buy',
      );
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

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
          },
        ]
      `);
    });

    it('uses staging cache URL when environment is Development', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Development },
      });

      const countriesPromise = rootMessenger.call(
        'RampsService:getCountries',
        'buy',
      );
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

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
          },
        ]
      `);
    });

    it('passes the action parameter correctly', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'sell',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesResponse);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .reply(200, 'us');
      const { rootMessenger } = getService();

      const countriesPromise = rootMessenger.call(
        'RampsService:getCountries',
        'sell',
      );
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

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
          },
        ]
      `);
    });

    it('includes country with unsupported country but supported state for sell action', async () => {
      const mockCountriesWithUnsupportedCountry = [
        {
          isoCode: 'US',
          id: '/regions/us',
          flag: '🇺🇸',
          name: 'United States',
          phone: { prefix: '+1', placeholder: '', template: '' },
          currency: 'USD',
          supported: false,
          states: [
            {
              id: '/regions/us-tx',
              stateId: 'TX',
              name: 'Texas',
              supported: true,
            },
            {
              id: '/regions/us-ny',
              stateId: 'NY',
              name: 'New York',
              supported: false,
            },
          ],
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'sell',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesWithUnsupportedCountry);
      const { service } = getService();

      const countriesPromise = service.getCountries('sell');
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse).toHaveLength(1);
      expect(countriesResponse[0]?.isoCode).toBe('US');
      expect(countriesResponse[0]?.supported).toBe(false);
      expect(countriesResponse[0]?.states?.[0]?.supported).toBe(true);
    });

    it('includes country with unsupported country but supported state for buy action', async () => {
      const mockCountriesWithUnsupportedCountry = [
        {
          isoCode: 'US',
          id: '/regions/us',
          flag: '🇺🇸',
          name: 'United States',
          phone: { prefix: '+1', placeholder: '', template: '' },
          currency: 'USD',
          supported: false,
          states: [
            {
              id: '/regions/us-tx',
              stateId: 'TX',
              name: 'Texas',
              supported: true,
            },
            {
              id: '/regions/us-ny',
              stateId: 'NY',
              name: 'New York',
              supported: false,
            },
          ],
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesWithUnsupportedCountry);
      const { service } = getService();

      const countriesPromise = service.getCountries('buy');
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse).toHaveLength(1);
      expect(countriesResponse[0]?.isoCode).toBe('US');
      expect(countriesResponse[0]?.supported).toBe(false);
      expect(countriesResponse[0]?.states?.[0]?.supported).toBe(true);
    });

    it('throws if the countries API returns an error', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .times(4)
        .reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      const countriesPromise = rootMessenger.call('RampsService:getCountries', 'buy');
      await clock.runAllAsync();
      await flushPromises();
      await expect(countriesPromise).rejects.toThrow(
        `Fetching 'https://on-ramp-cache.uat-api.cx.metamask.io/regions/countries?action=buy&sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios' failed with status '500'`,
      );
    });

    it('throws if the API returns a non-array response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, () => null);
      const { rootMessenger } = getService();

      const countriesPromise = rootMessenger.call('RampsService:getCountries', 'buy');
      await clock.runAllAsync();
      await flushPromises();
      await expect(countriesPromise).rejects.toThrow('Malformed response received from countries API');
    });

    it('throws if the API returns an object instead of an array', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { error: 'Something went wrong' });
      const { rootMessenger } = getService();

      const countriesPromise = rootMessenger.call('RampsService:getCountries', 'buy');
      await clock.runAllAsync();
      await flushPromises();
      await expect(countriesPromise).rejects.toThrow('Malformed response received from countries API');
    });
  });

  describe('getEligibility', () => {
    it('fetches eligibility for a country code', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries/fr')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, {
          aggregator: true,
          deposit: true,
          global: true,
        });
      const { service } = getService();

      const eligibilityPromise = service.getEligibility('fr');
      await clock.runAllAsync();
      await flushPromises();
      const eligibility = await eligibilityPromise;

      expect(eligibility).toStrictEqual({
        aggregator: true,
        deposit: true,
        global: true,
      });
    });

    it('fetches eligibility for a state code', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries/us-ny')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, {
          aggregator: false,
          deposit: true,
          global: false,
        });
      const { service } = getService();

      const eligibilityPromise = service.getEligibility('us-ny');
      await clock.runAllAsync();
      await flushPromises();
      const eligibility = await eligibilityPromise;

      expect(eligibility).toStrictEqual({
        aggregator: false,
        deposit: true,
        global: false,
      });
    });

    it('normalizes ISO code to lowercase', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries/fr')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, {
          aggregator: true,
          deposit: true,
          global: true,
        });
      const { service } = getService();

      const eligibilityPromise = service.getEligibility('FR');
      await clock.runAllAsync();
      await flushPromises();
      const eligibility = await eligibilityPromise;

      expect(eligibility).toStrictEqual({
        aggregator: true,
        deposit: true,
        global: true,
      });
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
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountries);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .reply(200, 'us');
      const { service } = getService();

      const countriesPromise = service.getCountries('buy');
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

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

    it('uses default buy action when no argument is provided', async () => {
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
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountries);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({ sdk: '2.1.6', controller: CONTROLLER_VERSION, context: 'mobile-ios' })
        .reply(200, 'us');
      const { service } = getService();

      const countriesPromise = service.getCountries();
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse[0]?.isoCode).toBe('US');
    });

    it('filters countries with states by support', async () => {
      const mockCountriesWithStates = [
        {
          isoCode: 'US',
          id: '/regions/us',
          flag: '🇺🇸',
          name: 'United States of America',
          phone: {
            prefix: '+1',
            placeholder: '(555) 123-4567',
            template: '(XXX) XXX-XXXX',
          },
          currency: 'USD',
          supported: true,
          states: [
            {
              id: '/regions/us-tx',
              stateId: 'TX',
              name: 'Texas',
              supported: true,
            },
            {
              id: '/regions/us-ny',
              stateId: 'NY',
              name: 'New York',
              supported: false,
            },
          ],
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesWithStates);
      const { service } = getService();

      const countriesPromise = service.getCountries('buy');
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse[0]?.supported).toBe(true);
      expect(countriesResponse[0]?.states?.[0]?.supported).toBe(true);
      expect(countriesResponse[0]?.states?.[1]?.supported).toBe(false);
    });

    it('filters countries with states correctly', async () => {
      const mockCountries = [
        {
          isoCode: 'US',
          id: '/regions/us',
          flag: '🇺🇸',
          name: 'United States',
          phone: { prefix: '+1', placeholder: '', template: '' },
          currency: 'USD',
          supported: true,
          states: [
            {
              id: '/regions/us-tx',
              stateId: 'TX',
              name: 'Texas',
              supported: true,
            },
          ],
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountries);
      const { service } = getService();

      const countriesPromise = service.getCountries('buy');
      await clock.runAllAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse[0]?.supported).toBe(true);
      expect(countriesResponse[0]?.states?.[0]?.supported).toBe(true);
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
    context: 'mobile-ios',
    ...options,
  });

  return { service, rootMessenger, messenger };
}
