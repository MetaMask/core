import { NetworksTicker, toHex } from '@metamask/controller-utils';
import nock from 'nock';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { TokenRatesController } from './TokenRatesController';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_ETH_PATH = '/simple/token_price/ethereum';
const COINGECKO_MATIC_PATH = '/simple/token_price/polygon-pos-network';
const COINGECKO_ASSETS_PATH = '/asset_platforms';
const COINGECKO_SUPPORTED_CURRENCIES = '/simple/supported_vs_currencies';

describe('TokenRatesController', () => {
  beforeEach(() => {
    nock(COINGECKO_API)
      .get(COINGECKO_SUPPORTED_CURRENCIES)
      .reply(200, ['eth', 'usd', 'dai'])
      .get(COINGECKO_ASSETS_PATH)
      .reply(200, [
        {
          id: 'binance-smart-chain',
          chain_identifier: 56,
          name: 'Binance Smart Chain',
          shortname: 'BSC',
        },
        {
          id: 'ethereum',
          chain_identifier: 1,
          name: 'Ethereum',
          shortname: '',
        },
        {
          id: 'polygon-pos-network',
          chain_identifier: 137,
          name: 'Polygon',
          shortname: 'MATIC',
        },
      ]);

    nock('https://min-api.cryptocompare.com')
      .get('/data/price?fsym=ETH&tsyms=ETH')
      .reply(200, { ETH: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it('should set default state', () => {
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn(),
      });
      expect(controller.state).toStrictEqual({
        contractExchangeRates: {},
      });
    });

    it('should initialize with the default config', () => {
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn(),
      });
      expect(controller.config).toStrictEqual({
        interval: 180000,
        threshold: 21600000,
      });
    });

    it('should not poll by default', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      new TokenRatesController({
        getNetworkClientById: jest.fn(),
        interval: 100,
      });

      await advanceTime({ clock, duration: 500 });

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('polling', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it('should poll on the right interval', async () => {
      const interval = 100;
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn().mockReturnValue({
          configuration: {
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
          },
        }),
        interval,
      });
      const updateExchangeRatesSpy = jest
        .spyOn(controller, 'updateExchangeRates')
        .mockResolvedValue();

      controller.startPollingByNetworkClientId('mainnet', {
        tokenAddresses: ['0x0'],
      });
      await advanceTime({ clock, duration: 0 });
      expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);

      await advanceTime({ clock, duration: interval });
      expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(2);

      await advanceTime({ clock, duration: interval });
      expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(3);
    });

    it('should update state on poll', async () => {
      const interval = 100;
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn().mockReturnValue({
          configuration: {
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
          },
        }),
        interval,
      });
      jest.spyOn(controller, 'getChainSlug').mockResolvedValue('ethereum');
      jest.spyOn(controller, 'fetchAndMapExchangeRates').mockResolvedValue({
        '0x02': 0.001,
        '0x03': 0.002,
      });

      controller.startPollingByNetworkClientId('mainnet', {
        tokenAddresses: ['0x02', '0x03'],
      });
      await advanceTime({ clock, duration: 0 });

      expect(controller.state.contractExchangeRates).toStrictEqual({
        '0x1': {
          ETH: {
            '0x02': 0.001,
            '0x03': 0.002,
          },
        },
      });
    });

    it('should stop polling', async () => {
      const interval = 100;
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn().mockReturnValue({
          configuration: {
            chainId: '0x1',
            ticker: NetworksTicker.mainnet,
          },
        }),
        interval,
      });
      const updateExchangeRatesSpy = jest
        .spyOn(controller, 'updateExchangeRates')
        .mockResolvedValue();

      const pollingToken = controller.startPollingByNetworkClientId('mainnet', {
        tokenAddresses: ['0x0'],
      });
      await advanceTime({ clock, duration: 0 });
      expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);

      controller.stopPollingByPollingToken(pollingToken);

      await advanceTime({ clock, duration: interval });
      expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateExchangeRates', () => {
    it('should update all rates', async () => {
      const tokenAddress = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
      nock(COINGECKO_API)
        .get(
          `${COINGECKO_ETH_PATH}?contract_addresses=${tokenAddress}&vs_currencies=eth`,
        )
        .reply(200, {
          '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359': { eth: 0.00561045 },
        });
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn(),
        interval: 100,
      });

      expect(controller.state.contractExchangeRates).toStrictEqual({});
      await controller.updateExchangeRates({
        chainId: '0x1',
        nativeCurrency: 'ETH',
        tokenAddresses: [tokenAddress],
      });
      expect(
        Object.keys(controller.state.contractExchangeRates['0x1'].ETH),
      ).toContain(tokenAddress);
      expect(
        controller.state.contractExchangeRates['0x1'].ETH[tokenAddress],
      ).toBeGreaterThan(0);
    });

    it('should handle balance not found in API', async () => {
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn(),
      });
      expect(controller.state.contractExchangeRates).toStrictEqual({});
      jest.spyOn(controller, 'fetchExchangeRate').mockRejectedValue({
        error: 'Not Found',
        message: 'Not Found',
      });

      const result = controller.updateExchangeRates({
        chainId: '0x1',
        nativeCurrency: 'ETH',
        tokenAddresses: ['0x0'],
      });

      await expect(result).rejects.not.toThrow();
    });

    it('should update exchange rates when native currency is not supported by coingecko', async () => {
      nock(COINGECKO_API)
        .get(`${COINGECKO_MATIC_PATH}`)
        .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
        .reply(200, {
          '0x02': {
            eth: 0.001, // token value in terms of ETH
          },
          '0x03': {
            eth: 0.002,
          },
        });

      nock('https://min-api.cryptocompare.com')
        .get('/data/price?fsym=ETH&tsyms=MATIC')
        .reply(200, { MATIC: 0.5 }); // .5 eth to 1 matic

      const expectedExchangeRates = {
        '0x02': 0.0005, // token value in terms of matic = (token value in eth) * (eth value in matic) = .001 * .5
        '0x03': 0.001,
      };

      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn(),
      });

      await controller.updateExchangeRates({
        chainId: toHex(137),
        nativeCurrency: 'MATIC',
        tokenAddresses: ['0x02', '0x03'],
      });

      expect(controller.state.contractExchangeRates).toStrictEqual({
        [toHex(137)]: {
          MATIC: expectedExchangeRates,
        },
      });
    });
  });

  describe('getChainSlug', () => {
    it('returns the chain slug for the chain id', async () => {
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn(),
      });

      expect(await controller.getChainSlug('0x1')).toBe('ethereum');
      expect(await controller.getChainSlug(toHex(56))).toBe(
        'binance-smart-chain',
      );
      expect(await controller.getChainSlug(toHex(137))).toBe(
        'polygon-pos-network',
      );
    });

    it('returns null if there is no chain slug for the chain id', async () => {
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn(),
      });

      expect(await controller.getChainSlug('0x2')).toBeNull();
    });
  });

  describe('fetchAndMapExchangeRates', () => {
    describe('native currency is supported', () => {
      it('returns the exchange rates directly', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001,
            },
            '0x03': {
              eth: 0.002,
            },
          });

        const controller = new TokenRatesController({
          getNetworkClientById: jest.fn(),
        });

        const contractExchangeRates = await controller.fetchAndMapExchangeRates(
          {
            nativeCurrency: 'ETH',
            chainSlug: 'ethereum',
            tokenAddresses: ['0x02', '0x03'],
          },
        );

        expect(contractExchangeRates).toStrictEqual({
          '0x02': 0.001,
          '0x03': 0.002,
        });
      });
    });

    describe('native currency is not supported', () => {
      it('returns the exchange rates using ETH as a fallback currency', async () => {
        nock(COINGECKO_API)
          .get(`${COINGECKO_ETH_PATH}`)
          .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
          .reply(200, {
            '0x02': {
              eth: 0.001,
            },
            '0x03': {
              eth: 0.002,
            },
          });

        nock('https://min-api.cryptocompare.com')
          .get('/data/price?fsym=ETH&tsyms=LOL')
          .reply(200, { LOL: 0.5 });

        const controller = new TokenRatesController({
          getNetworkClientById: jest.fn(),
        });

        const contractExchangeRates = await controller.fetchAndMapExchangeRates(
          {
            nativeCurrency: 'LOL',
            chainSlug: 'ethereum',
            tokenAddresses: ['0x02', '0x03'],
          },
        );

        expect(contractExchangeRates).toStrictEqual({
          '0x02': 0.0005,
          '0x03': 0.001,
        });
      });
    });
  });
});
