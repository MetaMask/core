import { AddressZero } from '@ethersproject/constants';
import type { MarketDataDetails } from '@metamask/assets-controllers';
import { toHex } from '@metamask/controller-utils';
import { SolScope } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import type { BridgeAppState } from './selectors';
import {
  selectExchangeRateByChainIdAndAddress,
  selectIsAssetExchangeRateInState,
  selectBridgeQuotes,
  selectIsQuoteExpired,
  selectBridgeFeatureFlags,
} from './selectors';
import type { BridgeAsset, QuoteResponse } from './types';
import { SortOrder, RequestStatus, ChainId } from './types';
import { isNativeAddress } from './utils/bridge';

describe('Bridge Selectors', () => {
  describe('selectExchangeRateByChainIdAndAddress', () => {
    const mockExchangeRateSources = {
      assetExchangeRates: {
        'eip155:1/erc20:0x123': {
          exchangeRate: '2.5',
          usdExchangeRate: '1.5',
        },
        'solana:101/spl:456': {
          exchangeRate: '3.0',
        },
      },
      currencyRates: {
        ETH: {
          conversionRate: 2468.12,
          usdConversionRate: 1800,
        },
      },
      marketData: {
        '0x1': {
          '0xabc': {
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
        selectExchangeRateByChainIdAndAddress(
          mockExchangeRateSources,
          undefined,
          undefined,
        ),
      ).toStrictEqual({});
      expect(
        selectExchangeRateByChainIdAndAddress(mockExchangeRateSources, '1'),
      ).toStrictEqual({});
      expect(
        selectExchangeRateByChainIdAndAddress(
          mockExchangeRateSources,
          undefined,
          '0x123',
        ),
      ).toStrictEqual({});
    });

    it('should return bridge controller rate if available', () => {
      const result = selectExchangeRateByChainIdAndAddress(
        mockExchangeRateSources,
        '1',
        '0x123',
      );
      expect(result).toStrictEqual({
        exchangeRate: '2.5',
        usdExchangeRate: '1.5',
      });
    });

    it('should handle Solana chain rates', () => {
      const result = selectExchangeRateByChainIdAndAddress(
        mockExchangeRateSources,
        SolScope.Mainnet,
        '789',
      );
      expect(result).toStrictEqual({
        exchangeRate: '4.0',
        usdExchangeRate: undefined,
      });
    });

    it('should handle EVM native asset rates', () => {
      const result = selectExchangeRateByChainIdAndAddress(
        mockExchangeRateSources,
        '1',
        '0x0000000000000000000000000000000000000000',
      );
      expect(result).toStrictEqual({
        exchangeRate: '2468.12',
        usdExchangeRate: '1800',
      });
    });

    it('should handle EVM token rates', () => {
      const result = selectExchangeRateByChainIdAndAddress(
        mockExchangeRateSources,
        '1',
        '0xabc',
      );
      expect(result).toStrictEqual({
        exchangeRate: '50.00000000000000162804',
        usdExchangeRate: '36.4650017017000806',
      });
    });
  });

  describe('selectIsAssetExchangeRateInState', () => {
    const mockExchangeRateSources = {
      assetExchangeRates: {
        'eip155:1/erc20:0x123': {
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
              'eip155:1/erc20:0x123': {
                ...mockExchangeRateSources.assetExchangeRates[
                  'eip155:1/erc20:0x123'
                ],
                usdExchangeRate: '1.5',
              },
            },
          },
          '1',
          '0x123',
        ),
      ).toBe(true);
    });

    it('should return false if USD exchange rate does not exist', () => {
      expect(
        selectIsAssetExchangeRateInState(mockExchangeRateSources, '1', '0x123'),
      ).toBe(false);
    });

    it('should return false if exchange rate does not exist', () => {
      expect(
        selectIsAssetExchangeRateInState(mockExchangeRateSources, '1', '0x456'),
      ).toBe(false);
    });

    it('should return false if parameters are missing', () => {
      expect(selectIsAssetExchangeRateInState(mockExchangeRateSources)).toBe(
        false,
      );
      expect(
        selectIsAssetExchangeRateInState(mockExchangeRateSources, '1'),
      ).toBe(false);
    });
  });

  describe('selectIsQuoteExpired', () => {
    const mockState = {
      quotes: [],
      quoteRequest: {
        srcChainId: '1',
        destChainId: '137',
        srcTokenAddress: '0x0000000000000000000000000000000000000000',
        destTokenAddress: '0x0000000000000000000000000000000000000000',
        insufficientBal: false,
      },
      quotesLastFetched: Date.now(),
      quotesLoadingStatus: RequestStatus.FETCHED,
      quoteFetchError: null,
      quotesRefreshCount: 0,
      quotesInitialLoadTime: Date.now(),
      remoteFeatureFlags: {
        bridgeConfig: {
          maxRefreshCount: 5,
          refreshRate: 30000,
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
      gasFeeEstimates: {
        estimatedBaseFee: '50',
        medium: {
          suggestedMaxPriorityFeePerGas: '75',
          suggestedMaxFeePerGas: '1',
        },
        high: {
          suggestedMaxPriorityFeePerGas: '100',
          suggestedMaxFeePerGas: '2',
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
        quoteRequest: {
          ...mockState.quoteRequest,
          srcChainId: undefined,
        },
        quotesRefreshCount: 5,
        quotesLastFetched: Date.now() - 40000, // 40 seconds ago
        remoteFeatureFlags: {
          bridgeConfig: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(mockState.remoteFeatureFlags.bridgeConfig as any),
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
    const mockQuote = {
      quote: {
        requestId: '123',
        srcChainId: '1',
        destChainId: '137',
        srcTokenAmount: '1000000000000000000',
        destTokenAmount: '2000000000000000000',
        srcAsset: {
          address: '0x0000000000000000000000000000000000000000',
          decimals: 18,
          assetId: 'eip155:1/erc20:0x0000000000000000000000000000000000000000',
        },
        destAsset: {
          address: '0x0000000000000000000000000000000000000000',
          decimals: 18,
          assetId: 'eip155:10/erc20:0x0000000000000000000000000000000000000000',
        },
        bridges: ['bridge1'],
        bridgeId: 'bridge1',
        steps: ['step1'],
        feeData: {
          metabridge: {
            amount: '100000000000000000',
            asset: {
              assetId:
                'eip155:1/erc20:0x0000000000000000000000000000000000000000',
            },
          },
        },
      },
      estimatedProcessingTimeInSeconds: 300,
      trade: {
        value: '0x0',
        gasLimit: '24000',
        effectiveGas: '21000',
      },
      approval: {
        gasLimit: '42000',
        effectiveGas: '46000',
      },
    };

    const mockState = {
      quotes: [
        mockQuote,
        { ...mockQuote, quote: { ...mockQuote.quote, requestId: '456' } },
      ],
      quoteRequest: {
        srcChainId: '1',
        destChainId: '137',
        srcTokenAddress: '0x0000000000000000000000000000000000000000',
        destTokenAddress: '0x0000000000000000000000000000000000000000',
        insufficientBal: false,
      },
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
      gasFeeEstimates: {
        estimatedBaseFee: '0',
        medium: {
          suggestedMaxPriorityFeePerGas: '.1',
          suggestedMaxFeePerGas: '.1',
        },
        high: {
          suggestedMaxPriorityFeePerGas: '.1',
          suggestedMaxFeePerGas: '.1',
        },
      },
    } as unknown as BridgeAppState;

    const mockClientParams = {
      sortOrder: SortOrder.COST_ASC,
      selectedQuote: null,
    };

    it('should return sorted quotes with metadata', () => {
      const result = selectBridgeQuotes(mockState, mockClientParams);

      expect(result.sortedQuotes).toHaveLength(2);
      expect(result.sortedQuotes[0].quote.requestId).toMatchInlineSnapshot(
        `"123"`,
      );
      expect(result.recommendedQuote).toBeDefined();
      expect(result.activeQuote).toBeDefined();
      expect(result.isLoading).toBe(false);
      expect(result.quoteFetchError).toBeNull();
      expect(result.isQuoteGoingToRefresh).toBe(true);
    });

    describe('returns swap metadata', () => {
      const getMockSwapState = (
        srcAsset: Pick<BridgeAsset, 'address' | 'decimals' | 'assetId'>,
        destAsset: Pick<BridgeAsset, 'address' | 'decimals' | 'assetId'>,
        txFee?: {
          amount: string;
          asset: Pick<BridgeAsset, 'address' | 'decimals' | 'assetId'>;
        },
      ): BridgeAppState => {
        const chainId = 56;
        const currencyRates = {
          BNB: {
            conversionRate: 551.98,
            usdConversionRate: 645.12,
            conversionDate: Date.now(),
          },
        };
        const marketData = {
          '0x38': {
            '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d': {
              price: '0.0015498387253001357',
              currency: 'BNB',
            },
            '0x0000000000000000000000000000000000000000': {
              price: '1',
              currency: 'BNB',
            },
          },
        } as unknown as Record<string, Record<string, MarketDataDetails>>;
        const srcTokenAmount = new BigNumber('10') // $10 worth of src token
          .dividedBy(marketData['0x38'][srcAsset.address].price)
          .dividedBy(currencyRates.BNB.conversionRate)
          .multipliedBy(10 ** srcAsset.decimals)
          .toFixed(0);
        return {
          ...mockState,
          quotes: [
            {
              quote: {
                srcChainId: chainId,
                destChainId: chainId,
                srcAsset,
                destAsset,
                feeData: {
                  metabridge: {
                    amount: '0',
                    asset: {
                      address: srcAsset.address,
                      decimals: srcAsset.decimals,
                      assetId: srcAsset.assetId,
                    },
                  },
                  txFee,
                },
                gasIncluded: Boolean(txFee),
                srcTokenAmount,
                destTokenAmount: new BigNumber('9')
                  .dividedBy(marketData['0x38'][destAsset.address].price)
                  .dividedBy(currencyRates.BNB.conversionRate)
                  .multipliedBy(10 ** destAsset.decimals)
                  .toFixed(0),
              },
              estimatedProcessingTimeInSeconds: 300,
              approval: {
                gasLimit: 21211,
              },
              trade: {
                gasLimit: 59659,
                value: isNativeAddress(srcAsset.address)
                  ? toHex(
                      new BigNumber(srcTokenAmount)
                        .plus(txFee?.amount || '0')
                        .toString(),
                    )
                  : '0x0',
              },
            } as unknown as QuoteResponse,
          ],
          currencyRates,
          marketData,
          quoteRequest: {
            ...mockState.quoteRequest,
            srcChainId: chainId,
            destChainId: chainId,
            srcTokenAddress: srcAsset.address,
            destTokenAddress: destAsset.address,
          },
        };
      };

      it('for native -> erc20', () => {
        const newState = getMockSwapState(
          {
            address: AddressZero,
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000000',
          },
          {
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          },
        );

        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const {
          quote,
          trade,
          approval,
          estimatedProcessingTimeInSeconds,
          ...quoteMetadata
        } = sortedQuotes[0];
        expect(quote.gasIncluded).toBe(false);
        expect(isNativeAddress(quote.srcAsset.address)).toBe(true);
        expect(quoteMetadata).toMatchInlineSnapshot(`
          Object {
            "adjustedReturn": Object {
              "usd": "10.513424894341876155230359150867612640256",
              "valueInCurrency": "8.995536137740000000254299423511757231474",
            },
            "cost": Object {
              "usd": "1.173955083193541475489640849132387359744",
              "valueInCurrency": "1.004463862259999726625700576488242768526",
            },
            "gasFee": Object {
              "effective": Object {
                "amount": "0.000008087",
                "usd": "0.00521708544",
                "valueInCurrency": "0.00446386226",
              },
              "max": Object {
                "amount": "0.000016174",
                "usd": "0.01043417088",
                "valueInCurrency": "0.00892772452",
              },
              "total": Object {
                "amount": "0.000008087",
                "usd": "0.00521708544",
                "valueInCurrency": "0.00446386226",
              },
            },
            "includedTxFees": null,
            "sentAmount": Object {
              "amount": "0.018116598427479256",
              "usd": "11.68737997753541763072",
              "valueInCurrency": "9.99999999999999972688",
            },
            "swapRate": "580.70558265713069471891",
            "toTokenAmount": Object {
              "amount": "10.520409845594599059",
              "usd": "10.518641979781876155230359150867612640256",
              "valueInCurrency": "9.000000000000000000254299423511757231474",
            },
            "totalMaxNetworkFee": Object {
              "amount": "0.000016174",
              "usd": "0.01043417088",
              "valueInCurrency": "0.00892772452",
            },
            "totalNetworkFee": Object {
              "amount": "0.000008087",
              "usd": "0.00521708544",
              "valueInCurrency": "0.00446386226",
            },
          }
        `);
      });

      it('erc20 -> native', () => {
        const newState = getMockSwapState(
          {
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          },
          {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000000',
          },
        );

        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const {
          quote,
          trade,
          approval,
          estimatedProcessingTimeInSeconds,
          ...quoteMetadata
        } = sortedQuotes[0];
        expect(quoteMetadata).toMatchInlineSnapshot(`
          Object {
            "adjustedReturn": Object {
              "usd": "10.51342489434187625472",
              "valueInCurrency": "8.99553613774000008538",
            },
            "cost": Object {
              "usd": "1.173955083193541695202677292586583974912",
              "valueInCurrency": "1.004463862259999914617394921816007289298",
            },
            "gasFee": Object {
              "effective": Object {
                "amount": "0.000008087",
                "usd": "0.00521708544",
                "valueInCurrency": "0.00446386226",
              },
              "max": Object {
                "amount": "0.000016174",
                "usd": "0.01043417088",
                "valueInCurrency": "0.00892772452",
              },
              "total": Object {
                "amount": "0.000008087",
                "usd": "0.00521708544",
                "valueInCurrency": "0.00446386226",
              },
            },
            "includedTxFees": null,
            "sentAmount": Object {
              "amount": "11.689344272882887843",
              "usd": "11.687379977535417949922677292586583974912",
              "valueInCurrency": "9.999999999999999999997394921816007289298",
            },
            "swapRate": "0.00139485485277012214",
            "toTokenAmount": Object {
              "amount": "0.016304938584731331",
              "usd": "10.51864197978187625472",
              "valueInCurrency": "9.00000000000000008538",
            },
            "totalMaxNetworkFee": Object {
              "amount": "0.000016174",
              "usd": "0.01043417088",
              "valueInCurrency": "0.00892772452",
            },
            "totalNetworkFee": Object {
              "amount": "0.000008087",
              "usd": "0.00521708544",
              "valueInCurrency": "0.00446386226",
            },
          }
        `);
      });

      it('when gas is included and is taken from dest token', () => {
        const newState = getMockSwapState(
          {
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          },
          {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000000',
          },
          {
            amount: '1000000000000000',
            asset: {
              address: '0x0000000000000000000000000000000000000000',
              decimals: 18,
              assetId:
                'eip155:1/erc20:0x0000000000000000000000000000000000000000',
            },
          },
        );

        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const {
          quote,
          trade,
          approval,
          estimatedProcessingTimeInSeconds,
          ...quoteMetadata
        } = sortedQuotes[0];
        expect(quoteMetadata).toMatchInlineSnapshot(`
          Object {
            "adjustedReturn": Object {
              "usd": "10.51864197978187625472",
              "valueInCurrency": "9.00000000000000008538",
            },
            "cost": Object {
              "usd": "1.168737997753541695202677292586583974912",
              "valueInCurrency": "0.999999999999999914617394921816007289298",
            },
            "gasFee": Object {
              "effective": Object {
                "amount": "0.000008087",
                "usd": "0.00521708544",
                "valueInCurrency": "0.00446386226",
              },
              "max": Object {
                "amount": "0.000016174",
                "usd": "0.01043417088",
                "valueInCurrency": "0.00892772452",
              },
              "total": Object {
                "amount": "0.000008087",
                "usd": "0.00521708544",
                "valueInCurrency": "0.00446386226",
              },
            },
            "includedTxFees": Object {
              "amount": "0.001",
              "usd": "0.64512",
              "valueInCurrency": "0.55198",
            },
            "sentAmount": Object {
              "amount": "11.689344272882887843",
              "usd": "11.687379977535417949922677292586583974912",
              "valueInCurrency": "9.999999999999999999997394921816007289298",
            },
            "swapRate": "0.00139485485277012214",
            "toTokenAmount": Object {
              "amount": "0.016304938584731331",
              "usd": "10.51864197978187625472",
              "valueInCurrency": "9.00000000000000008538",
            },
            "totalMaxNetworkFee": Object {
              "amount": "0.000016174",
              "usd": "0.01043417088",
              "valueInCurrency": "0.00892772452",
            },
            "totalNetworkFee": Object {
              "amount": "0.000008087",
              "usd": "0.00521708544",
              "valueInCurrency": "0.00446386226",
            },
          }
        `);
      });

      it('when gas is included and is taken from src token', () => {
        const newState = getMockSwapState(
          {
            address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          },
          {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000000',
          },
          {
            amount: '3000000000000000000',
            asset: {
              address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
              decimals: 18,
              assetId:
                'eip155:1/erc20:0x0000000000000000000000000000000000000000',
            },
          },
        );

        const { sortedQuotes } = selectBridgeQuotes(newState, mockClientParams);

        const {
          quote,
          trade,
          approval,
          estimatedProcessingTimeInSeconds,
          ...quoteMetadata
        } = sortedQuotes[0];
        expect(quoteMetadata).toMatchInlineSnapshot(`
          Object {
            "adjustedReturn": Object {
              "usd": "10.51864197978187625472",
              "valueInCurrency": "9.00000000000000008538",
            },
            "cost": Object {
              "usd": "1.168737997753541695202677292586583974912",
              "valueInCurrency": "0.999999999999999914617394921816007289298",
            },
            "gasFee": Object {
              "effective": Object {
                "amount": "0.000008087",
                "usd": "0.00521708544",
                "valueInCurrency": "0.00446386226",
              },
              "max": Object {
                "amount": "0.000016174",
                "usd": "0.01043417088",
                "valueInCurrency": "0.00892772452",
              },
              "total": Object {
                "amount": "0.000008087",
                "usd": "0.00521708544",
                "valueInCurrency": "0.00446386226",
              },
            },
            "includedTxFees": Object {
              "amount": "3",
              "usd": "1935.36",
              "valueInCurrency": "1655.94",
            },
            "sentAmount": Object {
              "amount": "11.689344272882887843",
              "usd": "11.687379977535417949922677292586583974912",
              "valueInCurrency": "9.999999999999999999997394921816007289298",
            },
            "swapRate": "0.00139485485277012214",
            "toTokenAmount": Object {
              "amount": "0.016304938584731331",
              "usd": "10.51864197978187625472",
              "valueInCurrency": "9.00000000000000008538",
            },
            "totalMaxNetworkFee": Object {
              "amount": "0.000016174",
              "usd": "0.01043417088",
              "valueInCurrency": "0.00892772452",
            },
            "totalNetworkFee": Object {
              "amount": "0.000008087",
              "usd": "0.00521708544",
              "valueInCurrency": "0.00446386226",
            },
          }
        `);
      });
    });

    it('should only fetch quotes once if balance is insufficient', () => {
      const result = selectBridgeQuotes(
        {
          ...mockState,
          quoteRequest: { ...mockState.quoteRequest, insufficientBal: true },
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
      const resultCostAsc = selectBridgeQuotes(mockState, {
        ...mockClientParams,
        sortOrder: SortOrder.COST_ASC,
      });
      const resultEtaAsc = selectBridgeQuotes(mockState, {
        ...mockClientParams,
        sortOrder: SortOrder.ETA_ASC,
      });

      expect(resultCostAsc.sortedQuotes).toBeDefined();
      expect(resultEtaAsc.sortedQuotes).toBeDefined();
    });

    it('should handle selected quote', () => {
      const result = selectBridgeQuotes(mockState, {
        ...mockClientParams,
        selectedQuote: mockQuote as never,
      });

      expect(result.activeQuote).toStrictEqual(mockQuote);
    });

    it('should handle quote refresh state', () => {
      const stateWithMaxRefresh = {
        ...mockState,
        quotesRefreshCount: 5,
      } as unknown as BridgeAppState;

      const result = selectBridgeQuotes(stateWithMaxRefresh, mockClientParams);
      expect(result.isQuoteGoingToRefresh).toBe(false);
    });

    it('should handle loading state', () => {
      const loadingState = {
        ...mockState,
        quotesLoadingStatus: RequestStatus.LOADING,
      } as unknown as BridgeAppState;

      const result = selectBridgeQuotes(loadingState, mockClientParams);
      expect(result.isLoading).toBe(true);
    });

    it('should handle error state', () => {
      const errorState = {
        ...mockState,
        quoteFetchError: new Error('Test error'),
        quotesLoadingStatus: RequestStatus.ERROR,
      } as unknown as BridgeAppState;

      const result = selectBridgeQuotes(errorState, mockClientParams);
      expect(result.quoteFetchError).toBeDefined();
    });

    it('should handle Solana quotes', () => {
      const solanaQuote = {
        ...mockQuote,
        quote: {
          ...mockQuote.quote,
          srcChainId: ChainId.SOLANA,
          srcAsset: {
            address: 'solanaNativeAddress',
            decimals: 9,
            assetId: 'solana:1/solanaNativeAddress',
          },
        },
        solanaFeesInLamports: '5000',
      };

      const solanaState = {
        ...mockState,
        quotes: [solanaQuote],
        quoteRequest: {
          ...mockState.quoteRequest,
          srcChainId: ChainId.SOLANA,
          srcTokenAddress: 'solanaNativeAddress',
        },
      } as unknown as BridgeAppState;

      const result = selectBridgeQuotes(solanaState, mockClientParams);
      expect(result.sortedQuotes).toHaveLength(1);
    });
  });

  describe('selectBridgeFeatureFlags', () => {
    const mockValidBridgeConfig = {
      minimumVersion: '0.0.0',
      refreshRate: 3,
      maxRefreshCount: 1,
      support: true,
      chains: {
        '1': {
          isActiveSrc: true,
          isActiveDest: true,
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
        chains: {
          'eip155:1': {
            isActiveSrc: true,
            isActiveDest: true,
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
        chains: {},
        support: false,
      });
    });
  });
});
