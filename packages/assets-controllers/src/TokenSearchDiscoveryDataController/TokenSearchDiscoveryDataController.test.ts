import { Messenger } from '@metamask/base-controller';
import { ChainId } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import assert from 'assert';
import { useFakeTimers } from 'sinon';

import {
  getDefaultTokenSearchDiscoveryDataControllerState,
  TokenSearchDiscoveryDataController,
  controllerName,
  MAX_TOKEN_DISPLAY_DATA_LENGTH,
  type AllowedActions,
  type AllowedEvents,
  type TokenSearchDiscoveryDataControllerMessenger,
  type TokenSearchDiscoveryDataControllerState,
} from './TokenSearchDiscoveryDataController';
import type { NotFoundTokenDisplayData, FoundTokenDisplayData } from './types';
import { advanceTime } from '../../../../tests/helpers';
import type {
  AbstractTokenPricesService,
  TokenPrice,
  TokenPricesByTokenAddress,
} from '../token-prices-service/abstract-token-prices-service';
import { fetchTokenMetadata } from '../token-service';
import type { Token } from '../TokenRatesController';

jest.mock('../token-service', () => {
  const mockFetchTokenMetadata = jest.fn();
  return {
    fetchTokenMetadata: mockFetchTokenMetadata,
    TOKEN_METADATA_NO_SUPPORT_ERROR: 'Token metadata not supported',
  };
});

type MainMessenger = Messenger<AllowedActions, AllowedEvents>;

/**
 * Builds a not found token display data object.
 *
 * @param overrides - The overrides for the token display data.
 * @returns The not found token display data.
 */
function buildNotFoundTokenDisplayData(
  overrides: Partial<NotFoundTokenDisplayData> = {},
): NotFoundTokenDisplayData {
  return {
    found: false,
    address: '0x000000000000000000000000000000000000dea1',
    chainId: '0x1',
    currency: 'USD',
    ...overrides,
  };
}

/**
 * Builds a found token display data object.
 *
 * @param overrides - The overrides for the token display data.
 * @returns The found token display data.
 */
function buildFoundTokenDisplayData(
  overrides: Partial<FoundTokenDisplayData> = {},
): FoundTokenDisplayData {
  const tokenAddress = '0x000000000000000000000000000000000000000f';

  const tokenData: Token = {
    address: tokenAddress,
    decimals: 18,
    symbol: 'TEST',
    name: 'Test Token',
  };

  const priceData: TokenPrice<Hex, string> = {
    price: 10.5,
    currency: 'USD',
    tokenAddress: tokenAddress as Hex,
    allTimeHigh: 20,
    allTimeLow: 5,
    circulatingSupply: 1000000,
    dilutedMarketCap: 10000000,
    high1d: 11,
    low1d: 10,
    marketCap: 10500000,
    marketCapPercentChange1d: 2,
    priceChange1d: 0.5,
    pricePercentChange1d: 5,
    pricePercentChange1h: 1,
    pricePercentChange1y: 50,
    pricePercentChange7d: 10,
    pricePercentChange14d: 15,
    pricePercentChange30d: 20,
    pricePercentChange200d: 30,
    totalVolume: 500000,
  };

  return {
    found: true,
    address: tokenAddress,
    chainId: '0x1',
    currency: 'USD',
    token: tokenData,
    price: priceData,
    ...overrides,
  };
}

/**
 * Builds a messenger that `TokenSearchDiscoveryDataController` can use to communicate with other controllers.
 *
 * @param messenger - The main messenger.
 * @returns The restricted messenger.
 */
function buildTokenSearchDiscoveryDataControllerMessenger(
  messenger: MainMessenger = new Messenger(),
): TokenSearchDiscoveryDataControllerMessenger {
  return messenger.getRestricted({
    name: controllerName,
    allowedActions: ['CurrencyRateController:getState'],
    allowedEvents: [],
  });
}

/**
 * Builds a mock token prices service.
 *
 * @param overrides - The token prices service method overrides.
 * @returns The mock token prices service.
 */
function buildMockTokenPricesService(
  overrides: Partial<AbstractTokenPricesService> = {},
): AbstractTokenPricesService {
  return {
    async fetchTokenPrices() {
      return {};
    },
    validateChainIdSupported(_chainId: unknown): _chainId is Hex {
      return true;
    },
    validateCurrencySupported(_currency: unknown): _currency is string {
      return true;
    },
    ...overrides,
  };
}

/**
 * Builds a mock fetchTokens function.
 *
 * @param tokenAddresses - The token addresses to return.
 * @returns A function that returns the token addresses.
 */
function buildMockFetchTokens(tokenAddresses: string[] = []) {
  return async (_chainId: Hex) => {
    return tokenAddresses.map((address) => ({ address }));
  };
}

type WithControllerOptions = {
  options?: Partial<
    ConstructorParameters<typeof TokenSearchDiscoveryDataController>[0]
  >;
  mockCurrencyRateState?: { currentCurrency: string };
  mockTokenPricesService?: Partial<AbstractTokenPricesService>;
  mockFetchTokens?: (chainId: Hex) => Promise<{ address: string }[]>;
  mockSwapsSupportedChainIds?: Hex[];
  mockFetchSwapsTokensThresholdMs?: number;
};

type WithControllerCallback<ReturnValue> = ({
  controller,
  triggerCurrencyRateStateChange,
}: {
  controller: TokenSearchDiscoveryDataController;
  triggerCurrencyRateStateChange: (state: { currentCurrency: string }) => void;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a TokenSearchDiscoveryDataController, and calls a callback with it
 *
 * @param args - Either an options bag and a callback, or just a callback. If
 * provided, the options bag is equivalent to the controller options; the function
 * will be called with the built controller.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [optionsOrCallback, maybeCallback]: [
    WithControllerOptions | WithControllerCallback<ReturnValue>,
    WithControllerCallback<ReturnValue>?,
  ] = args;

  let options: WithControllerOptions;
  let callback: WithControllerCallback<ReturnValue>;

  if (typeof optionsOrCallback === 'function') {
    options = {};
    callback = optionsOrCallback;
  } else {
    options = optionsOrCallback;
    assert(maybeCallback);
    callback = maybeCallback;
  }

  const messenger = new Messenger<AllowedActions, AllowedEvents>();

  messenger.registerActionHandler('CurrencyRateController:getState', () => ({
    currentCurrency: 'USD',
    currencyRates: {},
    ...(options.mockCurrencyRateState ?? {}),
  }));

  const controllerMessenger =
    buildTokenSearchDiscoveryDataControllerMessenger(messenger);

  const controller = new TokenSearchDiscoveryDataController({
    messenger: controllerMessenger,
    state: {
      tokenDisplayData: [],
      swapsTokenAddressesByChainId: {},
    },
    tokenPricesService: buildMockTokenPricesService(
      options.mockTokenPricesService,
    ),
    swapsSupportedChainIds: options.mockSwapsSupportedChainIds ?? [
      ChainId.mainnet,
    ],
    fetchTokens:
      options.mockFetchTokens ??
      buildMockFetchTokens(['0x6B175474E89094C44Da98b954EedeAC495271d0F']),
    fetchSwapsTokensThresholdMs:
      options.mockFetchSwapsTokensThresholdMs ?? 86400000,
    ...options.options,
  });

  return await callback({
    controller,
    triggerCurrencyRateStateChange: (state: { currentCurrency: string }) => {
      messenger.unregisterActionHandler('CurrencyRateController:getState');
      messenger.registerActionHandler(
        'CurrencyRateController:getState',
        () => ({
          currentCurrency: state.currentCurrency,
          currencyRates: {},
        }),
      );
    },
  });
}

describe('TokenSearchDiscoveryDataController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should set default state', async () => {
      await withController(async ({ controller }) => {
        expect(controller.state).toStrictEqual({
          tokenDisplayData: [],
          swapsTokenAddressesByChainId: {},
        });
      });
    });

    it('should initialize with provided state', async () => {
      const initialState: Partial<TokenSearchDiscoveryDataControllerState> = {
        tokenDisplayData: [buildNotFoundTokenDisplayData()],
      };

      await withController(
        {
          options: {
            state: initialState,
          },
        },
        async ({ controller }) => {
          expect(controller.state.tokenDisplayData).toEqual(
            initialState.tokenDisplayData,
          );
          expect(controller.state.swapsTokenAddressesByChainId).toEqual({});
        },
      );
    });
  });

  describe('fetchSwapsTokens', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    it('should not fetch tokens for unsupported chain IDs', async () => {
      const mockFetchTokens = jest.fn().mockResolvedValue([]);
      const unsupportedChainId = '0x5' as Hex;

      await withController(
        {
          mockFetchTokens,
          mockSwapsSupportedChainIds: [ChainId.mainnet],
        },
        async ({ controller }) => {
          await controller.fetchSwapsTokens(unsupportedChainId);

          expect(mockFetchTokens).not.toHaveBeenCalled();
          expect(
            controller.state.swapsTokenAddressesByChainId[unsupportedChainId],
          ).toBeUndefined();
        },
      );
    });

    it('should fetch tokens for supported chain IDs', async () => {
      const mockTokens = [{ address: '0xToken1' }, { address: '0xToken2' }];
      const mockFetchTokens = jest.fn().mockResolvedValue(mockTokens);

      await withController(
        {
          mockFetchTokens,
          mockSwapsSupportedChainIds: [ChainId.mainnet],
        },
        async ({ controller }) => {
          await controller.fetchSwapsTokens(ChainId.mainnet);

          expect(mockFetchTokens).toHaveBeenCalledWith(ChainId.mainnet);
          expect(
            controller.state.swapsTokenAddressesByChainId[ChainId.mainnet],
          ).toBeDefined();
          expect(
            controller.state.swapsTokenAddressesByChainId[ChainId.mainnet]
              .addresses,
          ).toEqual(['0xToken1', '0xToken2']);
          expect(
            controller.state.swapsTokenAddressesByChainId[ChainId.mainnet]
              .isFetching,
          ).toBe(false);
        },
      );
    });

    it('should not fetch tokens again if threshold has not passed', async () => {
      const mockTokens = [{ address: '0xToken1' }];
      const mockFetchTokens = jest.fn().mockResolvedValue(mockTokens);
      const fetchThreshold = 10000;

      await withController(
        {
          mockFetchTokens,
          mockSwapsSupportedChainIds: [ChainId.mainnet],
          mockFetchSwapsTokensThresholdMs: fetchThreshold,
        },
        async ({ controller }) => {
          await controller.fetchSwapsTokens(ChainId.mainnet);
          expect(mockFetchTokens).toHaveBeenCalledTimes(1);

          mockFetchTokens.mockClear();

          await controller.fetchSwapsTokens(ChainId.mainnet);
          expect(mockFetchTokens).not.toHaveBeenCalled();

          await advanceTime({ clock, duration: fetchThreshold + 1000 });

          await controller.fetchSwapsTokens(ChainId.mainnet);
          expect(mockFetchTokens).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should set isFetching flag while fetching', async () => {
      let resolveTokens: (tokens: { address: string }[]) => void;
      const fetchTokensPromise = new Promise<{ address: string }[]>(
        (resolve) => {
          resolveTokens = resolve;
        },
      );
      const mockFetchTokens = jest.fn().mockReturnValue(fetchTokensPromise);

      await withController(
        {
          mockFetchTokens,
          mockSwapsSupportedChainIds: [ChainId.mainnet],
        },
        async ({ controller }) => {
          const fetchPromise = controller.fetchSwapsTokens(ChainId.mainnet);

          expect(
            controller.state.swapsTokenAddressesByChainId[ChainId.mainnet]
              .isFetching,
          ).toBe(true);

          resolveTokens([{ address: '0xToken1' }]);

          await fetchPromise;

          expect(
            controller.state.swapsTokenAddressesByChainId[ChainId.mainnet]
              .isFetching,
          ).toBe(false);
        },
      );
    });

    it('should refresh tokens after threshold time has elapsed', async () => {
      const chainId = ChainId.mainnet;
      const initialAddresses = ['0x123', '0x456'];
      const newAddresses = ['0x123', '0x456', '0x789'];
      const fetchTokensMock = jest
        .fn()
        .mockResolvedValueOnce(initialAddresses.map((address) => ({ address })))
        .mockResolvedValueOnce(newAddresses.map((address) => ({ address })));

      const testClock = useFakeTimers();
      const initialTime = Date.now();

      try {
        testClock.setSystemTime(initialTime);

        await withController(
          {
            mockFetchTokens: fetchTokensMock,
            mockFetchSwapsTokensThresholdMs: 1000,
          },
          async ({ controller }) => {
            await controller.fetchSwapsTokens(chainId);
            expect(
              controller.state.swapsTokenAddressesByChainId[chainId].addresses,
            ).toEqual(initialAddresses);

            await controller.fetchSwapsTokens(chainId);
            expect(fetchTokensMock).toHaveBeenCalledTimes(1);

            const fetchThreshold = 86400000;
            testClock.tick(fetchThreshold + 1000);

            await controller.fetchSwapsTokens(chainId);
            expect(fetchTokensMock).toHaveBeenCalledTimes(2);
            expect(
              controller.state.swapsTokenAddressesByChainId[chainId].addresses,
            ).toEqual(newAddresses);
          },
        );
      } finally {
        testClock.restore();
      }
    });
  });

  describe('fetchTokenDisplayData', () => {
    it('should fetch token display data for a token address', async () => {
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
      const tokenChainId = ChainId.mainnet;
      const tokenMetadata = {
        decimals: 18,
        symbol: 'TEST',
        name: 'Test Token',
      };

      (fetchTokenMetadata as jest.Mock).mockImplementation(() =>
        Promise.resolve(tokenMetadata),
      );

      const mockPriceData: TokenPrice<Hex, string> = {
        price: 10.5,
        currency: 'USD',
        tokenAddress: tokenAddress as Hex,
        allTimeHigh: 20,
        allTimeLow: 5,
        circulatingSupply: 1000000,
        dilutedMarketCap: 10000000,
        high1d: 11,
        low1d: 10,
        marketCap: 10500000,
        marketCapPercentChange1d: 2,
        priceChange1d: 0.5,
        pricePercentChange1d: 5,
        pricePercentChange1h: 1,
        pricePercentChange1y: 50,
        pricePercentChange7d: 10,
        pricePercentChange14d: 15,
        pricePercentChange30d: 20,
        pricePercentChange200d: 30,
        totalVolume: 500000,
      };

      const mockTokenPricesService = {
        fetchTokenPrices: jest.fn().mockResolvedValue({
          [tokenAddress as Hex]: mockPriceData,
        }),
      };

      await withController(
        {
          mockTokenPricesService,
        },
        async ({ controller }) => {
          await controller.fetchTokenDisplayData(tokenChainId, tokenAddress);

          expect(controller.state.tokenDisplayData).toHaveLength(1);

          const foundToken = controller.state
            .tokenDisplayData[0] as FoundTokenDisplayData;
          expect(foundToken.found).toBe(true);
          expect(foundToken.address).toBe(tokenAddress);
          expect(foundToken.chainId).toBe(tokenChainId);
          expect(foundToken.currency).toBe('USD');
          expect(foundToken.token.symbol).toBe(tokenMetadata.symbol);
          expect(foundToken.token.name).toBe(tokenMetadata.name);
          expect(foundToken.token.decimals).toBe(tokenMetadata.decimals);
          expect(foundToken.price).toStrictEqual(mockPriceData);
        },
      );
    });

    it('should add not found token display data when metadata fetch fails', async () => {
      const tokenAddress = '0x0000000000000000000000000000000000000010';
      const tokenChainId = ChainId.mainnet;

      (fetchTokenMetadata as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Token metadata not supported')),
      );

      await withController(async ({ controller }) => {
        await controller.fetchTokenDisplayData(tokenChainId, tokenAddress);

        const notFoundToken = controller.state.tokenDisplayData[0];

        expect(controller.state.tokenDisplayData).toHaveLength(1);
        expect(notFoundToken.found).toBe(false);
        expect(notFoundToken.address).toBe(tokenAddress);
        expect(notFoundToken.chainId).toBe(tokenChainId);
        expect(notFoundToken.currency).toBe('USD');
      });
    });

    it('should limit the number of token display data entries', async () => {
      const initialTokenDisplayData: NotFoundTokenDisplayData[] = [];
      for (let i = 0; i < MAX_TOKEN_DISPLAY_DATA_LENGTH; i++) {
        initialTokenDisplayData.push(
          buildNotFoundTokenDisplayData({
            address: `0x${i.toString().padStart(40, '0')}`,
            chainId: '0x1',
            currency: 'EUR',
          }),
        );
      }

      const newTokenAddress = '0xabcdef1234567890abcdef1234567890abcdef12';

      (fetchTokenMetadata as jest.Mock).mockResolvedValue({
        decimals: 18,
        symbol: 'NEW',
        name: 'New Token',
      });

      await withController(
        {
          options: {
            state: {
              tokenDisplayData: initialTokenDisplayData,
            },
          },
        },
        async ({ controller }) => {
          expect(controller.state.tokenDisplayData).toHaveLength(
            MAX_TOKEN_DISPLAY_DATA_LENGTH,
          );

          await controller.fetchTokenDisplayData('0x1', newTokenAddress);

          expect(controller.state.tokenDisplayData).toHaveLength(
            MAX_TOKEN_DISPLAY_DATA_LENGTH,
          );

          expect(controller.state.tokenDisplayData[0].address).toBe(
            newTokenAddress,
          );
        },
      );
    });

    it('should call fetchSwapsTokens before fetching token display data', async () => {
      const tokenAddress = '0x0000000000000000000000000000000000000010';
      const tokenChainId = ChainId.mainnet;

      await withController(async ({ controller }) => {
        const fetchSwapsTokensSpy = jest.spyOn(controller, 'fetchSwapsTokens');

        await controller.fetchTokenDisplayData(tokenChainId, tokenAddress);

        expect(fetchSwapsTokensSpy).toHaveBeenCalledWith(tokenChainId);
      });
    });

    it('should handle currency changes correctly', async () => {
      const tokenAddress = '0x0000000000000000000000000000000000000010';
      const tokenChainId = ChainId.mainnet;

      (fetchTokenMetadata as jest.Mock).mockResolvedValue({
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
        address: tokenAddress,
        occurrences: 1,
        aggregators: ['agg1'],
        iconUrl: 'https://example.com/logo.png',
      });

      const mockTokenPricesService = {
        async fetchTokenPrices({
          currency,
        }: {
          currency: string;
        }): Promise<TokenPricesByTokenAddress<Hex, string>> {
          const basePrice: Omit<
            TokenPrice<Hex, string>,
            'price' | 'currency'
          > = {
            tokenAddress: tokenAddress as Hex,
            allTimeHigh: 20,
            allTimeLow: 5,
            circulatingSupply: 1000000,
            dilutedMarketCap: 10000000,
            high1d: 12,
            low1d: 10,
            marketCap: 10000000,
            marketCapPercentChange1d: 2,
            priceChange1d: 0.5,
            pricePercentChange1d: 5,
            pricePercentChange1h: 1,
            pricePercentChange1y: 50,
            pricePercentChange7d: 10,
            pricePercentChange14d: 15,
            pricePercentChange30d: 20,
            pricePercentChange200d: 30,
            totalVolume: 500000,
          };

          return {
            [tokenAddress as Hex]: {
              ...basePrice,
              price: currency === 'USD' ? 10.5 : 9.5,
              currency,
            },
          };
        },
      };

      await withController(
        {
          mockTokenPricesService,
          mockCurrencyRateState: { currentCurrency: 'USD' },
        },
        async ({ controller, triggerCurrencyRateStateChange }) => {
          await controller.fetchTokenDisplayData(tokenChainId, tokenAddress);
          const usdToken = controller.state
            .tokenDisplayData[0] as FoundTokenDisplayData;
          expect(usdToken.currency).toBe('USD');
          expect(usdToken.found).toBe(true);
          expect(usdToken.price?.price).toBe(10.5);

          triggerCurrencyRateStateChange({ currentCurrency: 'EUR' });

          await controller.fetchTokenDisplayData(tokenChainId, tokenAddress);
          const eurToken = controller.state
            .tokenDisplayData[0] as FoundTokenDisplayData;
          expect(eurToken.currency).toBe('EUR');
          expect(eurToken.found).toBe(true);
          expect(eurToken.price?.price).toBe(9.5);
        },
      );
    });

    it('should handle unsupported currency', async () => {
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
      const tokenChainId = ChainId.mainnet;

      (fetchTokenMetadata as jest.Mock).mockResolvedValue({
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 18,
      });

      const mockTokenPrice: TokenPrice<Hex, string> = {
        price: 10.5,
        currency: 'USD',
        tokenAddress: tokenAddress as Hex,
        allTimeHigh: 20,
        allTimeLow: 5,
        circulatingSupply: 1000000,
        dilutedMarketCap: 10000000,
        high1d: 11,
        low1d: 10,
        marketCap: 10500000,
        marketCapPercentChange1d: 2,
        priceChange1d: 0.5,
        pricePercentChange1d: 5,
        pricePercentChange1h: 1,
        pricePercentChange1y: 50,
        pricePercentChange7d: 10,
        pricePercentChange14d: 15,
        pricePercentChange30d: 20,
        pricePercentChange200d: 30,
        totalVolume: 500000,
      };

      const mockFetchTokenPrices = jest
        .fn()
        .mockImplementation(({ currency }: { currency: string }) => {
          if (currency === 'USD') {
            return Promise.resolve({ [tokenAddress as Hex]: mockTokenPrice });
          }
          return Promise.resolve({});
        });

      const mockTokenPricesService = {
        fetchTokenPrices: mockFetchTokenPrices,
      };

      await withController(
        {
          mockTokenPricesService,
        },
        async ({ controller, triggerCurrencyRateStateChange }) => {
          await controller.fetchTokenDisplayData(tokenChainId, tokenAddress);

          const tokenWithUsd = controller.state
            .tokenDisplayData[0] as FoundTokenDisplayData;
          expect(tokenWithUsd.found).toBe(true);
          expect(tokenWithUsd.price).toBeDefined();

          triggerCurrencyRateStateChange({ currentCurrency: 'EUR' });

          await controller.fetchTokenDisplayData(tokenChainId, tokenAddress);

          const tokenWithEur = controller.state
            .tokenDisplayData[0] as FoundTokenDisplayData;
          expect(tokenWithEur.found).toBe(true);
          expect(tokenWithEur.currency).toBe('EUR');
          expect(tokenWithEur.price).toBeNull();
        },
      );
    });

    it('should move existing token to the beginning when fetched again', async () => {
      const tokenChainId = '0x1';
      const tokenAddress1 = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
      const tokenAddress2 = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

      (fetchTokenMetadata as jest.Mock).mockImplementation(
        (_chainId, address) => {
          if (address === tokenAddress1) {
            return Promise.resolve({
              decimals: 18,
              symbol: 'DAI',
              name: 'Dai Stablecoin',
            });
          } else if (address === tokenAddress2) {
            return Promise.resolve({
              decimals: 6,
              symbol: 'USDC',
              name: 'USD Coin',
            });
          }
          return Promise.reject(new Error('Unknown token'));
        },
      );

      const initialTokenDisplayData = [
        buildFoundTokenDisplayData({
          address: tokenAddress1,
          chainId: '0x2',
          currency: 'USD',
          token: {
            address: tokenAddress1,
            decimals: 18,
            symbol: 'DAI',
            name: 'Dai Stablecoin',
          },
        }),
        buildFoundTokenDisplayData({
          address: tokenAddress2,
          chainId: '0x2',
          currency: 'USD',
          token: {
            address: tokenAddress2,
            decimals: 6,
            symbol: 'USDC',
            name: 'USD Coin',
          },
        }),
      ];

      await withController(
        {
          options: {
            state: {
              tokenDisplayData: initialTokenDisplayData,
            },
          },
        },
        async ({ controller }) => {
          expect(controller.state.tokenDisplayData).toHaveLength(2);

          await controller.fetchTokenDisplayData(tokenChainId, tokenAddress1);

          expect(controller.state.tokenDisplayData).toHaveLength(3);
          expect(controller.state.tokenDisplayData[0].address).toBe(
            tokenAddress1,
          );
          expect(controller.state.tokenDisplayData[0].chainId).toBe(
            tokenChainId,
          );

          await controller.fetchTokenDisplayData(tokenChainId, tokenAddress2);

          expect(controller.state.tokenDisplayData).toHaveLength(4);
          expect(controller.state.tokenDisplayData[0].address).toBe(
            tokenAddress2,
          );
          expect(controller.state.tokenDisplayData[0].chainId).toBe(
            tokenChainId,
          );
          expect(controller.state.tokenDisplayData[1].address).toBe(
            tokenAddress1,
          );
          expect(controller.state.tokenDisplayData[1].chainId).toBe(
            tokenChainId,
          );
        },
      );
    });

    it('should rethrow unknown errors when fetching token metadata', async () => {
      const tokenChainId = '0x1';
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

      const customError = new Error('Custom error');
      Object.defineProperty(customError, 'name', { value: 'CustomError' });

      (fetchTokenMetadata as jest.Mock).mockRejectedValue(customError);

      jest.mock('../token-service', () => ({
        ...jest.requireActual('../token-service'),
        TOKEN_METADATA_NO_SUPPORT_ERROR: 'different error message',
      }));

      await withController(
        {
          options: {
            state: {
              tokenDisplayData: [],
            },
          },
        },
        async ({ controller }) => {
          let caughtError;
          try {
            await controller.fetchTokenDisplayData(tokenChainId, tokenAddress);
          } catch (error) {
            caughtError = error;
          }

          expect(caughtError).toBe(customError);
        },
      );
    });
  });

  describe('getDefaultTokenSearchDiscoveryDataControllerState', () => {
    it('should return the expected default state', () => {
      const defaultState = getDefaultTokenSearchDiscoveryDataControllerState();

      expect(defaultState).toStrictEqual({
        tokenDisplayData: [],
        swapsTokenAddressesByChainId: {},
      });
    });
  });
});
