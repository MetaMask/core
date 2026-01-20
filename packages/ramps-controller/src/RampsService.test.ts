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
import { flushPromises } from '../../../tests/helpers';
import packageJson from '../package.json';

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
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
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
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
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
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
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
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, '');
      const { rootMessenger } = getService();

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
      await clock.runAllAsync();
      await flushPromises();
      await expect(geolocationPromise).rejects.toThrow(
        'Malformed response received from geolocation API',
      );
    });

    it('throws when primary API fails', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .times(4)
        .reply(500, 'Internal Server Error');
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
      await clock.runAllAsync();
      await flushPromises();
      await expect(geolocationPromise).rejects.toThrow(
        `Fetching 'https://on-ramp.uat-api.cx.metamask.io/geolocation?sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios' failed with status '500'`,
      );
    });

    it('calls onDegraded listeners if the request takes longer than 5 seconds to resolve', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
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

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
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
        .query({
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

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
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
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
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
        .get('/v2/regions/countries')
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
        .get('/v2/regions/countries')
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
        .get('/v2/regions/countries')
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
        .get('/v2/regions/countries')
        .query({
          action: 'sell',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesResponse);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
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
        .get('/v2/regions/countries')
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
        .get('/v2/regions/countries')
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
        .get('/v2/regions/countries')
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

      const countriesPromise = rootMessenger.call(
        'RampsService:getCountries',
        'buy',
      );
      await clock.runAllAsync();
      await flushPromises();
      await expect(countriesPromise).rejects.toThrow(
        `Fetching 'https://on-ramp-cache.uat-api.cx.metamask.io/v2/regions/countries?action=buy&sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios' failed with status '500'`,
      );
    });

    it('throws if the API returns a non-array response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, () => null);
      const { rootMessenger } = getService();

      const countriesPromise = rootMessenger.call(
        'RampsService:getCountries',
        'buy',
      );
      await clock.runAllAsync();
      await flushPromises();
      await expect(countriesPromise).rejects.toThrow(
        'Malformed response received from countries API',
      );
    });

    it('throws if the API returns an object instead of an array', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { error: 'Something went wrong' });
      const { rootMessenger } = getService();

      const countriesPromise = rootMessenger.call(
        'RampsService:getCountries',
        'buy',
      );
      await clock.runAllAsync();
      await flushPromises();
      await expect(countriesPromise).rejects.toThrow(
        'Malformed response received from countries API',
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
        .get('/v2/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountries);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
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
        .get('/v2/regions/countries')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountries);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
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
        .get('/v2/regions/countries')
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
        .get('/v2/regions/countries')
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

  describe('getTokens', () => {
    it('does the same thing as the messenger action', async () => {
      const mockTokens = {
        topTokens: [
          {
            assetId:
              'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            chainId: 'eip155:1',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            iconUrl: 'https://example.com/usdc.png',
            tokenSupported: true,
          },
        ],
        allTokens: [
          {
            assetId:
              'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            chainId: 'eip155:1',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            iconUrl: 'https://example.com/usdc.png',
            tokenSupported: true,
          },
        ],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockTokens);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('us', 'buy');
      await clock.runAllAsync();
      await flushPromises();
      const tokensResponse = await tokensPromise;

      expect(tokensResponse).toMatchInlineSnapshot(`
        Object {
          "allTokens": Array [
            Object {
              "assetId": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
              "chainId": "eip155:1",
              "decimals": 6,
              "iconUrl": "https://example.com/usdc.png",
              "name": "USD Coin",
              "symbol": "USDC",
              "tokenSupported": true,
            },
          ],
          "topTokens": Array [
            Object {
              "assetId": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
              "chainId": "eip155:1",
              "decimals": 6,
              "iconUrl": "https://example.com/usdc.png",
              "name": "USD Coin",
              "symbol": "USDC",
              "tokenSupported": true,
            },
          ],
        }
      `);
    });

    it('uses default buy action when no argument is provided', async () => {
      const mockTokens = {
        topTokens: [],
        allTokens: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockTokens);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('us');
      await clock.runAllAsync();
      await flushPromises();
      const tokensResponse = await tokensPromise;

      expect(tokensResponse.topTokens).toStrictEqual([]);
      expect(tokensResponse.allTokens).toStrictEqual([]);
    });

    it('normalizes region case', async () => {
      const mockTokens = {
        topTokens: [],
        allTokens: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockTokens);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('US', 'buy');
      await clock.runAllAsync();
      await flushPromises();
      const tokensResponse = await tokensPromise;

      expect(tokensResponse.topTokens).toStrictEqual([]);
      expect(tokensResponse.allTokens).toStrictEqual([]);
    });

    it('handles sell action', async () => {
      const mockTokens = {
        topTokens: [],
        allTokens: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'sell',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockTokens);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('us', 'sell');
      await clock.runAllAsync();
      await flushPromises();
      const tokensResponse = await tokensPromise;

      expect(tokensResponse.topTokens).toStrictEqual([]);
      expect(tokensResponse.allTokens).toStrictEqual([]);
    });

    it('throws error for malformed response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { invalid: 'response' });
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('us', 'buy');
      await clock.runAllAsync();
      await flushPromises();

      await expect(tokensPromise).rejects.toThrow(
        'Malformed response received from tokens API',
      );
    });

    it('throws error when response is null', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, () => null);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('us', 'buy');
      await clock.runAllAsync();
      await flushPromises();

      await expect(tokensPromise).rejects.toThrow(
        'Malformed response received from tokens API',
      );
    });

    it('throws error when topTokens is not an array', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { topTokens: 'not an array', allTokens: [] });
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('us', 'buy');
      await clock.runAllAsync();
      await flushPromises();

      await expect(tokensPromise).rejects.toThrow(
        'Malformed response received from tokens API',
      );
    });

    it('throws error when allTokens is not an array', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { topTokens: [], allTokens: 'not an array' });
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('us', 'buy');
      await clock.runAllAsync();
      await flushPromises();

      await expect(tokensPromise).rejects.toThrow(
        'Malformed response received from tokens API',
      );
    });

    it('includes provider query parameter when provided', async () => {
      const mockTokens = {
        topTokens: [],
        allTokens: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          provider: 'provider-id',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockTokens);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('us', 'buy', {
        provider: 'provider-id',
      });
      await clock.runAllAsync();
      await flushPromises();
      const tokensResponse = await tokensPromise;

      expect(tokensResponse.topTokens).toStrictEqual([]);
      expect(tokensResponse.allTokens).toStrictEqual([]);
    });

    it('includes multiple provider query parameters when array is provided', async () => {
      const mockTokens = {
        topTokens: [],
        allTokens: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          provider: ['provider-id-1', 'provider-id-2'],
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockTokens);
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us');
      const { service } = getService();

      const tokensPromise = service.getTokens('us', 'buy', {
        provider: ['provider-id-1', 'provider-id-2'],
      });
      await clock.runAllAsync();
      await flushPromises();
      const tokensResponse = await tokensPromise;

      expect(tokensResponse.topTokens).toStrictEqual([]);
      expect(tokensResponse.allTokens).toStrictEqual([]);
    });

    it('throws error for HTTP error response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/topTokens')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .times(4)
        .reply(500, 'Internal Server Error');
      const { service } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      const tokensPromise = service.getTokens('us', 'buy');
      await clock.runAllAsync();
      await flushPromises();

      await expect(tokensPromise).rejects.toThrow(
        `Fetching 'https://on-ramp-cache.uat-api.cx.metamask.io/v2/regions/us/topTokens?action=buy&sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios' failed with status '500'`,
      );
    });
  });

  describe('getProviders', () => {
    it('fetches providers from the API', async () => {
      const mockProviders = {
        providers: [
          {
            id: '/providers/paypal-staging',
            name: 'PayPal (Staging)',
            environmentType: 'STAGING',
            description: 'Test provider',
            hqAddress: '123 Test St',
            links: [],
            logos: {
              light: '/assets/paypal_light.png',
              dark: '/assets/paypal_dark.png',
              height: 24,
              width: 77,
            },
          },
        ],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockProviders);
      const { service } = getService();

      const providersPromise = service.getProviders('us');
      await clock.runAllAsync();
      await flushPromises();
      const providersResponse = await providersPromise;

      expect(providersResponse.providers).toHaveLength(1);
      expect(providersResponse.providers[0]?.id).toBe(
        '/providers/paypal-staging',
      );
    });

    it('normalizes region case', async () => {
      const mockProviders = {
        providers: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockProviders);
      const { service } = getService();

      const providersPromise = service.getProviders('US');
      await clock.runAllAsync();
      await flushPromises();
      const providersResponse = await providersPromise;

      expect(providersResponse.providers).toStrictEqual([]);
    });

    it('passes filter options as query parameters', async () => {
      const mockProviders = {
        providers: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          provider: 'paypal',
          crypto: 'ETH',
          fiat: 'USD',
          payments: 'card',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockProviders);
      const { service } = getService();

      const providersPromise = service.getProviders('us', {
        provider: 'paypal',
        crypto: 'ETH',
        fiat: 'USD',
        payments: 'card',
      });
      await clock.runAllAsync();
      await flushPromises();
      const providersResponse = await providersPromise;

      expect(providersResponse.providers).toStrictEqual([]);
    });

    it('handles array filter options', async () => {
      const mockProviders = {
        providers: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          provider: ['paypal', 'ramp'],
          crypto: ['ETH', 'BTC'],
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockProviders);
      const { service } = getService();

      const providersPromise = service.getProviders('us', {
        provider: ['paypal', 'ramp'],
        crypto: ['ETH', 'BTC'],
      });
      await clock.runAllAsync();
      await flushPromises();
      const providersResponse = await providersPromise;

      expect(providersResponse.providers).toStrictEqual([]);
    });

    it('handles single value filter options for fiat and payments', async () => {
      const mockProviders = {
        providers: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          fiat: 'USD',
          payments: 'card',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockProviders);
      const { service } = getService();

      const providersPromise = service.getProviders('us', {
        fiat: 'USD',
        payments: 'card',
      });
      await clock.runAllAsync();
      await flushPromises();
      const providersResponse = await providersPromise;

      expect(providersResponse.providers).toStrictEqual([]);
    });

    it('handles array filter options for fiat and payments', async () => {
      const mockProviders = {
        providers: [],
      };
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          fiat: ['USD', 'EUR'],
          payments: ['card', 'bank'],
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockProviders);
      const { service } = getService();

      const providersPromise = service.getProviders('us', {
        fiat: ['USD', 'EUR'],
        payments: ['card', 'bank'],
      });
      await clock.runAllAsync();
      await flushPromises();
      const providersResponse = await providersPromise;

      expect(providersResponse.providers).toStrictEqual([]);
    });

    it('throws error for malformed response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { invalid: 'response' });
      const { service } = getService();

      const providersPromise = service.getProviders('us');
      await clock.runAllAsync();
      await flushPromises();

      await expect(providersPromise).rejects.toThrow(
        'Malformed response received from providers API',
      );
    });

    it('throws error when response is null', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, () => null);
      const { service } = getService();

      const providersPromise = service.getProviders('us');
      await clock.runAllAsync();
      await flushPromises();

      await expect(providersPromise).rejects.toThrow(
        'Malformed response received from providers API',
      );
    });

    it('throws error when providers is not an array', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { providers: 'not an array' });
      const { service } = getService();

      const providersPromise = service.getProviders('us');
      await clock.runAllAsync();
      await flushPromises();

      await expect(providersPromise).rejects.toThrow(
        'Malformed response received from providers API',
      );
    });

    it('throws error for HTTP error response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us/providers')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .times(4)
        .reply(500, 'Internal Server Error');
      const { service } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      const providersPromise = service.getProviders('us');
      await clock.runAllAsync();
      await flushPromises();

      await expect(providersPromise).rejects.toThrow(
        `Fetching 'https://on-ramp-cache.uat-api.cx.metamask.io/v2/regions/us/providers?sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios' failed with status '500'`,
      );
    });
  });

  describe('getPaymentMethods', () => {
    const mockPaymentMethodsResponse = {
      payments: [
        {
          id: '/payments/debit-credit-card',
          paymentType: 'debit-credit-card',
          name: 'Debit or Credit',
          score: 90,
          icon: 'card',
          disclaimer:
            "Credit card purchases may incur your bank's cash advance fees.",
          delay: '5 to 10 minutes.',
          pendingOrderDescription:
            'Card purchases may take a few minutes to complete.',
        },
        {
          id: '/payments/venmo',
          paymentType: 'bank-transfer',
          name: 'Venmo',
          score: 95,
          icon: 'bank',
          delay: 'Up to 10 minutes.',
          pendingOrderDescription:
            'Instant transfers may take a few minutes to complete.',
        },
      ],
      sort: {
        ids: ['/payments/venmo', '/payments/debit-credit-card'],
        sortBy: '2',
      },
    };

    it('fetches payment methods from the API', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/paymentMethods')
        .query({
          region: 'us-al',
          fiat: 'usd',
          assetId: 'eip155:1/slip44:60',
          provider: '/providers/stripe',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockPaymentMethodsResponse);
      const { service } = getService();

      const paymentMethodsPromise = service.getPaymentMethods({
        region: 'us-al',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        provider: '/providers/stripe',
      });
      await clock.runAllAsync();
      await flushPromises();
      const paymentMethodsResponse = await paymentMethodsPromise;

      expect(paymentMethodsResponse.payments).toHaveLength(2);
      expect(paymentMethodsResponse.payments[0]?.id).toBe(
        '/payments/debit-credit-card',
      );
      expect(paymentMethodsResponse.sort?.ids).toStrictEqual([
        '/payments/venmo',
        '/payments/debit-credit-card',
      ]);
    });

    it('normalizes region and fiat case', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/paymentMethods')
        .query({
          region: 'us-al',
          fiat: 'usd',
          assetId: 'eip155:1/slip44:60',
          provider: '/providers/stripe',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockPaymentMethodsResponse);
      const { service } = getService();

      const paymentMethodsPromise = service.getPaymentMethods({
        region: 'US-AL',
        fiat: 'USD',
        assetId: 'eip155:1/slip44:60',
        provider: '/providers/stripe',
      });
      await clock.runAllAsync();
      await flushPromises();
      const paymentMethodsResponse = await paymentMethodsPromise;

      expect(paymentMethodsResponse.payments).toHaveLength(2);
    });

    it('throws error for malformed response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/paymentMethods')
        .query({
          region: 'us-al',
          fiat: 'usd',
          assetId: 'eip155:1/slip44:60',
          provider: '/providers/stripe',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { invalid: 'response' });
      const { service } = getService();

      const paymentMethodsPromise = service.getPaymentMethods({
        region: 'us-al',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        provider: '/providers/stripe',
      });
      await clock.runAllAsync();
      await flushPromises();

      await expect(paymentMethodsPromise).rejects.toThrow(
        'Malformed response received from paymentMethods API',
      );
    });

    it('throws error when response is null', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/paymentMethods')
        .query({
          region: 'us-al',
          fiat: 'usd',
          assetId: 'eip155:1/slip44:60',
          provider: '/providers/stripe',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, () => null);
      const { service } = getService();

      const paymentMethodsPromise = service.getPaymentMethods({
        region: 'us-al',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        provider: '/providers/stripe',
      });
      await clock.runAllAsync();
      await flushPromises();

      await expect(paymentMethodsPromise).rejects.toThrow(
        'Malformed response received from paymentMethods API',
      );
    });

    it('throws error when payments is not an array', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/paymentMethods')
        .query({
          region: 'us-al',
          fiat: 'usd',
          assetId: 'eip155:1/slip44:60',
          provider: '/providers/stripe',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { payments: 'not an array' });
      const { service } = getService();

      const paymentMethodsPromise = service.getPaymentMethods({
        region: 'us-al',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        provider: '/providers/stripe',
      });
      await clock.runAllAsync();
      await flushPromises();

      await expect(paymentMethodsPromise).rejects.toThrow(
        'Malformed response received from paymentMethods API',
      );
    });

    it('throws error for HTTP error response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/paymentMethods')
        .query({
          region: 'us-al',
          fiat: 'usd',
          assetId: 'eip155:1/slip44:60',
          provider: '/providers/stripe',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .times(4)
        .reply(500, 'Internal Server Error');
      const { service } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(() => undefined);
      });

      const paymentMethodsPromise = service.getPaymentMethods({
        region: 'us-al',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        provider: '/providers/stripe',
      });
      await clock.runAllAsync();
      await flushPromises();

      await expect(paymentMethodsPromise).rejects.toThrow(
        `Fetching 'https://on-ramp-cache.uat-api.cx.metamask.io/v2/paymentMethods?sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios&region=us-al&fiat=usd&assetId=eip155%3A1%2Fslip44%3A60&provider=%2Fproviders%2Fstripe' failed with status '500'`,
      );
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
