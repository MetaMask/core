import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import type { RampsServiceMessenger } from './RampsService';
import { RampsService, RampsEnvironment } from './RampsService';
import { flushPromises } from '../../../tests/helpers';
import packageJson from '../package.json';

const CONTROLLER_VERSION = packageJson.version;

describe('RampsService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
      await flushPromises();
      const geolocationResponse = await geolocationPromise;

      expect(geolocationResponse).toBe('us-tx');
    });

    it('uses localhost URL when environment is Local', async () => {
      nock('http://localhost:3000')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us-tx');
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Local },
      });

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const geolocationResponse = await geolocationPromise;

      expect(geolocationResponse).toBe('us-tx');
    });

    it('uses baseUrlOverride when provided', async () => {
      nock('http://custom-url.test')
        .get('/geolocation')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, 'us-tx');
      const { rootMessenger } = getService({
        options: { baseUrlOverride: 'http://custom-url.test' },
      });

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
      await jest.runAllTimersAsync();
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
      await jest.advanceTimersByTimeAsync(6000);
      await flushPromises();
      await jest.runAllTimersAsync();
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
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const geolocationPromise = rootMessenger.call(
        'RampsService:getGeolocation',
      );
      await jest.runAllTimersAsync();
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
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
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
      await jest.runAllTimersAsync();
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
        supported: { buy: true, sell: true },
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
        supported: { buy: true, sell: false },
      },
    ];

    it('returns the countries from the cache API filtered by support', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService();

      const countriesPromise = rootMessenger.call('RampsService:getCountries');
      await jest.runAllTimersAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse).toMatchInlineSnapshot(`
        [
          {
            "currency": "USD",
            "flag": "🇺🇸",
            "isoCode": "US",
            "name": "United States of America",
            "phone": {
              "placeholder": "(555) 123-4567",
              "prefix": "+1",
              "template": "(XXX) XXX-XXXX",
            },
            "recommended": true,
            "supported": {
              "buy": true,
              "sell": true,
            },
          },
          {
            "currency": "EUR",
            "flag": "🇦🇹",
            "isoCode": "AT",
            "name": "Austria",
            "phone": {
              "placeholder": "660 1234567",
              "prefix": "+43",
              "template": "XXX XXXXXXX",
            },
            "supported": {
              "buy": true,
              "sell": false,
            },
          },
        ]
      `);
    });

    it('uses the production cache URL when environment is Production', async () => {
      nock('https://on-ramp-cache.api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Production },
      });

      const countriesPromise = rootMessenger.call('RampsService:getCountries');
      await jest.runAllTimersAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse).toMatchInlineSnapshot(`
        [
          {
            "currency": "USD",
            "flag": "🇺🇸",
            "isoCode": "US",
            "name": "United States of America",
            "phone": {
              "placeholder": "(555) 123-4567",
              "prefix": "+1",
              "template": "(XXX) XXX-XXXX",
            },
            "recommended": true,
            "supported": {
              "buy": true,
              "sell": true,
            },
          },
          {
            "currency": "EUR",
            "flag": "🇦🇹",
            "isoCode": "AT",
            "name": "Austria",
            "phone": {
              "placeholder": "660 1234567",
              "prefix": "+43",
              "template": "XXX XXXXXXX",
            },
            "supported": {
              "buy": true,
              "sell": false,
            },
          },
        ]
      `);
    });

    it('uses staging cache URL when environment is Development', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesResponse);
      const { rootMessenger } = getService({
        options: { environment: RampsEnvironment.Development },
      });

      const countriesPromise = rootMessenger.call('RampsService:getCountries');
      await jest.runAllTimersAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse).toMatchInlineSnapshot(`
        [
          {
            "currency": "USD",
            "flag": "🇺🇸",
            "isoCode": "US",
            "name": "United States of America",
            "phone": {
              "placeholder": "(555) 123-4567",
              "prefix": "+1",
              "template": "(XXX) XXX-XXXX",
            },
            "recommended": true,
            "supported": {
              "buy": true,
              "sell": true,
            },
          },
          {
            "currency": "EUR",
            "flag": "🇦🇹",
            "isoCode": "AT",
            "name": "Austria",
            "phone": {
              "placeholder": "660 1234567",
              "prefix": "+43",
              "template": "XXX XXXXXXX",
            },
            "supported": {
              "buy": true,
              "sell": false,
            },
          },
        ]
      `);
    });

    it('includes country with unsupported country but supported state', async () => {
      const mockCountriesWithUnsupportedCountry = [
        {
          isoCode: 'US',
          id: '/regions/us',
          flag: '🇺🇸',
          name: 'United States',
          phone: { prefix: '+1', placeholder: '', template: '' },
          currency: 'USD',
          supported: { buy: false, sell: false },
          states: [
            {
              id: '/regions/us-tx',
              stateId: 'TX',
              name: 'Texas',
              supported: { buy: true, sell: true },
            },
            {
              id: '/regions/us-ny',
              stateId: 'NY',
              name: 'New York',
              supported: { buy: false, sell: false },
            },
          ],
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesWithUnsupportedCountry);
      const { service } = getService();

      const countriesPromise = service.getCountries();
      await jest.runAllTimersAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse).toHaveLength(1);
      expect(countriesResponse[0]?.isoCode).toBe('US');
      expect(countriesResponse[0]?.supported).toStrictEqual({
        buy: false,
        sell: false,
      });
      expect(countriesResponse[0]?.states?.[0]?.supported).toStrictEqual({
        buy: true,
        sell: true,
      });
    });

    it('filters out countries with no supported actions', async () => {
      const mockCountriesWithNoSupport = [
        {
          isoCode: 'US',
          id: '/regions/us',
          flag: '🇺🇸',
          name: 'United States',
          phone: { prefix: '+1', placeholder: '', template: '' },
          currency: 'USD',
          supported: { buy: true, sell: false },
        },
        {
          isoCode: 'XX',
          id: '/regions/xx',
          flag: '🏳️',
          name: 'Unsupported Country',
          phone: { prefix: '+0', placeholder: '', template: '' },
          currency: 'XXX',
          supported: { buy: false, sell: false },
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesWithNoSupport);
      const { service } = getService();

      const countriesPromise = service.getCountries();
      await jest.runAllTimersAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse).toHaveLength(1);
      expect(countriesResponse[0]?.isoCode).toBe('US');
    });

    it('throws if the countries API returns an error', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .times(4)
        .reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const countriesPromise = rootMessenger.call('RampsService:getCountries');
      await jest.runAllTimersAsync();
      await flushPromises();
      await expect(countriesPromise).rejects.toThrow(
        `Fetching 'https://on-ramp-cache.uat-api.cx.metamask.io/v2/regions/countries?sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios' failed with status '500'`,
      );
    });

    it('throws if the API returns a non-array response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, () => null);
      const { rootMessenger } = getService();

      const countriesPromise = rootMessenger.call('RampsService:getCountries');
      await jest.runAllTimersAsync();
      await flushPromises();
      await expect(countriesPromise).rejects.toThrow(
        'Malformed response received from countries API',
      );
    });

    it('throws if the API returns an object instead of an array', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, { error: 'Something went wrong' });
      const { rootMessenger } = getService();

      const countriesPromise = rootMessenger.call('RampsService:getCountries');
      await jest.runAllTimersAsync();
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
          supported: { buy: true, sell: true },
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountries);
      const { service } = getService();

      const countriesPromise = service.getCountries();
      await jest.runAllTimersAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse).toMatchInlineSnapshot(`
        [
          {
            "currency": "USD",
            "flag": "🇺🇸",
            "isoCode": "US",
            "name": "United States",
            "phone": {
              "placeholder": "",
              "prefix": "+1",
              "template": "",
            },
            "supported": {
              "buy": true,
              "sell": true,
            },
          },
        ]
      `);
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
          supported: { buy: true, sell: true },
          states: [
            {
              id: '/regions/us-tx',
              stateId: 'TX',
              name: 'Texas',
              supported: { buy: true, sell: true },
            },
            {
              id: '/regions/us-ny',
              stateId: 'NY',
              name: 'New York',
              supported: { buy: false, sell: false },
            },
          ],
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountriesWithStates);
      const { service } = getService();

      const countriesPromise = service.getCountries();
      await jest.runAllTimersAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse[0]?.supported).toStrictEqual({
        buy: true,
        sell: true,
      });
      expect(countriesResponse[0]?.states?.[0]?.supported).toStrictEqual({
        buy: true,
        sell: true,
      });
      expect(countriesResponse[0]?.states?.[1]?.supported).toStrictEqual({
        buy: false,
        sell: false,
      });
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
          supported: { buy: true, sell: false },
          states: [
            {
              id: '/regions/us-tx',
              stateId: 'TX',
              name: 'Texas',
              supported: { buy: true, sell: true },
            },
          ],
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountries);
      const { service } = getService();

      const countriesPromise = service.getCountries();
      await jest.runAllTimersAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse[0]?.supported).toStrictEqual({
        buy: true,
        sell: false,
      });
      expect(countriesResponse[0]?.states?.[0]?.supported).toStrictEqual({
        buy: true,
        sell: true,
      });
    });

    it('includes country when state has undefined buy but truthy sell', async () => {
      const mockCountries = [
        {
          isoCode: 'US',
          id: '/regions/us',
          flag: '🇺🇸',
          name: 'United States',
          phone: { prefix: '+1', placeholder: '', template: '' },
          currency: 'USD',
          supported: { buy: false, sell: false },
          states: [
            {
              id: '/regions/us-tx',
              stateId: 'TX',
              name: 'Texas',
              supported: { sell: true },
            },
          ],
        },
      ];
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/countries')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, mockCountries);
      const { service } = getService();

      const countriesPromise = service.getCountries();
      await jest.runAllTimersAsync();
      await flushPromises();
      const countriesResponse = await countriesPromise;

      expect(countriesResponse).toHaveLength(1);
      expect(countriesResponse[0]?.states?.[0]?.supported).toStrictEqual({
        sell: true,
      });
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
      await jest.runAllTimersAsync();
      await flushPromises();
      const tokensResponse = await tokensPromise;

      expect(tokensResponse).toMatchInlineSnapshot(`
        {
          "allTokens": [
            {
              "assetId": "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
              "chainId": "eip155:1",
              "decimals": 6,
              "iconUrl": "https://example.com/usdc.png",
              "name": "USD Coin",
              "symbol": "USDC",
              "tokenSupported": true,
            },
          ],
          "topTokens": [
            {
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const tokensPromise = service.getTokens('us', 'buy');
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
      await jest.runAllTimersAsync();
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
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const providersPromise = service.getProviders('us');
      await jest.runAllTimersAsync();
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
          delay: [5, 10],
          pendingOrderDescription:
            'Card purchases may take a few minutes to complete.',
        },
        {
          id: '/payments/venmo',
          paymentType: 'bank-transfer',
          name: 'Venmo',
          score: 95,
          icon: 'bank',
          delay: [0, 10],
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
        .get('/v2/regions/us-al/payments')
        .query({
          region: 'us-al',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
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
      await jest.runAllTimersAsync();
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
        .get('/v2/regions/us-al/payments')
        .query({
          region: 'us-al',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
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
      await jest.runAllTimersAsync();
      await flushPromises();
      const paymentMethodsResponse = await paymentMethodsPromise;

      expect(paymentMethodsResponse.payments).toHaveLength(2);
    });

    it('throws error for malformed response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us-al/payments')
        .query({
          region: 'us-al',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
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
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(paymentMethodsPromise).rejects.toThrow(
        'Malformed response received from paymentMethods API',
      );
    });

    it('throws error when response is null', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us-al/payments')
        .query({
          region: 'us-al',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
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
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(paymentMethodsPromise).rejects.toThrow(
        'Malformed response received from paymentMethods API',
      );
    });

    it('throws error when payments is not an array', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us-al/payments')
        .query({
          region: 'us-al',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
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
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(paymentMethodsPromise).rejects.toThrow(
        'Malformed response received from paymentMethods API',
      );
    });

    it('throws error for HTTP error response', async () => {
      nock('https://on-ramp-cache.uat-api.cx.metamask.io')
        .get('/v2/regions/us-al/payments')
        .query({
          region: 'us-al',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          provider: '/providers/stripe',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .times(4)
        .reply(500, 'Internal Server Error');
      const { service } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const paymentMethodsPromise = service.getPaymentMethods({
        region: 'us-al',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        provider: '/providers/stripe',
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(paymentMethodsPromise).rejects.toThrow(
        `Fetching 'https://on-ramp-cache.uat-api.cx.metamask.io/v2/regions/us-al/payments?sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios&region=us-al&fiat=usd&crypto=eip155%3A1%2Fslip44%3A60&provider=%2Fproviders%2Fstripe' failed with status '500'`,
      );
    });
  });

  describe('getQuotes', () => {
    const mockQuotesResponse = {
      success: [
        {
          provider: '/providers/moonpay',
          quote: {
            amountIn: 100,
            amountOut: '0.05',
            paymentMethod: '/payments/debit-credit-card',
            amountOutInFiat: 98,
          },
          metadata: {
            reliability: 95,
            tags: {
              isBestRate: true,
              isMostReliable: false,
            },
          },
        },
        {
          provider: '/providers/transak',
          quote: {
            amountIn: 100,
            amountOut: '0.048',
            paymentMethod: '/payments/debit-credit-card',
            amountOutInFiat: 96,
          },
          metadata: {
            reliability: 88,
            tags: {
              isBestRate: false,
              isMostReliable: true,
            },
          },
        },
      ],
      sorted: [
        {
          sortBy: 'price',
          ids: ['/providers/moonpay', '/providers/transak'],
        },
        {
          sortBy: 'reliability',
          ids: ['/providers/transak', '/providers/moonpay'],
        },
      ],
      error: [],
      customActions: [],
    };

    it('fetches quotes from the API', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .reply(200, mockQuotesResponse);
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();
      const quotesResponse = await quotesPromise;

      expect(quotesResponse.success).toHaveLength(2);
      expect(quotesResponse.success[0]?.provider).toBe('/providers/moonpay');
      expect(quotesResponse.sorted).toHaveLength(2);
      expect(quotesResponse.error).toHaveLength(0);
    });

    it('normalizes region and fiat case', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .reply(200, mockQuotesResponse);
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'US',
        fiat: 'USD',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();
      const quotesResponse = await quotesPromise;

      expect(quotesResponse.success).toHaveLength(2);
    });

    it('includes multiple payment methods', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: ['/payments/debit-credit-card', '/payments/bank-transfer'],
        })
        .reply(200, mockQuotesResponse);
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: [
          '/payments/debit-credit-card',
          '/payments/bank-transfer',
        ],
      });
      await jest.runAllTimersAsync();
      await flushPromises();
      const quotesResponse = await quotesPromise;

      expect(quotesResponse.success).toHaveLength(2);
    });

    it('includes provider filter when specified', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
          providers: '/providers/moonpay',
        })
        .reply(200, mockQuotesResponse);
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
        providers: ['/providers/moonpay'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();
      const quotesResponse = await quotesPromise;

      expect(quotesResponse.success).toHaveLength(2);
    });

    it('includes multiple provider filters when specified', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
          providers: ['/providers/moonpay', '/providers/transak'],
        })
        .reply(200, mockQuotesResponse);
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
        providers: ['/providers/moonpay', '/providers/transak'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();
      const quotesResponse = await quotesPromise;

      expect(quotesResponse.success).toHaveLength(2);
    });

    it('includes redirect URL when specified', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
          redirectUrl: 'https://example.com/callback',
        })
        .reply(200, mockQuotesResponse);
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
        redirectUrl: 'https://example.com/callback',
      });
      await jest.runAllTimersAsync();
      await flushPromises();
      const quotesResponse = await quotesPromise;

      expect(quotesResponse.success).toHaveLength(2);
    });

    it('handles sell action', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'sell',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '0.1',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/bank-transfer',
        })
        .reply(200, mockQuotesResponse);
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 0.1,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/bank-transfer'],
        action: 'sell',
      });
      await jest.runAllTimersAsync();
      await flushPromises();
      const quotesResponse = await quotesPromise;

      expect(quotesResponse.success).toHaveLength(2);
    });

    it('throws error for malformed response', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .reply(200, { invalid: 'response' });
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(quotesPromise).rejects.toThrow(
        'Malformed response received from quotes API',
      );
    });

    it('throws error when response is null', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .reply(200, () => null);
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(quotesPromise).rejects.toThrow(
        'Malformed response received from quotes API',
      );
    });

    it('throws error when success is not an array', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .reply(200, { success: 'not an array', sorted: [], error: [] });
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(quotesPromise).rejects.toThrow(
        'Malformed response received from quotes API',
      );
    });

    it('throws error when sorted is not an array', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .reply(200, {
          success: [],
          sorted: 'not an array',
          error: [],
          customActions: [],
        });
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(quotesPromise).rejects.toThrow(
        'Malformed response received from quotes API',
      );
    });

    it('throws error when error is not an array', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .reply(200, {
          success: [],
          sorted: [],
          error: 'not an array',
          customActions: [],
        });
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(quotesPromise).rejects.toThrow(
        'Malformed response received from quotes API',
      );
    });

    it('throws error when customActions is not an array', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .reply(200, {
          success: [],
          sorted: [],
          error: [],
          customActions: 'not an array',
        });
      const { service } = getService();

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(quotesPromise).rejects.toThrow(
        'Malformed response received from quotes API',
      );
    });

    it('throws error for HTTP error response', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .times(4)
        .reply(500, 'Internal Server Error');
      const { service } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(quotesPromise).rejects.toThrow("failed with status '500'");
    });

    it('uses production URL when environment is Production', async () => {
      nock('https://on-ramp.api.cx.metamask.io')
        .get('/v2/quotes')
        .query({
          action: 'buy',
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          region: 'us',
          fiat: 'usd',
          crypto: 'eip155:1/slip44:60',
          amount: '100',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          payments: '/payments/debit-credit-card',
        })
        .reply(200, mockQuotesResponse);
      const { service } = getService({
        options: { environment: RampsEnvironment.Production },
      });

      const quotesPromise = service.getQuotes({
        region: 'us',
        fiat: 'usd',
        assetId: 'eip155:1/slip44:60',
        amount: 100,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        paymentMethods: ['/payments/debit-credit-card'],
      });
      await jest.runAllTimersAsync();
      await flushPromises();
      const quotesResponse = await quotesPromise;

      expect(quotesResponse.success).toHaveLength(2);
    });
  });

  describe('RampsService:getBuyWidgetUrl', () => {
    it('returns buy widget data from the buy URL endpoint', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/providers/transak-staging/buy-widget')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, {
          url: 'https://global.transak.com/?apiKey=test',
          browser: 'APP_BROWSER',
          orderId: null,
        });
      const { rootMessenger } = getService();

      const buyWidgetPromise = rootMessenger.call(
        'RampsService:getBuyWidgetUrl',
        'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const buyWidget = await buyWidgetPromise;

      expect(buyWidget).toStrictEqual({
        url: 'https://global.transak.com/?apiKey=test',
        browser: 'APP_BROWSER',
        orderId: null,
      });
    });

    it('throws when the response is not ok', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/providers/transak-staging/buy-widget')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .times(4)
        .reply(500, 'Internal Server Error');
      const { service } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const buyWidgetPromise = service.getBuyWidgetUrl(
        'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(buyWidgetPromise).rejects.toThrow(
        `Fetching 'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget?sdk=2.1.6&controller=${CONTROLLER_VERSION}&context=mobile-ios' failed with status '500'`,
      );
    });

    it('throws when the response does not contain url field', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/providers/transak-staging/buy-widget')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
        })
        .reply(200, {
          browser: 'APP_BROWSER',
          orderId: null,
        });
      const { rootMessenger } = getService();

      const buyWidgetPromise = rootMessenger.call(
        'RampsService:getBuyWidgetUrl',
        'https://on-ramp.uat-api.cx.metamask.io/providers/transak-staging/buy-widget',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(buyWidgetPromise).rejects.toThrow(
        'Malformed response received from buy widget URL API',
      );
    });
  });

  describe('RampsService:getOrder', () => {
    const mockOrder = {
      id: '/providers/transak-staging/orders/abc-123',
      isOnlyLink: false,
      provider: { id: '/providers/transak-staging', name: 'Transak (Staging)' },
      success: true,
      cryptoAmount: 0.05,
      fiatAmount: 100,
      cryptoCurrency: { symbol: 'ETH', decimals: 18 },
      fiatCurrency: { symbol: 'USD', decimals: 2, denomSymbol: '$' },
      providerOrderId: 'abc-123',
      providerOrderLink: 'https://transak.com/order/abc-123',
      createdAt: 1700000000000,
      paymentMethod: { id: '/payments/debit-credit-card', name: 'Card' },
      totalFeesFiat: 5,
      txHash: '',
      walletAddress: '0xabc',
      status: 'COMPLETED' as const,
      network: { chainId: '1', name: 'Ethereum Mainnet' },
      canBeUpdated: false,
      idHasExpired: false,
      excludeFromPurchases: false,
      timeDescriptionPending: '',
      orderType: 'BUY',
      exchangeRate: 2000,
    };

    it('returns order data from the V2 unified order endpoint', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/providers/transak-staging/orders/abc-123')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          wallet: '0xabc',
        })
        .reply(200, mockOrder);
      const { rootMessenger } = getService();

      const orderPromise = rootMessenger.call(
        'RampsService:getOrder',
        'transak-staging',
        'abc-123',
        '0xabc',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const order = await orderPromise;

      expect(order).toStrictEqual(mockOrder);
    });

    it('throws when the response is not ok', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/providers/transak-staging/orders/abc-123')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          wallet: '0xabc',
        })
        .times(4)
        .reply(404, 'Not Found');
      const { service } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const orderPromise = service.getOrder(
        'transak-staging',
        'abc-123',
        '0xabc',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(orderPromise).rejects.toThrow("failed with status '404'");
    });

    it('throws when the response is malformed', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/providers/transak-staging/orders/abc-123')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          wallet: '0xabc',
        })
        .reply(200, 'false');
      const { rootMessenger } = getService();

      const orderPromise = rootMessenger.call(
        'RampsService:getOrder',
        'transak-staging',
        'abc-123',
        '0xabc',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(orderPromise).rejects.toThrow(
        'Malformed response received from order API',
      );
    });
  });

  describe('RampsService:getOrderFromCallback', () => {
    const mockOrder = {
      id: '/providers/transak-staging/orders/abc-123',
      isOnlyLink: false,
      provider: { id: '/providers/transak-staging', name: 'Transak (Staging)' },
      success: true,
      cryptoAmount: 0.05,
      fiatAmount: 100,
      cryptoCurrency: { symbol: 'ETH', decimals: 18 },
      fiatCurrency: { symbol: 'USD', decimals: 2, denomSymbol: '$' },
      providerOrderId: 'abc-123',
      providerOrderLink: 'https://transak.com/order/abc-123',
      createdAt: 1700000000000,
      paymentMethod: { id: '/payments/debit-credit-card', name: 'Card' },
      totalFeesFiat: 5,
      txHash: '',
      walletAddress: '0xabc',
      status: 'COMPLETED' as const,
      network: { chainId: '1', name: 'Ethereum Mainnet' },
      canBeUpdated: false,
      idHasExpired: false,
      excludeFromPurchases: false,
      timeDescriptionPending: '',
      orderType: 'BUY',
      exchangeRate: 2000,
    };

    it('parses the callback URL and returns the full order', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/providers/transak-staging/callback')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          url: 'https://metamask.app.link/on-ramp?orderId=abc-123',
        })
        .reply(200, { id: 'abc-123' });
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/providers/transak-staging/orders/abc-123')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          wallet: '0xabc',
        })
        .reply(200, mockOrder);
      const { rootMessenger } = getService();

      const orderPromise = rootMessenger.call(
        'RampsService:getOrderFromCallback',
        'transak-staging',
        'https://metamask.app.link/on-ramp?orderId=abc-123',
        '0xabc',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const order = await orderPromise;

      expect(order).toStrictEqual(mockOrder);
    });

    it('extracts the order code from a full resource path id', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/providers/transak-staging/callback')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          url: 'https://metamask.app.link/on-ramp?orderId=abc-123',
        })
        .reply(200, { id: '/providers/transak-staging/orders/abc-123' });
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/providers/transak-staging/orders/abc-123')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          wallet: '0xabc',
        })
        .reply(200, mockOrder);
      const { rootMessenger } = getService();

      const orderPromise = rootMessenger.call(
        'RampsService:getOrderFromCallback',
        'transak-staging',
        'https://metamask.app.link/on-ramp?orderId=abc-123',
        '0xabc',
      );
      await jest.runAllTimersAsync();
      await flushPromises();
      const order = await orderPromise;

      expect(order).toStrictEqual(mockOrder);
    });

    it('throws when the callback response does not contain an id', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/providers/transak-staging/callback')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          url: 'https://metamask.app.link/on-ramp?orderId=abc-123',
        })
        .reply(200, {});
      const { rootMessenger } = getService();

      const orderPromise = rootMessenger.call(
        'RampsService:getOrderFromCallback',
        'transak-staging',
        'https://metamask.app.link/on-ramp?orderId=abc-123',
        '0xabc',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(orderPromise).rejects.toThrow(
        'Could not extract order ID from callback URL via provider',
      );
    });

    it('throws when the callback request fails', async () => {
      nock('https://on-ramp.uat-api.cx.metamask.io')
        .get('/v2/providers/transak-staging/callback')
        .query({
          sdk: '2.1.6',
          controller: CONTROLLER_VERSION,
          context: 'mobile-ios',
          url: 'https://metamask.app.link/on-ramp?orderId=abc-123',
        })
        .times(4)
        .reply(500, 'Internal Server Error');
      const { service } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(() => undefined);
      });

      const orderPromise = service.getOrderFromCallback(
        'transak-staging',
        'https://metamask.app.link/on-ramp?orderId=abc-123',
        '0xabc',
      );
      await jest.runAllTimersAsync();
      await flushPromises();

      await expect(orderPromise).rejects.toThrow("failed with status '500'");
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
