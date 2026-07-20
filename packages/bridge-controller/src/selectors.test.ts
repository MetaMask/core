import { getAddress } from '@ethersproject/address';
import type { MarketDataDetails } from '@metamask/assets-controllers';
import { toHex } from '@metamask/controller-utils';
import { SolScope } from '@metamask/keyring-api';
import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { merge } from 'lodash';

import { mockBridgeQuotesErc20Erc20V1 } from '../tests/mock-quotes-erc20-erc20';
import { mockBridgeQuotesNativeErc20V1 } from '../tests/mock-quotes-native-erc20';
import { DEFAULT_CHAIN_RANKING, ETH_USDT_ADDRESS } from './constants/bridge';
import type { BridgeAppState } from './selectors';
import {
  selectExchangeRateByAssetId,
  selectIsAssetExchangeRateInState,
  selectBridgeQuotes,
  selectIsQuoteExpired,
  selectBridgeFeatureFlags,
  selectMinimumBalanceForRentExemptionInSOL,
  selectDefaultSlippagePercentage,
  selectTokenWarnings,
  selectBatchSellQuotes,
  selectBatchSellTrades,
} from './selectors';
import {
  SortOrder,
  RequestStatus,
  ChainId,
  BridgeAsset,
  NonEvmFees,
} from './types';
import { getNativeAssetForChainId, isNativeAddress } from './utils/bridge';
import {
  formatAddressToAssetId,
  formatAddressToCaipReference,
  formatChainIdToDec,
  formatChainIdToHex,
} from './utils/caip-formatters';
import { calcQuoteMetadata } from './utils/quote-metadata/calculators';
import { mergeQuoteMetadata } from './utils/quote-metadata/merge';
import { BatchSellTransactionType } from './validators/batch-sell';
import type { QuoteResponseV1 } from './validators/quote-response-v1';
import { validateQuoteResponseV1 } from './validators/quote-response-v1';

const MOCK_USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const MOCK_MUSD_ADDRESS = '0x12345A7890123456789012345678901234567890';

describe('Bridge Selectors', () => {
  describe('selectExchangeRateByAssetId', () => {
    const mockExchangeRateSources = {
      assetExchangeRates: {
        [formatAddressToAssetId(MOCK_USDC_ADDRESS, '1')?.toLowerCase() ??
        MOCK_USDC_ADDRESS]: {
          exchangeRate: '2.5',
          usdExchangeRate: '1.5',
        },
        'solana:101/token:456': {
          exchangeRate: '3.0',
        },
      },
      currencyRates: {
        ETH: {
          conversionRate: 2468.12, // ETH rate in the user's selected currency
          usdConversionRate: 1800, // ETH rate in USD
        },
      },
      marketData: {
        '0x1': {
          [MOCK_MUSD_ADDRESS]: {
            price: 50 / 2468.12,
            currency: 'ETH',
          },
        },
      },
      conversionRates: {
        [`${SolScope.Mainnet}/token:789`]: {
          rate: '4.0',
        },
      },
    } as unknown as BridgeAppState;

    it('should return empty object if chainId or address is missing', () => {
      expect(
        selectExchangeRateByAssetId(mockExchangeRateSources, undefined),
      ).toStrictEqual({});
      expect(
        selectExchangeRateByAssetId(
          mockExchangeRateSources,
          formatAddressToAssetId(MOCK_USDC_ADDRESS),
        ),
      ).toStrictEqual({});
    });

    it('should return bridge controller rate if available', () => {
      const result = selectExchangeRateByAssetId(
        mockExchangeRateSources,
        formatAddressToAssetId(MOCK_USDC_ADDRESS, '1'),
      );
      expect(result).toStrictEqual({
        exchangeRate: '2.5',
        usdExchangeRate: '1.5',
      });
    });

    it('should handle Solana chain rates', () => {
      const result = selectExchangeRateByAssetId(
        mockExchangeRateSources,
        formatAddressToAssetId('789', SolScope.Mainnet),
      );
      // usdExchangeRate = rate * (usdConversionRate / conversionRate) = 4.0 * (1800 / 2468.12)
      expect(result).toStrictEqual({
        exchangeRate: '4.0',
        usdExchangeRate: new BigNumber('4.0')
          .times(new BigNumber(1800).div(2468.12))
          .toString(),
      });
    });

    it('should return undefined usdExchangeRate for Solana when currencyRates is empty', () => {
      const result = selectExchangeRateByAssetId(
        {
          ...mockExchangeRateSources,
          currencyRates: {},
        } as unknown as BridgeAppState,
        formatAddressToAssetId('789', SolScope.Mainnet),
      );
      expect(result).toStrictEqual({
        exchangeRate: '4.0',
        usdExchangeRate: undefined,
      });
    });

    it('should return rate as usdExchangeRate for Solana when user currency is USD', () => {
      const result = selectExchangeRateByAssetId(
        {
          ...mockExchangeRateSources,
          currencyRates: {
            ETH: {
              conversionRate: 1800,
              usdConversionRate: 1800,
            },
          },
        } as unknown as BridgeAppState,
        formatAddressToAssetId('789', SolScope.Mainnet),
      );
      // When user currency is USD, conversionRate === usdConversionRate, ratio is 1
      expect(result).toStrictEqual({
        exchangeRate: '4.0',
        usdExchangeRate: '4',
      });
    });

    it('should handle EVM native asset rates', () => {
      const result = selectExchangeRateByAssetId(
        mockExchangeRateSources,
        formatAddressToAssetId(
          '0x0000000000000000000000000000000000000000',
          '1',
        ),
      );
      expect(result).toStrictEqual({
        exchangeRate: '2468.12',
        usdExchangeRate: '1800',
      });
    });

    it('should handle EVM token rates', () => {
      const result = selectExchangeRateByAssetId(
        mockExchangeRateSources,
        formatAddressToAssetId(MOCK_MUSD_ADDRESS.toLowerCase(), '1'),
      );
      expect(result).toStrictEqual({
        exchangeRate: '50.00000000000000162804',
        usdExchangeRate: '36.4650017017000806',
      });
    });

    it('should handle EVM token rates when the asset ID address is lowercase and market data is checksummed', () => {
      const result = selectExchangeRateByAssetId(
        mockExchangeRateSources,
        `eip155:1/erc20:${MOCK_MUSD_ADDRESS.toLowerCase()}`,
      );
      expect(result).toStrictEqual({
        exchangeRate: '50.00000000000000162804',
        usdExchangeRate: '36.4650017017000806',
      });
    });

    it('should return empty object for an EVM token whose market data price is zero', () => {
      const result = selectExchangeRateByAssetId(
        {
          ...mockExchangeRateSources,
          marketData: {
            '0x1': {
              [MOCK_MUSD_ADDRESS]: {
                price: 0,
                currency: 'ETH',
              },
            },
          },
        } as unknown as BridgeAppState,
        formatAddressToAssetId(MOCK_MUSD_ADDRESS.toLowerCase(), '1'),
      );
      expect(result).toStrictEqual({});
    });

    it('should return empty object for an EVM token whose market data has no price', () => {
      const result = selectExchangeRateByAssetId(
        {
          ...mockExchangeRateSources,
          marketData: {
            '0x1': {
              [MOCK_MUSD_ADDRESS]: {
                currency: 'ETH',
              },
            },
          },
        } as unknown as BridgeAppState,
        formatAddressToAssetId(MOCK_MUSD_ADDRESS.toLowerCase(), '1'),
      );
      expect(result).toStrictEqual({});
    });

    it('should not throw when EVM token rate asset ID has a malformed hex address', () => {
      expect(() =>
        selectExchangeRateByAssetId(
          mockExchangeRateSources,
          'eip155:1/erc20:0x123',
        ),
      ).not.toThrow();
      expect(
        selectExchangeRateByAssetId(
          mockExchangeRateSources,
          'eip155:1/erc20:0x123',
        ),
      ).toStrictEqual({});
    });
  });

  describe('selectIsAssetExchangeRateInState', () => {
    const assetId =
      formatAddressToAssetId(MOCK_USDC_ADDRESS, '1')?.toLowerCase() ?? '';
    const mockExchangeRateSources = {
      assetExchangeRates: {
        [assetId]: {
          exchangeRate: '2.5',
        },
      },
      currencyRates: {},
      marketData: {},
      conversionRates: {},
    } as unknown as BridgeAppState;

    it('should return true if exchange rate exists for both currency and USD', () => {
      expect(
        selectIsAssetExchangeRateInState(
          {
            ...mockExchangeRateSources,
            assetExchangeRates: {
              ...mockExchangeRateSources.assetExchangeRates,
              [assetId]: {
                // @ts-expect-error - ignore type error
                ...mockExchangeRateSources.assetExchangeRates[assetId],
                usdExchangeRate: '1.5',
              },
            },
          },
          formatAddressToAssetId(MOCK_USDC_ADDRESS, '1'),
        ),
      ).toBe(true);
    });

    it('should return false if USD exchange rate does not exist', () => {
      expect(
        selectIsAssetExchangeRateInState(
          mockExchangeRateSources,
          formatAddressToAssetId(MOCK_USDC_ADDRESS, '1'),
        ),
      ).toBe(false);
    });

    it('should return false if exchange rate does not exist', () => {
      expect(
        selectIsAssetExchangeRateInState(
          mockExchangeRateSources,
          formatAddressToAssetId(ETH_USDT_ADDRESS, '1'),
        ),
      ).toBe(false);
    });

    it('should return false for an EVM token whose only market data price is zero', () => {
      // A zero-price market data entry must not be mistaken for a known rate,
      // otherwise the controller skips fetching the token's real price.
      expect(
        selectIsAssetExchangeRateInState(
          {
            ...mockExchangeRateSources,
            assetExchangeRates: {},
            currencyRates: {
              ETH: {
                conversionRate: 2468.12,
                usdConversionRate: 1800,
              },
            },
            marketData: {
              '0x1': {
                [MOCK_MUSD_ADDRESS]: {
                  price: 0,
                  currency: 'ETH',
                },
              },
            },
          } as unknown as BridgeAppState,
          formatAddressToAssetId(MOCK_MUSD_ADDRESS.toLowerCase(), '1'),
        ),
      ).toBe(false);
    });

    it('should return false if parameters are missing', () => {
      expect(selectIsAssetExchangeRateInState(mockExchangeRateSources)).toBe(
        false,
      );
      expect(
        selectIsAssetExchangeRateInState(mockExchangeRateSources, undefined),
      ).toBe(false);
    });
  });

  describe('selectIsQuoteExpired', () => {
    const mockState = {
      quotes: [],
      quoteRequest: [
        {
          srcChainId: '1',
          destChainId: '137',
          srcTokenAddress: '0x0000000000000000000000000000000000000000',
          destTokenAddress: '0x0000000000000000000000000000000000000000',
          insufficientBal: false,
        },
      ],
      quotesLastFetched: Date.now(),
      quotesLoadingStatus: RequestStatus.FETCHED,
      quoteFetchError: null,
      quotesRefreshCount: 0,
      quotesInitialLoadTime: Date.now(),
      remoteFeatureFlags: {
        bridgeConfig: {
          maxRefreshCount: 5,
          refreshRate: 30000,
          chainRanking: [],
          chains: {},
          support: true,
          minimumVersion: '0.0.0',
        },
      },
      assetExchangeRates: {},
      currencyRates: {},
      marketData: {},
      conversionRates: {},
      participateInMetaMetrics: true,
      gasFeeEstimatesByChainId: {
        '0x1': {
          gasFeeEstimates: {
            estimatedBaseFee: '50',
            medium: {
              suggestedMaxPriorityFeePerGas: '75',
              suggestedMaxFeePerGas: '77',
            },
            high: {
              suggestedMaxPriorityFeePerGas: '100',
              suggestedMaxFeePerGas: '102',
            },
          },
        },
      },
    } as unknown as BridgeAppState;

    const mockClientParams = {
      sortOrder: SortOrder.COST_ASC,
      selectedQuote: null,
    };

    it('should return false when quote is not expired', () => {
      const result = selectIsQuoteExpired(
        mockState,
        mockClientParams,
        Date.now(),
      );
      expect(result).toBe(false);
    });

    it('should return true when quote is expired', () => {
      const stateWithOldQuote = {
        ...mockState,
        quotesRefreshCount: 5,
        quotesLastFetched: Date.now() - 40000, // 40 seconds ago
      } as unknown as BridgeAppState;

      const result = selectIsQuoteExpired(
        stateWithOldQuote,
        mockClientParams,
        Date.now(),
      );
      expect(result).toBe(true);
    });

    it('should handle chain-specific quote refresh rate', () => {
      const stateWithOldQuote = {
        ...mockState,
        quotesRefreshCount: 5,
        quotesLastFetched: Date.now() - 40000, // 40 seconds ago
        remoteFeatureFlags: {
          bridgeConfig: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(mockState.remoteFeatureFlags.bridgeConfig as any),
            chainRanking: [],
            chains: {
              '1': {
                refreshRate: 41000,
                isActiveSrc: true,
                isActiveDest: true,
              },
            },
          },
        },
      } as unknown as BridgeAppState;

      const result = selectIsQuoteExpired(
        stateWithOldQuote,
        mockClientParams,
        Date.now(),
      );
      expect(result).toBe(false);
    });

    it('should handle quote expiration when srcChainId is unset', () => {
      const stateWithOldQuote = {
        ...mockState,
        quoteRequest: [
          {
            ...mockState.quoteRequest[0],
            srcChainId: undefined,
          },
        ],
        quotesRefreshCount: 5,
        quotesLastFetched: Date.now() - 40000, // 40 seconds ago
        remoteFeatureFlags: {
          bridgeConfig: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(mockState.remoteFeatureFlags.bridgeConfig as any),
            chainRanking: [],
            chains: {
              '1': {
                refreshRate: 41000,
                isActiveSrc: true,
                isActiveDest: true,
              },
            },
          },
        },
      } as unknown as BridgeAppState;

      const result = selectIsQuoteExpired(
        stateWithOldQuote,
        mockClientParams,
        Date.now(),
      );
      expect(result).toBe(true);
    });
  });

  describe('selectBridgeQuotes', () => {
    const getMockState = (
      chainId: ChainId,
      quoteOverrides?: Partial<QuoteResponseV1 & NonEvmFees>,
      stateOverrides?: Partial<BridgeAppState>,
    ): BridgeAppState => {
      const decChainId = formatChainIdToDec(chainId);

      const mockQuote = {
        quote: {
          requestId: '123',
          srcChainId: decChainId,
          destChainId: 137,
          srcTokenAmount: '1000000000000000000',
          destTokenAmount: '2000000000000000000',
          minDestTokenAmount: '1800000000000000000',
          srcAsset: {
            chainId: decChainId,
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetId: getNativeAssetForChainId(chainId).assetId.toLowerCase(),
            symbol: 'ETH',
            name: 'Ethereum',
          },
          destAsset: {
            chainId: 137,
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetId: getNativeAssetForChainId(137).assetId.toLowerCase(),
            symbol: 'POL',
            name: 'Polygon',
          },
          bridges: ['bridge1'],
          bridgeId: 'bridge1',
          steps: [],
          feeData: {
            metabridge: {
              amount: '100000000000000000',
              asset: {
                chainId: decChainId,
                address: '0x0000000000000000000000000000000000000000',
                decimals: 18,
                symbol: 'ETH',
                name: 'Ethereum',
                assetId:
                  getNativeAssetForChainId(chainId).assetId.toLowerCase(),
              },
            },
          },
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: 24000,
          effectiveGas: 21000,
          chainId: decChainId,
          from: '0x0000000000000000000000000000000000000000',
          to: '0x0000000000000000000000000000000000000000',
          data: '0x0',
        },
        approval: {
          gasLimit: 49000,
          effectiveGas: 46000,
          chainId: decChainId,
          from: '0x0000000000000000000000000000000000000000',
          to: '0x0000000000000000000000000000000000000000',
          data: '0x0',
          value: '0x0',
        },
      };

      return {
        quotes: [
          merge({}, mockQuote, quoteOverrides),
          merge(
            {},
            {
              ...mockQuote,
              quote: {
                ...mockQuote.quote,
                requestId: '456',
                destTokenAmount: '2100000000000000000',
              },
            },
            quoteOverrides,
          ),
        ],
        quoteRequest: [
          {
            srcChainId: quoteOverrides?.quote?.srcAsset?.chainId ?? decChainId,
            destChainId: quoteOverrides?.quote?.destAsset?.chainId ?? 137,
            srcTokenAddress:
              quoteOverrides?.quote?.srcAsset?.address ??
              '0x0000000000000000000000000000000000000000',
            destTokenAddress:
              quoteOverrides?.quote?.destAsset?.address ??
              '0x0000000000000000000000000000000000000000',
            insufficientBal: false,
          },
        ],
        ...merge(
          {},
          {
            quotesLastFetched: Date.now(),
            quotesLoadingStatus: RequestStatus.FETCHED,
            quoteFetchError: null,
            quotesRefreshCount: 0,
            quotesInitialLoadTime: Date.now(),
            remoteFeatureFlags: {
              bridgeConfig: {
                minimumVersion: '0.0.0',
                maxRefreshCount: 5,
                refreshRate: 30000,
                chainRanking: [],
                chains: {},
                support: true,
              },
            },
            assetExchangeRates: {},
            currencyRates: {
              [getNativeAssetForChainId(chainId).symbol]: {
                conversionRate: 1800,
                usdConversionRate: 1800,
              },
            },
            marketData: {},
            conversionRates: {},
            participateInMetaMetrics: true,
            gasFeeEstimatesByChainId: {
              [formatChainIdToHex(decChainId)]: {
                gasFeeEstimates: {
                  estimatedBaseFee: '0',
                  medium: {
                    suggestedMaxPriorityFeePerGas: '.1',
                    suggestedMaxFeePerGas: '.1',
                  },
                  high: {
                    suggestedMaxPriorityFeePerGas: '.1',
                    suggestedMaxFeePerGas: '.2',
                  },
                },
              },
            },
          },
          stateOverrides,
        ),
      } as unknown as BridgeAppState;
    };

    const mockClientParams = {
      sortOrder: SortOrder.COST_ASC,
      selectedQuote: null,
    };

    it('should return sorted quotes with metadata', () => {
      const mockState = getMockState(1);
      const mockQuote = mockState.quotes[0];
      const { quotesInitialLoadTimeMs, quotesLastFetchedMs, ...result } =
        selectBridgeQuotes(
          {
            ...mockState,
            assetExchangeRates: {
              [mockQuote.quote.srcAsset.assetId.toLowerCase() ??
              formatAddressToAssetId(
                mockQuote.quote.srcAsset.address,
                mockQuote.quote.srcChainId,
              ) ??
              '']: {
                exchangeRate: '1980',
                usdExchangeRate: '10',
              },
              [mockQuote.quote.destAsset.assetId.toLowerCase() ??
              formatAddressToAssetId(
                mockQuote.quote.destAsset.address,
                mockQuote.quote.destChainId,
              ) ??
              '']: {
                exchangeRate: '200',
                usdExchangeRate: '1',
              },
            },
          },
          mockClientParams,
        );

      const expectedQuoteMetadata = {
        adjustedReturn: {
          usd: '2.099927',
          valueInCurrency: '419.985546',
        },
        cost: {
          usd: '8.900073',
          valueInCurrency: '1758.014454',
        },
        gasFee: {
          total: {
            amount: '0.0000073',
            usd: '0.000073',
            valueInCurrency: '0.014454',
          },
        },
        minToTokenAmount: {
          amount: '1.8',
          usd: '1.8',
          valueInCurrency: '360',
        },
        priceImpact: {
          usd: '8.9',
          valueInCurrency: '1758',
        },
        sentAmount: {
          amount: '1.1',
          usd: '11',
          valueInCurrency: '2178',
        },
        swapRate: '1.90909090909090909091',
        toTokenAmount: {
          amount: '2.1',
          usd: '2.1',
          valueInCurrency: '420',
        },
        totalNetworkFee: {
          amount: '0.0000073',
          usd: '0.000073',
          valueInCurrency: '0.014454',
        },
      };

      const quoteResponseV1 = mergeQuoteMetadata(
        mockState.quotes[1],
        expectedQuoteMetadata,
      );
      validateQuoteResponseV1(quoteResponseV1);

      expect(result.sortedQuotes[0]).toStrictEqual(quoteResponseV1);
      expect(result.sortedQuotes[0].cost?.valueInCurrency).toBe('1758.014454');
    });

    it('should return sorted quotes with metadata (no assetId)', () => {
      const mockState = getMockState(1, {
        quote: {
          srcAsset: {
            chainId: 1,
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetId: null,
            symbol: 'ETH',
            name: 'Ethereum',
          },
        } as never,
      });
      const mockQuote = mockState.quotes[0];
      const { quotesInitialLoadTimeMs, quotesLastFetchedMs, ...result } =
        selectBridgeQuotes(
          {
            ...mockState,
            assetExchangeRates: {
              [formatAddressToAssetId(
                mockQuote.quote.srcAsset.address,
                mockQuote.quote.srcChainId,
              ) ?? '']: {
                exchangeRate: '1980',
                usdExchangeRate: '10',
              },
              [formatAddressToAssetId(
                mockQuote.quote.destAsset.address,
                mockQuote.quote.destChainId,
              ) ?? '']: {
                exchangeRate: '200',
                usdExchangeRate: '1',
              },
            },
          },
          mockClientParams,
        );

      const quoteResponseV1 = {
        ...mockState.quotes[1],
      };

      expect(result.sortedQuotes[0]).toStrictEqual(
        expect.objectContaining(quoteResponseV1),
      );
      expect(result.sortedQuotes[0].cost?.valueInCurrency).toBeUndefined();
    });

    it('should return metadata when quotes are empty', () => {
      const mockState = getMockState(1);
      const mockQuote = mockState.quotes[0];
      const { quotesInitialLoadTimeMs, quotesLastFetchedMs, ...result } =
        selectBridgeQuotes(
          {
            ...mockState,
            quotes: [],
            assetExchangeRates: {
              [formatAddressToAssetId(
                mockQuote.quote.srcAsset.address,
                mockQuote.quote.srcChainId,
              ) ?? '']: {
                exchangeRate: '1980',
                usdExchangeRate: '10',
              },
              [formatAddressToAssetId(
                mockQuote.quote.destAsset.address,
                mockQuote.quote.destChainId,
              ) ?? '']: {
                exchangeRate: '200',
                usdExchangeRate: '1',
              },
            },
          },
          mockClientParams,
        );

      expect(result).toMatchInlineSnapshot(`
        {
          "activeQuote": null,
          "isLoading": false,
          "isQuoteGoingToRefresh": true,
          "quoteFetchError": null,
          "quotesRefreshCount": 0,
          "recommendedQuote": null,
          "sortedQuotes": [],
        }
      `);
      expect(result.sortedQuotes).toHaveLength(0);
    });

    it('should use destTokenAmount to sort quotes if exchange rate is not available', () => {
      const mockState = getMockState(1);
      const { quotesInitialLoadTimeMs, quotesLastFetchedMs, ...result } =
        selectBridgeQuotes(
          { ...mockState, assetExchangeRates: {}, marketData: {} },
          mockClientParams,
        );

      const expectedQuoteMetadata = {
        adjustedReturn: {
          usd: undefined,
          valueInCurrency: undefined,
        },
        cost: {
          usd: undefined,
          valueInCurrency: undefined,
        },
        gasFee: {
          total: {
            amount: '0.0000073',
            usd: '0.01314',
            valueInCurrency: '0.01314',
          },
        },
        minToTokenAmount: {
          amount: '1.8',
          usd: undefined,
          valueInCurrency: undefined,
        },
        sentAmount: {
          amount: '1.1',
          usd: '1980',
          valueInCurrency: '1980',
        },
        swapRate: '1.90909090909090909091',
        toTokenAmount: {
          amount: '2.1',
          usd: undefined,
          valueInCurrency: undefined,
        },
        totalNetworkFee: {
          amount: '0.0000073',
          usd: '0.01314',
          valueInCurrency: '0.01314',
        },
      };

      const expectedQuoteV2 = mockState.quotes[1];
      expect(result.sortedQuotes[0]).toStrictEqual(
        mergeQuoteMetadata(expectedQuoteV2, expectedQuoteMetadata),
      );
      expect(result.sortedQuotes[0]?.cost?.valueInCurrency).toBeUndefined();
      expect(result.recommendedQuote?.toTokenAmount?.amount).toBe('2.1');
    });

    it('should use priceImpact to sort quotes if exchange rate is not available', () => {
      const mockState = getMockState(1);
      const quotesWithPriceImpact = [
        {
          ...mockState.quotes[0],
          quote: {
            ...mockState.quotes[0].quote,
            priceData: { priceImpact: '0.01' },
          },
        },
        {
          ...mockState.quotes[1],
          quote: {
            ...mockState.quotes[1].quote,
            priceData: { priceImpact: '-0.02' },
          },
        },
      ];
      const { quotesInitialLoadTimeMs, quotesLastFetchedMs, ...result } =
        selectBridgeQuotes(
          {
            ...mockState,
            assetExchangeRates: {},
            marketData: {},
            quotes: quotesWithPriceImpact,
          },
          mockClientParams,
        );

      const expectedQuoteMetadata = {
        adjustedReturn: {
          usd: undefined,
          valueInCurrency: undefined,
        },
        cost: {
          usd: undefined,
          valueInCurrency: undefined,
        },
        minToTokenAmount: {
          amount: '1.8',
          usd: undefined,
          valueInCurrency: undefined,
        },
        sentAmount: {
          amount: '1.1',
          usd: '1980',
          valueInCurrency: '1980',
        },
        swapRate: '1.90909090909090909091',
        toTokenAmount: {
          amount: '2.1',
          usd: undefined,
          valueInCurrency: undefined,
        },
        totalNetworkFee: {
          amount: '0.0000073',
          usd: '0.01314',
          valueInCurrency: '0.01314',
        },
        gasFee: {
          total: {
            amount: '0.0000073',
            usd: '0.01314',
            valueInCurrency: '0.01314',
          },
        },
      };

      const expectedQuoteV2 = quotesWithPriceImpact[1];

      expect(result.sortedQuotes[0].cost?.valueInCurrency).toBeUndefined();
      expect(result.recommendedQuote).toStrictEqual(
        mergeQuoteMetadata(expectedQuoteV2, expectedQuoteMetadata),
      );
      expect(result.recommendedQuote?.quote.priceData?.priceImpact).toBe(
        '-0.02',
      );
    });

    describe('returns swap metadata', () => {
      const getMockSwapState = (
        srcAsset: BridgeAsset,
        destAsset: BridgeAsset,
        txFee?: {
          amount: string;
          asset: BridgeAsset;
        },
        gasIncluded7702?: boolean,
        gasEstimatesChainId?: number,
      ): BridgeAppState => {
        const srcTokenAddress = formatAddressToCaipReference(srcAsset.assetId);
        const destTokenAddress = formatAddressToCaipReference(
          destAsset.assetId,
        );

        const { chainId: caipChainId } = parseCaipAssetType(srcAsset.assetId);
        const chainId = formatChainIdToDec(caipChainId);
        const hexChainId = formatChainIdToHex(chainId);
        const nativeAsset = getNativeAssetForChainId(chainId);
        const currencyRates = {
          [nativeAsset.symbol]: {
            conversionRate: 551.98,
            usdConversionRate: 645.12,
            conversionDate: Date.now(),
          },
        };
        const marketData = {
          [hexChainId]: {
            [destTokenAddress]: {
              price: '0.0015498387253001357',
              currency: nativeAsset.symbol,
            },
            [srcTokenAddress]: {
              price: '1',
              currency: nativeAsset.symbol,
            },
            '0x0000000000000000000000000000000000000000': {
              price: '1',
              currency: nativeAsset.symbol,
            },
            '0x0000000000000000000000000000000000000001': {
              price: '1.5498387253001357',
              currency: nativeAsset.symbol,
            },
          },
        } as unknown as Record<string, Record<string, MarketDataDetails>>;

        const srcTokenAmount = new BigNumber('10') // $10 worth of src token
          .dividedBy(marketData[hexChainId][srcTokenAddress].price)
          .dividedBy(currencyRates[nativeAsset.symbol].conversionRate)
          .multipliedBy(10 ** srcAsset.decimals)
          .toFixed(0);

        const quoteResponse = {
          quoteId: '123',
          quote: {
            walletAddress: '0x0000000000000000000000000000000000000000',
            destWalletAddress: '0x0000000000000000000000000000000000000000',
            bridgeId: 'uniswap',
            bridges: ['uniswap'],
            steps: [],
            requestId: '123',
            srcChainId: chainId,
            destChainId: chainId,
            srcAsset: {
              ...srcAsset,
              address: srcTokenAddress,
              chainId,
            },
            destAsset: {
              ...destAsset,
              address: destTokenAddress,
              chainId,
            },
            priceData: {
              priceImpact: '-0.11',
            },
            feeData: {
              metabridge: {
                amount: '0',
                asset: {
                  address: srcTokenAddress,
                  decimals: srcAsset.decimals,
                  assetId: srcAsset.assetId,
                  chainId,
                  symbol: srcAsset.symbol,
                  name: srcAsset.name,
                },
              },
              ...(txFee
                ? {
                    txFee: {
                      ...txFee,
                      maxFeePerGas: '2616919731',
                      maxPriorityFeePerGas: '2100000004',
                      asset: {
                        ...txFee?.asset,
                        address: formatAddressToCaipReference(
                          txFee?.asset?.assetId,
                        ),
                        chainId: formatChainIdToDec(
                          parseCaipAssetType(txFee?.asset?.assetId).chainId,
                        ),
                      },
                    },
                  }
                : {}),
            },
            gasIncluded: Boolean(txFee) && !gasIncluded7702,
            gasIncluded7702: Boolean(gasIncluded7702),
            srcTokenAmount,
            destTokenAmount: new BigNumber('9')
              .dividedBy(marketData[hexChainId][destTokenAddress].price)
              .dividedBy(currencyRates[nativeAsset.symbol].conversionRate)
              .multipliedBy(10 ** destAsset.decimals)
              .toFixed(0),
            minDestTokenAmount: new BigNumber('9')
              .dividedBy(marketData[hexChainId][destTokenAddress].price)
              .dividedBy(currencyRates[nativeAsset.symbol].conversionRate)
              .multipliedBy(10 ** destAsset.decimals)
              .multipliedBy(0.95) // 5% slippage
              .toFixed(0),
          },
          estimatedProcessingTimeInSeconds: 300,
          approval: {
            chainId,
            from: '0x0000000000000000000000000000000000000000',
            to: '0x0000000000000000000000000000000000000000',
            value: '0x0',
            data: '0x0',
            gasLimit: 21211,
          },
          trade: {
            chainId,
            from: '0x0000000000000000000000000000000000000000',
            to: '0x0000000000000000000000000000000000000000',
            data: '0x0',
            gasLimit: 59659,
            value: isNativeAddress(srcTokenAddress)
              ? toHex(
                  new BigNumber(srcTokenAmount)
                    .plus(txFee?.amount ?? '0')
                    .toString(),
                )
              : '0x0',
          },
        };
        validateQuoteResponseV1(quoteResponse);
        const mockState = getMockState(gasEstimatesChainId ?? chainId);

        return {
          ...mockState,
          quotes: [quoteResponse as QuoteResponseV1],
          currencyRates,
          marketData,
          quoteRequest: [
            {
              ...mockState.quoteRequest,
              srcChainId: chainId,
              destChainId: chainId,
              srcTokenAddress,
              destTokenAddress,
            },
          ],
        };
      };

      it('for native -> erc20', () => {
        const srcAsset = {
          decimals: 18,
          assetId: getNativeAssetForChainId(1).assetId,
          symbol: 'ETH',
          name: 'Ethereum',
          address: '0x0000000000000000000000000000000000000000',
          chainId: 1,
        };
        const destAsset = {
          decimals: 18,
          assetId:
            'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as const,
          symbol: 'USDC',
          name: 'USD Coin',
          address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          chainId: 1,
        };

        const newState = getMockSwapState(srcAsset, destAsset);

        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const expectedQuoteMetadata = {
          adjustedReturn: {
            usd: '10.513424894341876155230359150867612640256',
            valueInCurrency: '8.995536137740000000254299423511757231474',
          },
          cost: {
            usd: '1.173955083193541475489640849132387359744',
            valueInCurrency: '1.004463862259999726625700576488242768526',
          },
          gasFee: {
            total: {
              amount: '0.000008087',
              usd: '0.00521708544',
              valueInCurrency: '0.00446386226',
            },
          },
          minToTokenAmount: {
            amount: '9.994389353314869106',
            usd: '9.992709880792782347418849595400950831104',
            valueInCurrency: '8.550000000000000000198810453356610924716',
          },
          sentAmount: {
            amount: '0.018116598427479256',
            usd: '11.68737997753541763072',
            valueInCurrency: '9.99999999999999972688',
          },
          swapRate: '580.70558265713069471891',
          toTokenAmount: {
            amount: '10.520409845594599059',
            usd: '10.518641979781876155230359150867612640256',
            valueInCurrency: '9.000000000000000000254299423511757231474',
          },
          totalNetworkFee: {
            amount: '0.000008087',
            usd: '0.00521708544',
            valueInCurrency: '0.00446386226',
          },
          priceImpact: {
            usd: '1.168737997753541475489640849132387359744',
            valueInCurrency: '0.999999999999999726625700576488242768526',
          },
        };

        expect(sortedQuotes[0]).toStrictEqual(
          mergeQuoteMetadata(newState.quotes[0], expectedQuoteMetadata),
        );
      });

      it('erc20 -> native', () => {
        const newState = getMockSwapState(
          {
            symbol: 'USDC',
            name: 'USD Coin',
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            decimals: 18,
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            chainId: 1,
          },
          {
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            name: 'Ethereum',
            address: '0x0000000000000000000000000000000000000000',
            chainId: 1,
          },
        );

        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const expectedQuoteMetadata = {
          priceImpact: {
            usd: '1.168737997753541376',
            valueInCurrency: '0.9999999999999996415',
          },
          adjustedReturn: {
            usd: '10.51342489434187625472',
            valueInCurrency: '8.99553613774000008538',
          },
          cost: {
            usd: '1.173955083193541376',
            valueInCurrency: '1.0044638622599996415',
          },
          minToTokenAmount: {
            amount: '0.015489691655494764',
            usd: '9.99270988079278215168',
            valueInCurrency: '8.54999999999999983272',
          },
          sentAmount: {
            amount: '0.018116598427479256',
            usd: '11.68737997753541763072',
            valueInCurrency: '9.99999999999999972688',
          },
          swapRate: '0.90000000000000003312',
          toTokenAmount: {
            amount: '0.016304938584731331',
            usd: '10.51864197978187625472',
            valueInCurrency: '9.00000000000000008538',
          },
          totalNetworkFee: {
            amount: '0.000008087',
            usd: '0.00521708544',
            valueInCurrency: '0.00446386226',
          },
          gasFee: {
            total: {
              amount: '0.000008087',
              usd: '0.00521708544',
              valueInCurrency: '0.00446386226',
            },
          },
        };

        const quoteResponseV2 = newState.quotes[0];
        expect(sortedQuotes[0]).toStrictEqual(
          mergeQuoteMetadata(quoteResponseV2, expectedQuoteMetadata),
        );
      });

      it('erc20 -> native but gas estimates are not available', () => {
        const newState = getMockSwapState(
          {
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            symbol: 'USDC',
            name: 'USD Coin',
            chainId: 1,
          },
          {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            name: 'Ethereum',
            chainId: 1,
          },
          undefined,
          undefined,
          10,
        );

        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const expectedQuoteMetadata = {
          adjustedReturn: {
            usd: '10.51864197978187625472',
            valueInCurrency: '9.00000000000000008538',
          },
          cost: {
            usd: '1.168737997753541376',
            valueInCurrency: '0.9999999999999996415',
          },
          priceImpact: {
            usd: '1.168737997753541376',
            valueInCurrency: '0.9999999999999996415',
          },
          minToTokenAmount: {
            amount: '0.015489691655494764',
            usd: '9.99270988079278215168',
            valueInCurrency: '8.54999999999999983272',
          },
          sentAmount: {
            amount: '0.018116598427479256',
            usd: '11.68737997753541763072',
            valueInCurrency: '9.99999999999999972688',
          },
          gasFee: {
            total: {
              amount: '0',
              usd: '0',
              valueInCurrency: '0',
            },
          },
          swapRate: '0.90000000000000003312',
          toTokenAmount: {
            amount: '0.016304938584731331',
            usd: '10.51864197978187625472',
            valueInCurrency: '9.00000000000000008538',
          },
          totalNetworkFee: {
            amount: '0',
            usd: '0',
            valueInCurrency: '0',
          },
        };

        const quoteResponseV2 = newState.quotes[0];
        expect(sortedQuotes[0]).toStrictEqual(
          mergeQuoteMetadata(quoteResponseV2, expectedQuoteMetadata),
        );
      });

      it('when gas is included and is taken from dest token', () => {
        const newState = getMockSwapState(
          {
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            symbol: 'USDC',
            name: 'USD Coin',
            chainId: 1,
          },
          {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            name: 'Ethereum',
            chainId: 1,
          },
          {
            amount: '1000000000000000',
            asset: {
              address: '0x0000000000000000000000000000000000000000',
              decimals: 18,
              assetId:
                'eip155:1/erc20:0x0000000000000000000000000000000000000000',
              symbol: 'ETH',
              name: 'Ethereum',
              chainId: 1,
            },
          },
        );

        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const expectedQuoteMetadata = {
          adjustedReturn: {
            usd: '10.51864197978187625472',
            valueInCurrency: '9.00000000000000008538',
          },
          cost: {
            usd: '1.168737997753541376',
            valueInCurrency: '0.9999999999999996415',
          },
          gasFee: {
            total: {
              amount: '0.000008087',
              usd: '0.00521708544',
              valueInCurrency: '0.00446386226',
            },
          },
          includedTxFees: {
            amount: '0.001',
            usd: '0.64512',
            valueInCurrency: '0.55198',
          },
          priceImpact: {
            usd: '1.168737997753541376',
            valueInCurrency: '0.9999999999999996415',
          },
          minToTokenAmount: {
            amount: '0.015489691655494764',
            usd: '9.99270988079278215168',
            valueInCurrency: '8.54999999999999983272',
          },
          sentAmount: {
            amount: '0.018116598427479256',
            usd: '11.68737997753541763072',
            valueInCurrency: '9.99999999999999972688',
          },
          swapRate: '0.90000000000000003312',
          toTokenAmount: {
            amount: '0.016304938584731331',
            usd: '10.51864197978187625472',
            valueInCurrency: '9.00000000000000008538',
          },
          totalNetworkFee: {
            amount: '0.000008087',
            usd: '0.00521708544',
            valueInCurrency: '0.00446386226',
          },
        };

        const quoteResponseV2 = newState.quotes[0];
        expect(sortedQuotes[0]).toStrictEqual(
          mergeQuoteMetadata(quoteResponseV2, expectedQuoteMetadata),
        );
      });

      it('when gas is included and is taken from src token', () => {
        const state = getMockSwapState(
          {
            symbol: 'USDC',
            name: 'USD Coin',
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            decimals: 6,
            chainId: 1,
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          },
          {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetId: 'eip155:1/slip44:60',
            symbol: 'ETH',
            name: 'Ethereum',
            chainId: 1,
          },
          {
            amount: '3000000',
            asset: {
              address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
              decimals: 6,
              assetId:
                'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
              symbol: 'ETH',
              name: 'Ethereum',
              chainId: 1,
            },
          },
        );

        const newState = {
          ...state,
          quotes: state.quotes.map((quote, index) => ({
            ...quote,
            quote: {
              ...quote.quote,
              feeData: {
                ...quote.quote.feeData,
                txFee: {
                  amount: `${(3 + index) * 1000000}`,
                  asset: quote.quote.srcAsset,
                  maxFeePerGas: '1000000000000000000',
                  maxPriorityFeePerGas: '1000000000000000000',
                },
              },
            },
          })),
        };
        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const expectedQuoteMetadata = {
          adjustedReturn: {
            usd: '10.51342489434187625472',
            valueInCurrency: '8.99553613774000008538',
          },
          cost: {
            usd: '1936.53421414565812374528',
            valueInCurrency: '1656.94468552225999991462',
          },
          gasFee: {
            total: {
              amount: '0.000008087',
              usd: '0.00521708544',
              valueInCurrency: '0.00446386226',
            },
          },
          includedTxFees: {
            amount: '3',
            usd: '1935.36',
            valueInCurrency: '1655.94',
          },
          minToTokenAmount: {
            amount: '0.015489691655494764',
            usd: '9.99270988079278215168',
            valueInCurrency: '8.54999999999999983272',
          },
          sentAmount: {
            amount: '3.018117',
            usd: '1947.04763904',
            valueInCurrency: '1665.94022166',
          },
          priceImpact: {
            usd: '1936.52899706021812374528',
            valueInCurrency: '1656.94022165999999991462',
          },
          swapRate: '0.00540235470816119156',
          toTokenAmount: {
            amount: '0.016304938584731331',
            usd: '10.51864197978187625472',
            valueInCurrency: '9.00000000000000008538',
          },
          totalNetworkFee: {
            amount: '0.000008087',
            usd: '0.00521708544',
            valueInCurrency: '0.00446386226',
          },
        };

        expect(sortedQuotes[0].quote.feeData.txFee).toStrictEqual({
          amount: '3000000',
          asset: {
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            chainId: 1,
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC',
          },
          maxFeePerGas: '1000000000000000000',
          maxPriorityFeePerGas: '1000000000000000000',
        });
        expect(sortedQuotes[0].sentAmount?.amount).toBe('3.018117');
        const expectedQuoteV2 = mergeQuoteMetadata(
          newState.quotes[0],
          expectedQuoteMetadata,
        );
        expect(sortedQuotes[0]).toStrictEqual(expectedQuoteV2);
      });

      it('when gasIncluded7702=true and is taken from dest token', () => {
        const newState = getMockSwapState(
          {
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            symbol: 'USDC',
            name: 'USD Coin',
            chainId: 1,
          },
          {
            address: '0x0000000000000000000000000000000000000001',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000001',
            symbol: 'WETH',
            name: 'Ethereum',
            chainId: 1,
          },
          {
            amount: '1000000000000000000',
            asset: {
              decimals: 18,
              assetId:
                'eip155:1/erc20:0x0000000000000000000000000000000000000001',
              symbol: 'WETH',
              name: 'Ethereum',
              chainId: 1,
              address: '0x0000000000000000000000000000000000000001',
            },
          },
          true,
        );

        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const expectedQuoteMetadata = {
          adjustedReturn: {
            usd: '10.518641979781876096240273601395823616',
            valueInCurrency: '8.999999999999999949780980627632791914',
          },
          cost: {
            usd: '1.168737997753541534479726398604176384',
            valueInCurrency: '0.999999999999999777099019372367208086',
          },
          gasFee: {
            total: {
              amount: '0.000008087',
              usd: '0.00521708544',
              valueInCurrency: '0.00446386226',
            },
          },
          priceImpact: {
            usd: '1.168737997753541534479726398604176384',
            valueInCurrency: '0.999999999999999777099019372367208086',
          },
          includedTxFees: {
            amount: '1',
            usd: '999.831958465623542784',
            valueInCurrency: '855.479979591168903686',
          },
          minToTokenAmount: {
            amount: '0.009994389353314869',
            usd: '9.992709880792782241436661998044855296',
            valueInCurrency: '8.549999999999999909517932616692707134',
          },
          sentAmount: {
            amount: '0.018116598427479256',
            usd: '11.68737997753541763072',
            valueInCurrency: '9.99999999999999972688',
          },
          swapRate: '0.58070558265713069146',
          toTokenAmount: {
            amount: '0.010520409845594599',
            usd: '10.518641979781876096240273601395823616',
            valueInCurrency: '8.999999999999999949780980627632791914',
          },
          totalNetworkFee: {
            amount: '0.000008087',
            usd: '0.00521708544',
            valueInCurrency: '0.00446386226',
          },
        };

        const quoteResponseV2 = newState.quotes[0];
        expect(sortedQuotes[0]).toStrictEqual(
          mergeQuoteMetadata(quoteResponseV2, expectedQuoteMetadata),
        );
      });
    });

    it('should only fetch quotes once if balance is insufficient', () => {
      const mockState = getMockState(1);
      const result = selectBridgeQuotes(
        {
          ...mockState,
          quoteRequest: [
            { ...mockState.quoteRequest[0], insufficientBal: true },
          ],
        },
        mockClientParams,
      );

      expect(result.sortedQuotes).toHaveLength(2);
      expect(result.recommendedQuote).toBeDefined();
      expect(result.activeQuote).toBeDefined();
      expect(result.isLoading).toBe(false);
      expect(result.quoteFetchError).toBeNull();
      expect(result.isQuoteGoingToRefresh).toBe(false);
    });

    it('should handle different sort orders', () => {
      const mockState = getMockState(1);
      const resultCostAsc = selectBridgeQuotes(mockState, {
        ...mockClientParams,
        sortOrder: SortOrder.COST_ASC,
      });
      const resultEtaAsc = selectBridgeQuotes(mockState, {
        ...mockClientParams,
        sortOrder: SortOrder.ETA_ASC,
      });

      expect(resultCostAsc.sortedQuotes.map((quote) => quote.quote.requestId))
        .toMatchInlineSnapshot(`
        [
          "456",
          "123",
        ]
      `);
      expect(resultEtaAsc.sortedQuotes.map((quote) => quote.quote.requestId))
        .toMatchInlineSnapshot(`
        [
          "123",
          "456",
        ]
      `);
    });

    it('should handle selected quote', () => {
      const mockState = getMockState(1);
      const selectedQuote = {
        ...mockState.quotes[0],
        quote: { ...mockState.quotes[0].quote, requestId: '123' },
      };

      const result = selectBridgeQuotes(mockState, {
        ...mockClientParams,
        selectedQuote,
      });

      const recommendedQuoteV2 = mergeQuoteMetadata(mockState.quotes[1], {
        minToTokenAmount: {
          amount: '1.8',
          usd: undefined,
          valueInCurrency: undefined,
        },
        sentAmount: {
          amount: '1.1',
          usd: '1980',
          valueInCurrency: '1980',
        },
        toTokenAmount: {
          amount: '2.1',
          usd: undefined,
          valueInCurrency: undefined,
        },
        swapRate: '1.90909090909090909091',
        cost: {
          usd: undefined,
          valueInCurrency: undefined,
        },
        adjustedReturn: {
          usd: undefined,
          valueInCurrency: undefined,
        },
        totalNetworkFee: {
          amount: '0.0000073',
          usd: '0.01314',
          valueInCurrency: '0.01314',
        },
        gasFee: {
          total: {
            amount: '0.0000073',
            usd: '0.01314',
            valueInCurrency: '0.01314',
          },
        },
      });
      expect(result.recommendedQuote).toStrictEqual(recommendedQuoteV2);
      expect(result.recommendedQuote).not.toStrictEqual(selectedQuote);
      expect(result.activeQuote?.quote.requestId).toStrictEqual(
        selectedQuote.quote.requestId,
      );
    });

    it('should set recommendedQuote as activeQuote when selected quote is not found', () => {
      const mockState = getMockState(1);
      const selectedQuote = {
        ...mockState.quotes[0],
        quote: { ...mockState.quotes[0].quote, requestId: 'abc' },
      } as never;

      const result = selectBridgeQuotes(mockState, {
        ...mockClientParams,
        selectedQuote,
      });

      const expectedQuote = mergeQuoteMetadata(mockState.quotes[1], {
        minToTokenAmount: {
          amount: '1.8',
          usd: undefined,
          valueInCurrency: undefined,
        },
        sentAmount: {
          amount: '1.1',
          usd: '1980',
          valueInCurrency: '1980',
        },
        toTokenAmount: {
          amount: '2.1',
          usd: undefined,
          valueInCurrency: undefined,
        },
        swapRate: '1.90909090909090909091',
        cost: {
          usd: undefined,
          valueInCurrency: undefined,
        },
        adjustedReturn: {
          usd: undefined,
          valueInCurrency: undefined,
        },
        totalNetworkFee: {
          amount: '0.0000073',
          usd: '0.01314',
          valueInCurrency: '0.01314',
        },
        gasFee: {
          total: {
            amount: '0.0000073',
            usd: '0.01314',
            valueInCurrency: '0.01314',
          },
        },
      });
      expect(result.recommendedQuote).toStrictEqual(expectedQuote);
      expect(result.activeQuote).toStrictEqual(result.recommendedQuote);
    });

    it('should handle quote refresh state', () => {
      const mockState = getMockState(1);
      const stateWithMaxRefresh = {
        ...mockState,
        quotesRefreshCount: 5,
      } as unknown as BridgeAppState;

      const result = selectBridgeQuotes(stateWithMaxRefresh, mockClientParams);
      expect(result.isQuoteGoingToRefresh).toBe(false);
    });

    it('should handle loading state', () => {
      const mockState = getMockState(1);
      const loadingState = {
        ...mockState,
        quotesLoadingStatus: RequestStatus.LOADING,
      } as unknown as BridgeAppState;

      const result = selectBridgeQuotes(loadingState, mockClientParams);
      expect(result.isLoading).toBe(true);
    });

    it('should handle error state', () => {
      const mockState = getMockState(1);
      const errorState = {
        ...mockState,
        quoteFetchError: new Error('Test error'),
        quotesLoadingStatus: RequestStatus.ERROR,
      } as unknown as BridgeAppState;

      const result = selectBridgeQuotes(errorState, mockClientParams);
      expect(result.quoteFetchError).toBeDefined();
    });

    it('should handle Solana quotes', () => {
      const solanaState = getMockState(
        ChainId.SOLANA,
        {
          nonEvmFeesInNative: '5000',
          trade: 'SOLANATRADE',
          quote: {
            srcChainId: 1151111081099710,
            srcAsset: {
              address: '0x0000000000000000000000000000000000000000',
              decimals: 9,
              assetId: getNativeAssetForChainId(ChainId.SOLANA).assetId,
              chainId: 1151111081099710,
              symbol: 'SOL',
              name: 'SOL',
            },
            destAsset: {
              address: 'gjslkdfjsljflds',
              decimals: 18,
              assetId:
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:gjslkdfjsljflds',
              chainId: 1151111081099710,
              symbol: 'USDC',
              name: 'USD Coin',
            },
          } as never,
        },
        {
          assetExchangeRates: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
              exchangeRate: '0.5',
              usdExchangeRate: '10',
            },
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:gjslkdfjsljflds': {
              exchangeRate: '50005',
              usdExchangeRate: '100000',
            },
          },
          currencyRates: {
            SOL: {
              conversionDate: Date.now(),
              conversionRate: 100,
              usdConversionRate: 10000,
            },
          },
        },
      );

      const solanaQuote = solanaState.quotes[1];

      const expectedQuoteMetadata = calcQuoteMetadata(solanaQuote, {
        srcTokenExchangeRate: { exchangeRate: '0.5', usdExchangeRate: '10' },
        bridgeFeesPerGas: {
          estimatedBaseFeeInDecGwei: '0',
          feePerGasInDecGwei: '.1',
        },
        destTokenExchangeRate: {
          exchangeRate: '50005',
          usdExchangeRate: '100000',
        },
        nativeExchangeRate: { exchangeRate: '0.5', usdExchangeRate: '10' },
      });
      const expectedQuoteV2 = mergeQuoteMetadata(
        solanaQuote,
        expectedQuoteMetadata,
      );
      expect(expectedQuoteV2?.toTokenAmount?.amount).toBe('2.1');

      const result = selectBridgeQuotes(solanaState, mockClientParams);
      expect(result.sortedQuotes).toHaveLength(2);
      expect(result.recommendedQuote).toStrictEqual(expectedQuoteV2);
    });
  });

  describe('selectBatchSellQuotes', () => {
    const getMockState = (chainId: string): BridgeAppState =>
      ({
        quotes: [
          ...mockBridgeQuotesErc20Erc20V1.map((quote) => ({
            ...quote,
            quoteRequestIndex: 1,
          })),
          ...mockBridgeQuotesNativeErc20V1.map((quote) => ({
            ...quote,
            quoteRequestIndex: 0,
          })),
        ],
        quoteRequest: [
          {
            srcChainId: '10',
            destChainId: '137',
            srcTokenAddress: '0x0000000000000000000000000000000000000000',
            destTokenAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
            insufficientBal: false,
          },
          {
            srcChainId: '10',
            destChainId: '137',
            srcTokenAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            destTokenAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
            insufficientBal: false,
          },
        ],
        quotesLastFetched: Date.now(),
        quotesLoadingStatus: RequestStatus.FETCHED,
        quoteFetchError: null,
        quotesRefreshCount: 0,
        quotesInitialLoadTime: Date.now(),
        remoteFeatureFlags: {
          bridgeConfig: {
            minimumVersion: '0.0.0',
            maxRefreshCount: 5,
            refreshRate: 30000,
            chainRanking: [],
            chains: {},
            support: true,
          },
        },
        assetExchangeRates: {},
        currencyRates: {
          ETH: {
            conversionRate: 1800,
            usdConversionRate: 1800,
          },
        },
        marketData: {},
        conversionRates: {},
        participateInMetaMetrics: true,
        gasFeeEstimatesByChainId: {
          [formatChainIdToHex(chainId)]: {
            gasFeeEstimates: {
              estimatedBaseFee: '0',
              medium: {
                suggestedMaxPriorityFeePerGas: '.1',
                suggestedMaxFeePerGas: '.1',
              },
              high: {
                suggestedMaxPriorityFeePerGas: '.1',
                suggestedMaxFeePerGas: '.2',
              },
            },
          },
        },
      }) as unknown as BridgeAppState;

    const mockState = getMockState('10');

    const mockClientParams = {
      sortOrder: SortOrder.COST_ASC,
      selectedQuote: null,
    };

    it('should return sorted quotes with metadata', () => {
      const { quotesInitialLoadTimeMs, quotesLastFetchedMs, ...result } =
        selectBatchSellQuotes(
          {
            ...mockState,
            currencyRates: {
              ETH: {
                conversionRate: 1800,
                usdConversionRate: 10,
                conversionDate: Date.now(),
              },
            },
            assetExchangeRates: {
              'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85': {
                exchangeRate: '1980',
                usdExchangeRate: '10',
              },
              'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': {
                exchangeRate: '200',
                usdExchangeRate: '1',
              },
            },
          },
          { ...mockClientParams, requestCount: 2 },
        );

      const { totalReceived, minimumReceived, recommendedQuotes, ...rest } =
        result;

      expect(totalReceived).toMatchInlineSnapshot(`
        {
          "amount": "38.423182",
          "usd": "38.423182",
          "valueInCurrency": "7684.6364",
        }
      `);
      expect(minimumReceived).toMatchInlineSnapshot(`
        {
          "amount": "37.6",
          "usd": "37.6",
          "valueInCurrency": "7520",
        }
      `);
      expect(rest).toMatchInlineSnapshot(`
        {
          "isLoading": false,
          "isQuoteGoingToRefresh": true,
          "quoteFetchError": null,
          "quotesRefreshCount": 0,
        }
      `);
      expect(recommendedQuotes.map((quote) => quote?.quote.requestId))
        .toMatchInlineSnapshot(`
        [
          "381c23bc-e3e4-48fe-bc53-257471e388ad",
          "90ae8e69-f03a-4cf6-bab7-ed4e3431eb37",
        ]
      `);
      expect(recommendedQuotes.map((quote) => quote?.sentAmount))
        .toMatchInlineSnapshot(`
        [
          {
            "amount": "0.01",
            "usd": "0.1",
            "valueInCurrency": "18",
          },
          {
            "amount": "14",
            "usd": "140",
            "valueInCurrency": "27720",
          },
        ]
      `);
    });

    it('should return metadata when quotes are empty', () => {
      const { quotesInitialLoadTimeMs, quotesLastFetchedMs, ...result } =
        selectBatchSellQuotes(
          {
            ...mockState,
            quotes: [],
            assetExchangeRates: {
              'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85': {
                exchangeRate: '1980',
                usdExchangeRate: '10',
              },
              'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': {
                exchangeRate: '200',
                usdExchangeRate: '1',
              },
            },
          },
          { ...mockClientParams, requestCount: 2 },
        );

      const { totalReceived, minimumReceived, recommendedQuotes, ...rest } =
        result;

      expect(totalReceived).toMatchInlineSnapshot(`
        {
          "amount": "0",
          "usd": "0",
          "valueInCurrency": "0",
        }
      `);
      expect(minimumReceived).toMatchInlineSnapshot(`
        {
          "amount": "0",
          "usd": "0",
          "valueInCurrency": "0",
        }
      `);
      expect(rest).toMatchInlineSnapshot(`
        {
          "isLoading": false,
          "isQuoteGoingToRefresh": true,
          "quoteFetchError": null,
          "quotesRefreshCount": 0,
        }
      `);
      expect(mockState.quoteRequest).toHaveLength(2);
      expect(recommendedQuotes).toStrictEqual([null, null]);
    });
  });

  describe('selectBatchSellTrades', () => {
    const getMockState = (chainId: string): BridgeAppState =>
      ({
        quotes: [
          ...mockBridgeQuotesErc20Erc20V1.map((quote) => ({
            ...quote,
            quoteRequestIndex: 1,
          })),
          ...mockBridgeQuotesNativeErc20V1.map((quote) => ({
            ...quote,
            quoteRequestIndex: 0,
          })),
        ],
        quoteRequest: [
          {
            srcChainId: '10',
            destChainId: '137',
            srcTokenAddress: '0x0000000000000000000000000000000000000000',
            destTokenAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
            insufficientBal: false,
          },
          {
            srcChainId: '10',
            destChainId: '137',
            srcTokenAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            destTokenAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
            insufficientBal: false,
          },
        ],
        quotesLastFetched: Date.now(),
        quotesLoadingStatus: RequestStatus.FETCHED,
        quoteFetchError: null,
        quotesRefreshCount: 0,
        quotesInitialLoadTime: Date.now(),
        remoteFeatureFlags: {
          bridgeConfig: {
            minimumVersion: '0.0.0',
            maxRefreshCount: 5,
            refreshRate: 30000,
            chainRanking: [],
            chains: {},
            support: true,
          },
        },
        assetExchangeRates: {},
        currencyRates: {
          ETH: {
            conversionRate: 1800,
            usdConversionRate: 1800,
          },
        },
        marketData: {},
        conversionRates: {},
        participateInMetaMetrics: true,
        gasFeeEstimatesByChainId: {
          [formatChainIdToHex(chainId)]: {
            gasFeeEstimates: {
              estimatedBaseFee: '0',
              medium: {
                suggestedMaxPriorityFeePerGas: '.1',
                suggestedMaxFeePerGas: '.1',
              },
              high: {
                suggestedMaxPriorityFeePerGas: '.1',
                suggestedMaxFeePerGas: '.2',
              },
            },
          },
        },
      }) as unknown as BridgeAppState;

    const mockState = getMockState('10');

    const mockBatchSellTrades = {
      transactions: [
        {
          chainId: 137,
          to: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
          from: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
          value: '0x0',
          data: '0x',
          gasLimit: 21000,
          effectiveGas: 21000,
          maxFeePerGas: '0x5d21dba00',
          maxPriorityFeePerGas: '0x5d21dba00',
          type: BatchSellTransactionType.TRANSFER,
        } as const,
      ],
      fee: {
        amount: '10000',
        asset: {
          assetId:
            'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' as const,
          symbol: 'USDC',
          chainId: 137,
          address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
          name: 'USD Coin',
          decimals: 6,
        },
      },
    };

    it('should return total network fee', () => {
      const result = selectBatchSellTrades({
        ...mockState,
        assetExchangeRates: {
          'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85': {
            exchangeRate: '1980',
            usdExchangeRate: '10',
          },
          'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': {
            exchangeRate: '200',
            usdExchangeRate: '5',
          },
        },
        batchSellTradesLoadingStatus: RequestStatus.FETCHED,
        batchSellTrades: mockBatchSellTrades,
      });

      expect(result.totalNetworkFee).toMatchInlineSnapshot(`
        {
          "amount": "0.01",
          "asset": {
            "address": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
            "assetId": "eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
            "chainId": 137,
            "decimals": 6,
            "name": "USD Coin",
            "symbol": "USDC",
          },
          "usd": "0.05",
          "valueInCurrency": "2",
        }
      `);
      expect(result.isBatchSellTradeAvailable).toBe(true);
    });

    it('should return total network fee value when fee asset ID address is lowercase and market data is checksummed', () => {
      const result = selectBatchSellTrades({
        ...mockState,
        currencyRates: {
          ETH: {
            conversionRate: 1,
            usdConversionRate: 1,
            conversionDate: Date.now(),
          },
        },
        marketData: {
          '0x89': {
            [getAddress(mockBatchSellTrades.fee.asset.address)]: {
              price: 1,
              currency: 'ETH',
            } as never,
          },
        },
        batchSellTradesLoadingStatus: RequestStatus.FETCHED,
        batchSellTrades: mockBatchSellTrades,
      } as unknown as BridgeAppState);

      expect(result.totalNetworkFee).toMatchInlineSnapshot(`
        {
          "amount": "0.01",
          "asset": {
            "address": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
            "assetId": "eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
            "chainId": 137,
            "decimals": 6,
            "name": "USD Coin",
            "symbol": "USDC",
          },
          "usd": "0.01",
          "valueInCurrency": "0.01",
        }
      `);
      expect(result.isBatchSellTradeAvailable).toBe(true);
    });

    it('should return total network fee (exchange rates are not available)', () => {
      const result = selectBatchSellTrades({
        ...mockState,
        assetExchangeRates: {
          'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff84': {
            exchangeRate: '1980',
            usdExchangeRate: '10',
          },
          'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3354': {
            exchangeRate: '200',
            usdExchangeRate: '5',
          },
        },
        batchSellTradesLoadingStatus: RequestStatus.FETCHED,
        batchSellTrades: mockBatchSellTrades,
      });

      expect(result.totalNetworkFee).toMatchInlineSnapshot(`
        {
          "amount": "0.01",
          "asset": {
            "address": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
            "assetId": "eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
            "chainId": 137,
            "decimals": 6,
            "name": "USD Coin",
            "symbol": "USDC",
          },
          "usd": null,
          "valueInCurrency": null,
        }
      `);
      expect(result.isBatchSellTradeAvailable).toBe(true);
      expect(result.isLoading).toBe(false);
    });

    it('should return empty data when batch sell trades are not defined', () => {
      const result = selectBatchSellTrades({
        ...mockState,
        assetExchangeRates: {
          'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85': {
            exchangeRate: '1980',
            usdExchangeRate: '10',
          },
          'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': {
            exchangeRate: '200',
            usdExchangeRate: '5',
          },
        },
        batchSellTradesLoadingStatus: RequestStatus.FETCHED,
        batchSellTrades: null,
      });

      expect(result.totalNetworkFee).toMatchInlineSnapshot(`undefined`);
      expect(result.isBatchSellTradeAvailable).toBe(false);
      expect(result.isLoading).toBe(false);
    });

    it.each([
      {
        status: RequestStatus.LOADING,
        transactions: [
          {
            chainId: 137,
            to: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
            from: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            value: '0x0',
            data: '0x',
            gasLimit: 21000,
            effectiveGas: 21000,
            maxFeePerGas: '0x5d21dba00',
            maxPriorityFeePerGas: '0x5d21dba00',
          },
        ],
        expectedResult: false,
        expectedLoadingResult: true,
      },
      {
        status: RequestStatus.FETCHED,
        transactions: [
          {
            chainId: 137,
            to: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
            from: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            value: '0x0',
            data: '0x',
            gasLimit: 21000,
            effectiveGas: 21000,
            maxFeePerGas: '0x5d21dba00',
            maxPriorityFeePerGas: '0x5d21dba00',
          },
        ],
        expectedResult: true,
        expectedLoadingResult: false,
      },
      {
        status: RequestStatus.FETCHED,
        transactions: undefined,
        expectedResult: false,
        expectedLoadingResult: false,
      },
      {
        status: RequestStatus.FETCHED,
        transactions: [],
        expectedResult: false,
        expectedLoadingResult: false,
      },
      {
        status: RequestStatus.ERROR,
        transactions: undefined,
        expectedResult: false,
        expectedLoadingResult: false,
      },
    ])(
      'should return loading state when status is $status',
      ({ status, transactions, expectedResult, expectedLoadingResult }) => {
        const { isBatchSellTradeAvailable, isLoading } = selectBatchSellTrades({
          ...mockState,
          batchSellTradesLoadingStatus: status,
          // @ts-expect-error - test data
          batchSellTrades: transactions
            ? {
                fee: {
                  amount: '10000',
                },
                transactions,
              }
            : null,
          assetExchangeRates: {
            'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85': {
              exchangeRate: '1980',
              usdExchangeRate: '10',
            },
            'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': {
              exchangeRate: '200',
              usdExchangeRate: '1',
            },
          },
        });

        expect(isBatchSellTradeAvailable).toBe(expectedResult);
        expect(isLoading).toBe(expectedLoadingResult);
      },
    );
  });

  describe('selectBridgeFeatureFlags', () => {
    const mockValidBridgeConfig = {
      minimumVersion: '0.0.0',
      refreshRate: 3,
      maxRefreshCount: 1,
      support: true,
      chainRanking: [],
      chains: {
        '1': {
          isActiveSrc: true,
          isActiveDest: true,
          batchSellDestStablecoins: [
            'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            'eip155:1/slip44:60',
          ],
        },
        '10': {
          isActiveSrc: true,
          isActiveDest: false,
        },
        '59144': {
          isActiveSrc: true,
          isActiveDest: true,
        },
        '120': {
          isActiveSrc: true,
          isActiveDest: false,
        },
        '137': {
          isActiveSrc: false,
          isActiveDest: true,
        },
        '11111': {
          isActiveSrc: false,
          isActiveDest: true,
        },
        '1151111081099710': {
          isActiveSrc: true,
          isActiveDest: true,
        },
      },
    };

    const mockInvalidBridgeConfig = {
      minimumVersion: 1, // Should be a string
      maxRefreshCount: 'invalid', // Should be a number
      refreshRate: 'invalid', // Should be a number
      chains: 'invalid', // Should be an object
    };

    it('should return formatted feature flags when valid config is provided', () => {
      const result = selectBridgeFeatureFlags({
        remoteFeatureFlags: {
          bridgeConfig: mockValidBridgeConfig,
        },
      });

      expect(result).toStrictEqual({
        minimumVersion: '0.0.0',
        refreshRate: 3,
        maxRefreshCount: 1,
        support: true,
        chainRanking: [...DEFAULT_CHAIN_RANKING],
        chains: {
          'eip155:1': {
            isActiveSrc: true,
            isActiveDest: true,
            batchSellDestStablecoins: [
              'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
              'eip155:1/slip44:60',
            ],
          },
          'eip155:10': {
            isActiveSrc: true,
            isActiveDest: false,
          },
          'eip155:59144': {
            isActiveSrc: true,
            isActiveDest: true,
          },
          'eip155:120': {
            isActiveSrc: true,
            isActiveDest: false,
          },
          'eip155:137': {
            isActiveSrc: false,
            isActiveDest: true,
          },
          'eip155:11111': {
            isActiveSrc: false,
            isActiveDest: true,
          },
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
            isActiveSrc: true,
            isActiveDest: true,
          },
        },
      });
    });

    it('should return default feature flags when invalid config is provided', () => {
      const result = selectBridgeFeatureFlags({
        remoteFeatureFlags: {
          bridgeConfig: mockInvalidBridgeConfig,
        },
      });

      expect(result).toStrictEqual({
        minimumVersion: '0.0.0',
        maxRefreshCount: 5,
        refreshRate: 30000,
        chainRanking: [...DEFAULT_CHAIN_RANKING],
        chains: {},
        support: false,
      });
    });

    it('should return default feature flags when bridgeConfig is undefined', () => {
      const result = selectBridgeFeatureFlags({
        // @ts-expect-error - This is a test case
        remoteFeatureFlags: {},
      });

      expect(result).toStrictEqual({
        minimumVersion: '0.0.0',
        maxRefreshCount: 5,
        refreshRate: 30000,
        chainRanking: [...DEFAULT_CHAIN_RANKING],
        chains: {},
        support: false,
      });
    });

    it('should return default feature flags when bridgeConfig is null', () => {
      const result = selectBridgeFeatureFlags({
        remoteFeatureFlags: {
          bridgeConfig: null,
        },
      });

      expect(result).toStrictEqual({
        minimumVersion: '0.0.0',
        maxRefreshCount: 5,
        refreshRate: 30000,
        chainRanking: [...DEFAULT_CHAIN_RANKING],
        chains: {},
        support: false,
      });
    });
  });

  describe('selectMinimumBalanceForRentExemptionInSOL', () => {
    it('should convert lamports to SOL', () => {
      const state = {
        minimumBalanceForRentExemptionInLamports: '1000000000', // 1 SOL
      } as BridgeAppState;

      const result = selectMinimumBalanceForRentExemptionInSOL(state);

      expect(result).toBe('1');
    });

    it('should handle undefined minimumBalanceForRentExemptionInLamports', () => {
      const state = {} as BridgeAppState;

      const result = selectMinimumBalanceForRentExemptionInSOL(state);

      expect(result).toBe('0');
    });

    it('should handle null minimumBalanceForRentExemptionInLamports', () => {
      const state = {
        minimumBalanceForRentExemptionInLamports: null,
      } as unknown as BridgeAppState;

      const result = selectMinimumBalanceForRentExemptionInSOL(state);

      expect(result).toBe('0');
    });

    it('should handle fractional SOL amounts', () => {
      const state = {
        minimumBalanceForRentExemptionInLamports: '500000000', // 0.5 SOL
      } as BridgeAppState;

      const result = selectMinimumBalanceForRentExemptionInSOL(state);

      expect(result).toBe('0.5');
    });
  });

  describe('selectDefaultSlippagePercentage', () => {
    const mockValidBridgeConfig = {
      minimumVersion: '0.0.0',
      refreshRate: 3,
      maxRefreshCount: 1,
      support: true,
      chainRanking: [],
      chains: {
        '1': {
          isActiveSrc: true,
          isActiveDest: true,
          stablecoins: [MOCK_USDC_ADDRESS, '0x456'],
        },
        '10': {
          isActiveSrc: true,
          isActiveDest: false,
        },
        '1151111081099710': {
          isActiveSrc: true,
          isActiveDest: true,
        },
      },
    };

    it('should return swap default slippage when stablecoins list is not defined', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: MOCK_USDC_ADDRESS,
          destTokenAddress: '0x456',
          srcChainId: '10',
          destChainId: '10',
        },
      );

      expect(result).toBe(2);
    });

    it('should return bridge default slippage when requesting an EVM bridge quote', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: MOCK_USDC_ADDRESS,
          destTokenAddress: '0x456',
          srcChainId: '1',
          destChainId: ChainId.SOLANA,
        },
      );

      expect(result).toBe(0.5);
    });

    it('should return bridge default slippage when requesting a Solana bridge quote', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: MOCK_USDC_ADDRESS,
          destTokenAddress: '0x456',
          destChainId: '1',
          srcChainId: ChainId.SOLANA,
        },
      );

      expect(result).toBe(0.5);
    });

    it('should return swap auto slippage when requesting a Solana swap quote', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: MOCK_USDC_ADDRESS,
          destTokenAddress: '0x456',
          destChainId: ChainId.SOLANA,
          srcChainId: ChainId.SOLANA,
        },
      );

      expect(result).toBeUndefined();
    });

    it('should return swap default slippage when dest token is not a stablecoin', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: MOCK_USDC_ADDRESS,
          destTokenAddress: '0x789',
          destChainId: '1',
          srcChainId: '1',
        },
      );

      expect(result).toBe(2);
    });

    it('should return swap default slippage when src token is not a stablecoin', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: '0x789',
          destTokenAddress: '0x456',
          destChainId: '1',
          srcChainId: '1',
        },
      );

      expect(result).toBe(2);
    });

    it('should return swap stablecoin slippage when both tokens are stablecoins', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: MOCK_USDC_ADDRESS,
          destTokenAddress: '0x456',
          destChainId: '1',
          srcChainId: '1',
        },
      );

      expect(result).toBe(0.5);
    });

    it('should return bridge default slippage when srcChainId is undefined', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: MOCK_USDC_ADDRESS,
          destTokenAddress: '0x456',
          destChainId: '1',
        },
      );

      expect(result).toBe(0.5);
    });

    it('should return swap stablecoin slippage when destChainId is undefined', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: MOCK_USDC_ADDRESS,
          destTokenAddress: '0x456',
          srcChainId: '1',
        },
      );

      expect(result).toBe(0.5);
    });

    it('should return swap default slippage when destChainId is undefined', () => {
      const result = selectDefaultSlippagePercentage(
        {
          remoteFeatureFlags: {
            bridgeConfig: mockValidBridgeConfig,
          },
        } as never,
        {
          srcTokenAddress: '0x789',
          destTokenAddress: '0x456',
          srcChainId: '1',
        },
      );

      expect(result).toBe(2);
    });
  });

  describe('selectTokenWarnings', () => {
    it('should return the tokenWarnings array from state', () => {
      const warnings = [
        {
          feature_id: 'HONEYPOT',
          type: 'Malicious',
          description: 'Token is a honeypot',
        },
        {
          feature_id: 'FAKE_TOKEN',
          type: 'Warning',
          description: 'Possible fake token',
        },
      ];
      const state = { tokenWarnings: warnings } as unknown as BridgeAppState;

      expect(selectTokenWarnings(state)).toBe(warnings);
    });

    it('should return an empty array when there are no warnings', () => {
      const state = { tokenWarnings: [] } as unknown as BridgeAppState;

      expect(selectTokenWarnings(state)).toStrictEqual([]);
    });
  });
});
