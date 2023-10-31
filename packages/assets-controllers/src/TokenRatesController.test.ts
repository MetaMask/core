import { NetworksTicker, toHex } from '@metamask/controller-utils';
import nock from 'nock';

import { TokenRatesController } from './TokenRatesController';

function flushPromises(): Promise<unknown> {
  return new Promise(jest.requireActual('timers').setImmediate);
}

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_ETH_PATH = '/simple/token_price/ethereum';
const COINGECKO_MATIC_PATH = '/simple/token_price/polygon-pos-network';
const COINGECKO_ASSETS_PATH = '/asset_platforms';
const COINGECKO_SUPPORTED_CURRENCIES = '/simple/supported_vs_currencies';
const ADDRESS = '0x01';

describe('TokenRatesController', () => {
  beforeEach(() => {
    jest.useFakeTimers('legacy');

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });


  // describe('constructor', () => {
  //   it('should set default state', () => {
  //     const controller = new TokenRatesController({
  //       getNetworkClientById: jest.fn(),
  //     });
  //     expect(controller.state).toStrictEqual({
  //       contractExchangeRates: {},
  //     });
  //   });

  //   it('should initialize with the default config', () => {
  //     const controller = new TokenRatesController({
  //       getNetworkClientById: jest.fn(),
  //     });
  //     expect(controller.config).toStrictEqual({
  //       interval: 180000,
  //       threshold: 21600000,
  //     });
  //   });

  //   it('should not poll by default', async () => {
  //     const fetchSpy = jest.spyOn(globalThis, 'fetch');
  //     new TokenRatesController({
  //       getNetworkClientById: jest.fn(),
  //       interval: 100,
  //     });

  //     jest.advanceTimersByTime(500);
  //     await flushPromises();

  //     expect(fetchSpy).not.toHaveBeenCalled();
  //   });
  // });

  describe('polling', () => {
    // it('should poll on the right interval', async () => {
    //   // const fetchSpy = jest
    //   //   .spyOn(globalThis, 'fetch')
    //   //   .mockImplementation(() => {
    //   //     throw new Error('Network error');
    //   //   });
    //   const interval = 100;
    //   const controller = new TokenRatesController({
    //     getNetworkClientById: jest.fn().mockReturnValue({
    //       configuration: {
    //         chainId: toHex(1),
    //         ticker: NetworksTicker.mainnet,
    //       },
    //     }),
    //     interval,
    //   });
    //   const updateExchangeRatesSpy = jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue()

    //   controller.startPollingByNetworkClientId('mainnet', {
    //     tokenAddresses: ['0x0'],
    //   });
    //   jest.advanceTimersByTime(0);
    //   await flushPromises();
    //   expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);

    //   jest.advanceTimersByTime(interval);
    //   await flushPromises();
    //   expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(2);

    //   jest.advanceTimersByTime(interval);
    //   await flushPromises();
    //   expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(3);
    // });

    it('should update state on poll', async () => {
      nock.recorder.rec()
      nock(COINGECKO_API)
        .get(`${COINGECKO_ETH_PATH}`)
        .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
        .reply(200, {
          '0x02': {
            eth: 0.001, // token value in terms of ETH
          },
          '0x03': {
            eth: 0.002,
          },
        });

      const interval = 100;
      const controller = new TokenRatesController({
        getNetworkClientById: jest.fn().mockReturnValue({
          configuration: {
            chainId: toHex(1),
            ticker: NetworksTicker.mainnet,
          },
        }),
        interval,
      });

      console.log("start spec")
      controller.startPollingByNetworkClientId('mainnet', {
        tokenAddresses: ['0x02', '0x03'],
      });
      console.log("started spec")
      jest.advanceTimersByTime(0);
      await flushPromises();
      jest.advanceTimersByTime(0);
      await flushPromises();
      console.log("waited 0ms and flushed")

      expect(controller.state.contractExchangeRates).toStrictEqual({
        '0x1': {
          'ETH': {
            '0x02': 0.001,
            '0x03': 0.002,
          }
        }
      });
    });

    // it('should stop polling', async () => {
    //   const interval = 100;
    //   const controller = new TokenRatesController({
    //     getNetworkClientById: jest.fn().mockReturnValue({
    //       configuration: {
    //         chainId: toHex(1),
    //         ticker: NetworksTicker.mainnet,
    //       },
    //     }),
    //     interval,
    //   });
    //   const updateExchangeRatesSpy = jest.spyOn(controller, 'updateExchangeRates').mockResolvedValue()

    //   const pollingToken = controller.startPollingByNetworkClientId('mainnet', {
    //     tokenAddresses: ['0x0'],
    //   });
    //   jest.advanceTimersByTime(0);
    //   await flushPromises();
    //   expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);

    //   controller.stopPollingByPollingToken(pollingToken);

    //   jest.advanceTimersByTime(interval);
    //   await flushPromises();
    //   expect(updateExchangeRatesSpy).toHaveBeenCalledTimes(1);
    // });
  });

  // describe('updateExchangeRates', () => {
  //   it('should update all rates', async () => {
  //     nock(COINGECKO_API)
  //       .get(
  //         `${COINGECKO_ETH_PATH}?contract_addresses=0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359,${ADDRESS}&vs_currencies=eth`,
  //       )
  //       .reply(200, {
  //         '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359': { eth: 0.00561045 },
  //       });
  //     const tokenAddress = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
  //     const controller = new TokenRatesController({
  //       getNetworkClientById: jest.fn(),
  //       interval: 100,
  //     });

  //     expect(controller.state.contractExchangeRates).toStrictEqual({});
  //     await controller.updateExchangeRates({
  //       chainId: toHex(1),
  //       nativeCurrency: 'ETH',
  //       tokenAddresses: [tokenAddress],
  //     });
  //     expect(Object.keys(controller.state.contractExchangeRates)).toContain(
  //       tokenAddress,
  //     );
  //     expect(
  //       controller.state.contractExchangeRates[tokenAddress],
  //     ).toBeGreaterThan(0);
  //     expect(Object.keys(controller.state.contractExchangeRates)).toContain(
  //       ADDRESS,
  //     );
  //     expect(controller.state.contractExchangeRates[ADDRESS]).toBe(0);
  //   });

  //   it('should handle balance not found in API', async () => {
  //     const controller = new TokenRatesController({
  //       getNetworkClientById: jest.fn(),
  //     });
  //     expect(controller.state.contractExchangeRates).toStrictEqual({});
  //     jest.spyOn(controller, 'fetchExchangeRate').mockRejectedValue({
  //       error: 'Not Found',
  //       message: 'Not Found',
  //     });

  //     const result = controller.updateExchangeRates({
  //       chainId: toHex(1),
  //       nativeCurrency: 'ETH',
  //       tokenAddresses: ['0x0'],
  //     });

  //     await expect(result).rejects.not.toThrow();
  //   });

  //   it('should update exchange rates when native currency is not supported by coingecko', async () => {
  //     nock(COINGECKO_API)
  //       .get(`${COINGECKO_MATIC_PATH}`)
  //       .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
  //       .reply(200, {
  //         '0x02': {
  //           eth: 0.001, // token value in terms of ETH
  //         },
  //         '0x03': {
  //           eth: 0.002,
  //         },
  //       });

  //     nock('https://min-api.cryptocompare.com')
  //       .get('/data/price?fsym=ETH&tsyms=MATIC')
  //       .reply(200, { MATIC: 0.5 }); // .5 eth to 1 matic

  //     const expectedExchangeRates = {
  //       '0x02': 0.0005, // token value in terms of matic = (token value in eth) * (eth value in matic) = .001 * .5
  //       '0x03': 0.001,
  //     };

  //     const controller = new TokenRatesController({
  //       getNetworkClientById: jest.fn(),
  //     });

  //     await controller.updateExchangeRates({
  //       chainId: toHex(137),
  //       nativeCurrency: 'MATIC',
  //       tokenAddresses: ['0x02', '0x03'],
  //     });

  //     expect(controller.state.contractExchangeRates).toStrictEqual(
  //       {
  //         [toHex(137)]: {
  //           'MATIC': expectedExchangeRates,
  //         }
  //       }
  //     );
  //   });
  // });
});
