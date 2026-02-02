import { deriveStateFromMetadata } from '@metamask/base-controller';
import { ChainId, toChecksumHexAddress } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type {
  NetworkClientConfiguration,
  NetworkClientId,
  NetworkConfiguration,
  NetworkState,
} from '@metamask/network-controller';
import { getDefaultNetworkControllerState } from '@metamask/network-controller';
import type { CaipAssetType, Hex } from '@metamask/utils';
import { add0x, KnownCaipNamespace } from '@metamask/utils';
import type { Patch } from 'immer';

import { TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import type {
  AbstractTokenPricesService,
  EvmAssetWithMarketData,
} from './token-prices-service/abstract-token-prices-service';
import { ZERO_ADDRESS } from './token-prices-service/codefi-v2';
import { controllerName, TokenRatesController } from './TokenRatesController';
import type {
  MarketDataDetails,
  Token,
  TokenRatesControllerMessenger,
  TokenRatesControllerState,
} from './TokenRatesController';
import { getDefaultTokensState } from './TokensController';
import type { TokensControllerState } from './TokensController';
import { flushPromises } from '../../../tests/helpers';

const defaultSelectedAddress = '0x1111111111111111111111111111111111111111';

type AllTokenRatesControllerActions =
  MessengerActions<TokenRatesControllerMessenger>;

type AllTokenRatesControllerEvents =
  MessengerEvents<TokenRatesControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllTokenRatesControllerActions,
  AllTokenRatesControllerEvents
>;

/**
 * Builds a messenger that `TokenRatesController` can use to communicate with other controllers.
 *
 * @param messenger - The root messenger.
 * @returns The controller messenger.
 */
function buildTokenRatesControllerMessenger(
  messenger: RootMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE }),
): TokenRatesControllerMessenger {
  const tokenRatesControllerMessenger = new Messenger<
    'TokenRatesController',
    AllTokenRatesControllerActions,
    AllTokenRatesControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: messenger,
  });
  messenger.delegate({
    messenger: tokenRatesControllerMessenger,
    actions: [
      'TokensController:getState',
      'NetworkController:getState',
      'NetworkEnablementController:getState',
    ],
    events: ['TokensController:stateChange', 'NetworkController:stateChange'],
  });
  return tokenRatesControllerMessenger;
}

describe('TokenRatesController', () => {
  describe('constructor', () => {
    it('should set default state', async () => {
      await withController(async ({ controller }) => {
        expect(controller.state).toStrictEqual({
          marketData: {},
        });
      });
    });

    it('should call setNativeAssetIdentifiers on tokenPricesService if available', async () => {
      const setNativeAssetIdentifiers = jest.fn();
      const tokenPricesService = buildMockTokenPricesService({
        setNativeAssetIdentifiers,
      });

      await withController(
        {
          options: {
            tokenPricesService,
          },
        },
        async () => {
          expect(setNativeAssetIdentifiers).toHaveBeenCalledWith({
            'eip155:1': 'eip155:1/slip44:60',
            'eip155:137': 'eip155:137/slip44:966',
          });
        },
      );
    });

    it('should not fail if tokenPricesService does not have setNativeAssetIdentifiers', async () => {
      const tokenPricesService = buildMockTokenPricesService();
      // Explicitly remove setNativeAssetIdentifiers to simulate an old service
      delete (tokenPricesService as Partial<AbstractTokenPricesService>)
        .setNativeAssetIdentifiers;

      await withController(
        {
          options: {
            tokenPricesService,
          },
        },
        async ({ controller }) => {
          // Should not throw and controller should be created
          expect(controller.state).toStrictEqual({
            marketData: {},
          });
        },
      );
    });
  });

  describe('updateExchangeRates', () => {
    it('does not fetch when disabled', async () => {
      const tokenPricesService = buildMockTokenPricesService();
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
            disabled: true,
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId: '0x1',
              nativeCurrency: 'ETH',
            },
          ]);

          expect(tokenPricesService.fetchTokenPrices).not.toHaveBeenCalled();
        },
      );
    });

    it('fetches rates for tokens in one batch', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
          },
          mockTokensControllerState: {
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId,
              nativeCurrency,
            },
          ]);

          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledWith({
            assets: [
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000000',
              },
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000001',
              },
            ],
            currency: nativeCurrency,
          });

          expect(controller.state.marketData).toStrictEqual({
            '0x1': {
              '0x0000000000000000000000000000000000000000':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.001,
                }),
              '0x0000000000000000000000000000000000000001':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.002,
                }),
            },
          });
        },
      );
    });

    it('fetches rates for all tokens in batches', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      const tokenAddresses = [...new Array(200).keys()]
        .map(buildAddress)
        .sort();
      const tokens = tokenAddresses.map((tokenAddress) => {
        return buildToken({ address: tokenAddress });
      });
      await withController(
        {
          options: {
            tokenPricesService,
          },
          mockTokensControllerState: {
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: tokens,
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId,
              nativeCurrency,
            },
          ]);
          const numBatches = Math.ceil(
            tokenAddresses.length / TOKEN_PRICES_BATCH_SIZE,
          );
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(
            numBatches,
          );

          for (let i = 1; i <= numBatches; i++) {
            expect(tokenPricesService.fetchTokenPrices).toHaveBeenNthCalledWith(
              i,
              {
                assets: tokenAddresses
                  .slice(
                    (i - 1) * TOKEN_PRICES_BATCH_SIZE,
                    i * TOKEN_PRICES_BATCH_SIZE,
                  )
                  .map((tokenAddress) => ({
                    chainId,
                    tokenAddress,
                  })),
                currency: nativeCurrency,
              },
            );
          }
        },
      );
    });

    it('leaves unsupported chain state keys empty', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
        validateChainIdSupported: (_chainId: unknown): _chainId is Hex => false,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId,
              nativeCurrency,
            },
          ]);

          expect(tokenPricesService.fetchTokenPrices).not.toHaveBeenCalled();
          expect(controller.state.marketData).toStrictEqual({
            [chainId]: {},
          });
        },
      );
    });

    it('fetches rates for unsupported native currencies', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: async ({ currency }) => {
          return [
            {
              tokenAddress: ZERO_ADDRESS,
              chainId,
              assetId: `${KnownCaipNamespace.Eip155}:1/slip44:60`,
              currency,
              price: 50,
              pricePercentChange1d: 0,
              priceChange1d: 0,
              allTimeHigh: 60,
              allTimeLow: 40,
              circulatingSupply: 2000,
              dilutedMarketCap: 1000,
              high1d: 55,
              low1d: 45,
              marketCap: 2000,
              marketCapPercentChange1d: 100,
              pricePercentChange14d: 100,
              pricePercentChange1h: 1,
              pricePercentChange1y: 200,
              pricePercentChange200d: 300,
              pricePercentChange30d: 200,
              pricePercentChange7d: 100,
              totalVolume: 100,
            },
            {
              tokenAddress: '0x0000000000000000000000000000000000000001',
              chainId,
              assetId: `${KnownCaipNamespace.Eip155}:1/erc20:0x0000000000000000000000000000000000000001`,
              currency,
              price: 100,
              pricePercentChange1d: 0,
              priceChange1d: 0,
              allTimeHigh: 200,
              allTimeLow: 80,
              circulatingSupply: 2000,
              dilutedMarketCap: 500,
              high1d: 110,
              low1d: 95,
              marketCap: 1000,
              marketCapPercentChange1d: 100,
              pricePercentChange14d: 100,
              pricePercentChange1h: 1,
              pricePercentChange1y: 200,
              pricePercentChange200d: 300,
              pricePercentChange30d: 200,
              pricePercentChange7d: 100,
              totalVolume: 100,
            },
          ];
        },
        validateCurrencySupported: (_currency: unknown): _currency is string =>
          false,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
          },
          mockTokensControllerState: {
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId,
              nativeCurrency,
            },
          ]);

          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledWith({
            assets: [
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000000',
              },
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000001',
              },
            ],
            currency: 'usd',
          });

          expect(controller.state.marketData).toStrictEqual({
            '0x1': {
              '0x0000000000000000000000000000000000000000': {
                tokenAddress: '0x0000000000000000000000000000000000000000',
                chainId: '0x1',
                assetId: 'eip155:1/slip44:60',
                currency: 'ETH',
                price: 1,
                pricePercentChange1d: 0,
                priceChange1d: 0,
                allTimeHigh: 1.2,
                allTimeLow: 0.8,
                circulatingSupply: 2000,
                dilutedMarketCap: 20,
                high1d: 1.1,
                low1d: 0.9,
                marketCap: 40,
                marketCapPercentChange1d: 100,
                pricePercentChange14d: 100,
                pricePercentChange1h: 1,
                pricePercentChange1y: 200,
                pricePercentChange200d: 300,
                pricePercentChange30d: 200,
                pricePercentChange7d: 100,
                totalVolume: 2,
              },
              '0x0000000000000000000000000000000000000001': {
                tokenAddress: '0x0000000000000000000000000000000000000001',
                chainId: '0x1',
                assetId:
                  'eip155:1/erc20:0x0000000000000000000000000000000000000001',
                currency: 'ETH',
                price: 2,
                pricePercentChange1d: 0,
                priceChange1d: 0,
                allTimeHigh: 4,
                allTimeLow: 1.6,
                circulatingSupply: 2000,
                dilutedMarketCap: 10,
                high1d: 2.2,
                low1d: 1.9,
                marketCap: 20,
                marketCapPercentChange1d: 100,
                pricePercentChange14d: 100,
                pricePercentChange1h: 1,
                pricePercentChange1y: 200,
                pricePercentChange200d: 300,
                pricePercentChange30d: 200,
                pricePercentChange7d: 100,
                totalVolume: 2,
              },
            },
          });
        },
      );
    });

    it('does not convert prices when the native currency fallback price is 0', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: async ({ currency }) => {
          return [
            {
              tokenAddress: ZERO_ADDRESS,
              chainId,
              assetId: `${KnownCaipNamespace.Eip155}:1/slip44:60`,
              currency,
              price: 0,
              pricePercentChange1d: 0,
              priceChange1d: 0,
              allTimeHigh: 60,
              allTimeLow: 40,
              circulatingSupply: 2000,
              dilutedMarketCap: 1000,
              high1d: 55,
              low1d: 45,
              marketCap: 2000,
              marketCapPercentChange1d: 100,
              pricePercentChange14d: 100,
              pricePercentChange1h: 1,
              pricePercentChange1y: 200,
              pricePercentChange200d: 300,
              pricePercentChange30d: 200,
              pricePercentChange7d: 100,
              totalVolume: 100,
            },
            {
              tokenAddress: '0x0000000000000000000000000000000000000001',
              chainId,
              assetId: `${KnownCaipNamespace.Eip155}:1/erc20:0x0000000000000000000000000000000000000001`,
              currency,
              price: 100,
              pricePercentChange1d: 0,
              priceChange1d: 0,
              allTimeHigh: 200,
              allTimeLow: 80,
              circulatingSupply: 2000,
              dilutedMarketCap: 500,
              high1d: 110,
              low1d: 95,
              marketCap: 1000,
              marketCapPercentChange1d: 100,
              pricePercentChange14d: 100,
              pricePercentChange1h: 1,
              pricePercentChange1y: 200,
              pricePercentChange200d: 300,
              pricePercentChange30d: 200,
              pricePercentChange7d: 100,
              totalVolume: 100,
            },
          ];
        },
        validateCurrencySupported: (_currency: unknown): _currency is string =>
          false,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
          },
          mockTokensControllerState: {
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId,
              nativeCurrency,
            },
          ]);

          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledWith({
            assets: [
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000000',
              },
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000001',
              },
            ],
            currency: 'usd',
          });

          expect(controller.state.marketData).toStrictEqual({
            '0x1': {},
          });
        },
      );
    });

    it('does not convert prices when the native currency fallback price is missing', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: async ({ currency }) => {
          return [
            {
              tokenAddress: '0x0000000000000000000000000000000000000001',
              chainId,
              assetId: `${KnownCaipNamespace.Eip155}:1/erc20:0x0000000000000000000000000000000000000001`,
              currency,
              price: 100,
              pricePercentChange1d: 0,
              priceChange1d: 0,
              allTimeHigh: 200,
              allTimeLow: 80,
              circulatingSupply: 2000,
              dilutedMarketCap: 500,
              high1d: 110,
              low1d: 95,
              marketCap: 1000,
              marketCapPercentChange1d: 100,
              pricePercentChange14d: 100,
              pricePercentChange1h: 1,
              pricePercentChange1y: 200,
              pricePercentChange200d: 300,
              pricePercentChange30d: 200,
              pricePercentChange7d: 100,
              totalVolume: 100,
            },
          ];
        },
        validateCurrencySupported: (_currency: unknown): _currency is string =>
          false,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
          },
          mockTokensControllerState: {
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.updateExchangeRates([
            {
              chainId,
              nativeCurrency,
            },
          ]);

          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledWith({
            assets: [
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000000',
              },
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000001',
              },
            ],
            currency: 'usd',
          });

          expect(controller.state.marketData).toStrictEqual({
            '0x1': {},
          });
        },
      );
    });
  });

  describe('_executePoll', () => {
    it('fetches rates for the given chains', async () => {
      await withController({}, async ({ controller }) => {
        jest.spyOn(controller, 'updateExchangeRates');

        await controller._executePoll({ chainIds: ['0x1'] });

        expect(controller.updateExchangeRates).toHaveBeenCalledWith([
          {
            chainId: '0x1',
            nativeCurrency: 'ETH',
          },
        ]);
      });
    });

    it('does not include chains with no network configuration', async () => {
      await withController(
        {
          mockNetworkState: {
            networkConfigurationsByChainId: {},
          },
        },
        async ({ controller }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          await controller._executePoll({ chainIds: ['0x1'] });

          expect(controller.updateExchangeRates).toHaveBeenCalledWith([]);
        },
      );
    });
  });

  describe('TokensController:stateChange', () => {
    it('fetches rates for all updated chains', async () => {
      jest.useFakeTimers();
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      const tokenPricesService = buildMockTokenPricesService({
        fetchTokenPrices: fetchTokenPricesWithIncreasingPriceForEachToken,
      });
      jest.spyOn(tokenPricesService, 'fetchTokenPrices');

      await withController(
        {
          options: {
            tokenPricesService,
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                  {
                    address: '0x0000000000000000000000000000000000000002',
                    decimals: 0,
                    symbol: 'TOK2',
                  },
                ],
              },
            },
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledTimes(1);
          expect(tokenPricesService.fetchTokenPrices).toHaveBeenCalledWith({
            assets: [
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000000',
              },
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000001',
              },
              {
                chainId,
                tokenAddress: '0x0000000000000000000000000000000000000002',
              },
            ],
            currency: nativeCurrency,
          });

          expect(controller.state.marketData).toStrictEqual({
            [chainId]: {
              '0x0000000000000000000000000000000000000000':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.001,
                }),
              '0x0000000000000000000000000000000000000001':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.002,
                }),
              '0x0000000000000000000000000000000000000002':
                expect.objectContaining({
                  currency: nativeCurrency,
                  price: 0.003,
                }),
            },
          });
        },
      );
    });

    it('does not fetch when disabled', async () => {
      jest.useFakeTimers();
      const chainId = '0x1';

      await withController(
        {
          options: {
            disabled: true,
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.updateExchangeRates).not.toHaveBeenCalled();
        },
      );
    });

    it('does not include chains when tokens are not updated', async () => {
      jest.useFakeTimers();
      const chainId = '0x1';

      await withController(
        {
          mockTokensControllerState: {
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.updateExchangeRates).toHaveBeenCalledWith([]);
        },
      );
    });

    it('does not include chains with no network configuration', async () => {
      jest.useFakeTimers();
      const chainId = '0x1';

      await withController(
        {
          mockNetworkState: {
            networkConfigurationsByChainId: {},
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.updateExchangeRates).toHaveBeenCalledWith([]);
        },
      );
    });
  });

  describe('NetworkController:stateChange', () => {
    it('remove state from deleted networks', async () => {
      const chainId = '0x1';
      const nativeCurrency = 'ETH';

      await withController(
        {
          options: {
            disabled: true,
            state: {
              marketData: {
                [chainId]: {
                  '0x0000000000000000000000000000000000000000': {
                    currency: nativeCurrency,
                    price: 0.001,
                  } as unknown as MarketDataDetails,
                },
                '0x2': {
                  '0x0000000000000000000000000000000000000000': {
                    currency: nativeCurrency,
                    price: 0.001,
                  } as unknown as MarketDataDetails,
                },
              },
            },
          },
        },
        async ({ controller, triggerNetworkStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          triggerNetworkStateChange(
            {
              ...getDefaultNetworkControllerState(),
              networkConfigurationsByChainId: {
                [chainId]: {
                  chainId,
                  nativeCurrency,
                } as unknown as NetworkConfiguration,
              },
            },
            [
              {
                op: 'remove',
                path: ['networkConfigurationsByChainId', chainId],
              },
            ],
          );

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.state.marketData).toStrictEqual({
            '0x2': {
              '0x0000000000000000000000000000000000000000': {
                currency: nativeCurrency,
                price: 0.001,
              } as unknown as MarketDataDetails,
            },
          });
        },
      );
    });
  });

  describe('enable', () => {
    it('enables events', async () => {
      jest.useFakeTimers();

      const chainId = '0x1';
      await withController(
        {
          options: {
            disabled: true,
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          controller.enable();

          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.updateExchangeRates).toHaveBeenCalledWith([
            {
              chainId,
              nativeCurrency: 'ETH',
            },
          ]);
        },
      );
    });
  });

  describe('disable', () => {
    it('disables events', async () => {
      jest.useFakeTimers();

      const chainId = '0x1';
      await withController(
        {
          options: {
            disabled: false,
          },
        },
        async ({ controller, triggerTokensStateChange }) => {
          jest.spyOn(controller, 'updateExchangeRates');

          controller.disable();

          triggerTokensStateChange({
            allTokens: {
              [chainId]: {
                [defaultSelectedAddress]: [
                  {
                    address: '0x0000000000000000000000000000000000000001',
                    decimals: 0,
                    symbol: 'TOK1',
                  },
                ],
              },
            },
            allDetectedTokens: {},
            allIgnoredTokens: {},
          });

          jest.advanceTimersToNextTimer();
          await flushPromises();

          expect(controller.updateExchangeRates).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('resetState', () => {
    it('resets the state to default state', async () => {
      const initialState: TokenRatesControllerState = {
        marketData: {
          [ChainId.mainnet]: {
            '0x02': {
              currency: 'ETH',
              priceChange1d: 0,
              pricePercentChange1d: 0,
              tokenAddress: '0x02',
              allTimeHigh: 4000,
              allTimeLow: 900,
              circulatingSupply: 2000,
              dilutedMarketCap: 100,
              high1d: 200,
              low1d: 100,
              marketCap: 1000,
              marketCapPercentChange1d: 100,
              price: 0.001,
              pricePercentChange14d: 100,
              pricePercentChange1h: 1,
              pricePercentChange1y: 200,
              pricePercentChange200d: 300,
              pricePercentChange30d: 200,
              pricePercentChange7d: 100,
              totalVolume: 100,
            },
          },
        },
      };

      await withController(
        {
          options: {
            state: initialState,
          },
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(initialState);

          controller.resetState();

          expect(controller.state).toStrictEqual({
            marketData: {},
          });
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "marketData": Object {},
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "marketData": Object {},
          }
        `);
      });
    });
  });
});
/**
 * A callback for the `withController` helper function.
 *
 * @param args - The arguments.
 * @param args.controller - The controller that the test helper created.
 * @param args.controllerEvents - A collection of methods for dispatching mock
 * events from external controllers.
 */
type WithControllerCallback<ReturnValue> = ({
  controller,
  triggerTokensStateChange,
  triggerNetworkStateChange,
}: {
  controller: TokenRatesController;
  triggerTokensStateChange: (state: TokensControllerState) => void;
  triggerNetworkStateChange: (state: NetworkState, patches?: Patch[]) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof TokenRatesController>[0]>;
  mockNetworkClientConfigurationsByNetworkClientId?: Record<
    NetworkClientId,
    NetworkClientConfiguration
  >;
  mockTokensControllerState?: Partial<TokensControllerState>;
  mockNetworkState?: Partial<NetworkState>;
};

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options, and calls the given function
 * with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag is equivalent to the controller options; the function will be called
 * with the built controller.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const { options, mockTokensControllerState, mockNetworkState } = rest;
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const mockTokensState = jest.fn<TokensControllerState, []>();
  messenger.registerActionHandler(
    'TokensController:getState',
    mockTokensState.mockReturnValue({
      ...getDefaultTokensState(),
      ...mockTokensControllerState,
    }),
  );

  const networkStateMock = jest.fn<NetworkState, []>();
  messenger.registerActionHandler(
    'NetworkController:getState',
    networkStateMock.mockReturnValue({
      ...getDefaultNetworkControllerState(),
      ...mockNetworkState,
    }),
  );

  // Register NetworkEnablementController:getState handler
  messenger.registerActionHandler(
    'NetworkEnablementController:getState',
    jest.fn().mockReturnValue({
      enabledNetworkMap: {},
      nativeAssetIdentifiers: {
        'eip155:1': 'eip155:1/slip44:60',
        'eip155:137': 'eip155:137/slip44:966',
      },
    }),
  );

  const controller = new TokenRatesController({
    tokenPricesService: buildMockTokenPricesService(),
    messenger: buildTokenRatesControllerMessenger(messenger),
    ...options,
  });
  try {
    return await fn({
      controller,
      triggerTokensStateChange: (state: TokensControllerState) => {
        messenger.publish('TokensController:stateChange', state, []);
      },
      triggerNetworkStateChange: (
        state: NetworkState,
        patches: Patch[] = [],
      ) => {
        messenger.publish('NetworkController:stateChange', state, patches);
      },
    });
  } finally {
    controller.stopAllPolling();
  }
}

/**
 * Builds a mock token prices service.
 *
 * @param overrides - The properties of the token prices service you want to
 * provide explicitly.
 * @returns The built mock token prices service.
 */
function buildMockTokenPricesService(
  overrides: Partial<AbstractTokenPricesService> = {},
): AbstractTokenPricesService {
  return {
    async fetchTokenPrices() {
      return [];
    },
    async fetchExchangeRates() {
      return {};
    },
    validateChainIdSupported(_chainId: unknown): _chainId is Hex {
      return true;
    },
    validateCurrencySupported(_currency: unknown): _currency is string {
      return true;
    },
    setNativeAssetIdentifiers: jest.fn(),
    ...overrides,
  };
}

/**
 * A version of the token prices service `fetchTokenPrices` method where the
 * price of each given token is incremented by one.
 *
 * @param args - The arguments to this function.
 * @param args.assets - The token addresses and chainIds.
 * @param args.currency - The currency.
 * @returns The token prices.
 */
async function fetchTokenPricesWithIncreasingPriceForEachToken<
  Currency extends string,
>({
  assets,
  currency,
}: {
  assets: { tokenAddress: Hex; chainId: Hex }[];
  currency: Currency;
}): Promise<EvmAssetWithMarketData<Hex, Currency>[]> {
  return assets.map(({ tokenAddress, chainId }, i) => ({
    tokenAddress,
    chainId,
    assetId:
      `${KnownCaipNamespace.Eip155}:1/${tokenAddress === ZERO_ADDRESS ? 'slip44:60' : `erc20:${tokenAddress.toLowerCase()}`}` as CaipAssetType,
    currency,
    pricePercentChange1d: 0,
    priceChange1d: 0,
    allTimeHigh: 4000,
    allTimeLow: 900,
    circulatingSupply: 2000,
    dilutedMarketCap: 100,
    high1d: 200,
    low1d: 100,
    marketCap: 1000,
    marketCapPercentChange1d: 100,
    price: (i + 1) / 1000,
    pricePercentChange14d: 100,
    pricePercentChange1h: 1,
    pricePercentChange1y: 200,
    pricePercentChange200d: 300,
    pricePercentChange30d: 200,
    pricePercentChange7d: 100,
    totalVolume: 100,
  }));
}

/**
 * Constructs a checksum Ethereum address.
 *
 * @param number - The address as a decimal number.
 * @returns The address as an 0x-prefixed ERC-55 mixed-case checksum address in
 * hexadecimal format.
 */
function buildAddress(number: number) {
  return toChecksumHexAddress(add0x(number.toString(16).padStart(40, '0')));
}

/**
 * Constructs an object that satisfies the Token interface, filling in missing
 * properties with defaults. This makes it possible to only specify properties
 * that the test cares about.
 *
 * @param overrides - The properties that should be assigned to the new token.
 * @returns The constructed token.
 */
function buildToken(overrides: Partial<Token> = {}) {
  return {
    address: buildAddress(1),
    decimals: 0,
    symbol: '',
    aggregators: [],
    ...overrides,
  };
}
