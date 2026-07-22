import { AddressZero } from '@ethersproject/constants';
import { convertHexToDecimal } from '@metamask/controller-utils';
import { BigNumber } from 'bignumber.js';
import { merge } from 'lodash';

import { mockBridgeQuotesErc20Erc20V1 } from '../../../tests/mock-quotes-erc20-erc20';
import { mockBridgeQuotesNativeErc20V1 } from '../../../tests/mock-quotes-native-erc20';
import { getMockBridgeQuotesSolErc20V2 } from '../../../tests/mock-quotes-sol-erc20';
import type { GenericQuoteRequest, L1GasFees } from '../../types';
import type { Quote } from '../../validators/quote';
import { isValidQuoteRequest } from '../../validators/quote-request';
import { QuoteResponseV1 } from '../../validators/quote-response-v1';
import type { TxData } from '../../validators/trade';
import { getNativeAssetForChainId, isNativeAddress } from '../bridge';
import { formatEtaInMinutes } from '../number-formatters';
import {
  calcNonEvmTotalNetworkFee,
  calcToAmount,
  calcSentAmount,
  calcRelayerFee,
  calcEstimatedAndMaxTotalGasFee,
  calcTotalEstimatedNetworkFee,
  calcAdjustedReturn,
  calcSwapRate,
  calcCost,
  calcSlippagePercentage,
  calcPriceImpact,
} from './calculators';

describe('Quote Utils', () => {
  describe('isValidQuoteRequest', () => {
    const validRequest: GenericQuoteRequest = {
      srcTokenAddress: '0x123',
      destTokenAddress: '0x456',
      srcChainId: '1',
      destChainId: '137',
      walletAddress: '0x789',
      srcTokenAmount: '1000',
      slippage: 0.5,
      gasIncluded: false,
      gasIncluded7702: false,
    };

    it('should return true for valid request with all required fields', () => {
      expect(isValidQuoteRequest(validRequest)).toBe(true);
    });

    it('should return false if any required string field is missing', () => {
      const requiredFields = [
        'srcTokenAddress',
        'destTokenAddress',
        'srcChainId',
        'destChainId',
        'walletAddress',
        'srcTokenAmount',
      ];

      requiredFields.forEach((field) => {
        const invalidRequest = { ...validRequest };
        delete invalidRequest[field as keyof GenericQuoteRequest];
        expect(isValidQuoteRequest(invalidRequest)).toBe(false);
      });
    });

    it('should return false if any required string field is empty', () => {
      const requiredFields = [
        'srcTokenAddress',
        'destTokenAddress',
        'srcChainId',
        'destChainId',
        'walletAddress',
        'srcTokenAmount',
      ];

      requiredFields.forEach((field) => {
        const invalidRequest = {
          ...validRequest,
          [field]: '',
        };
        expect(isValidQuoteRequest(invalidRequest)).toBe(false);
      });
    });

    it('should return false if any required string field is null', () => {
      const invalidRequest = {
        ...validRequest,
        srcTokenAddress: null,
      };
      expect(isValidQuoteRequest(invalidRequest as never)).toBe(false);
    });

    it('should return false if srcTokenAmount is not a valid positive integer', () => {
      const invalidAmounts = ['0', '-1', '1.5', 'abc', '01'];
      invalidAmounts.forEach((amount) => {
        const invalidRequest = {
          ...validRequest,
          srcTokenAmount: amount,
        };
        expect(isValidQuoteRequest(invalidRequest)).toBe(false);
      });
    });

    it('should return true for valid srcTokenAmount values', () => {
      const validAmounts = ['1', '100', '999999'];
      validAmounts.forEach((amount) => {
        const validAmountRequest = {
          ...validRequest,
          srcTokenAmount: amount,
        };
        expect(isValidQuoteRequest(validAmountRequest)).toBe(true);
      });
    });

    it('should validate request without amount when requireAmount is false', () => {
      const { srcTokenAmount, ...requestWithoutAmount } = validRequest;
      expect(isValidQuoteRequest(requestWithoutAmount, false)).toBe(true);
    });

    describe('slippage validation', () => {
      it('should return true when slippage is a valid number', () => {
        const requestWithSlippage = {
          ...validRequest,
          slippage: 1.5,
        };
        expect(isValidQuoteRequest(requestWithSlippage)).toBe(true);
      });

      it('should return false when slippage is NaN', () => {
        const requestWithInvalidSlippage = {
          ...validRequest,
          slippage: NaN,
        };
        expect(isValidQuoteRequest(requestWithInvalidSlippage)).toBe(false);
      });

      it('should return false when slippage is null', () => {
        const requestWithInvalidSlippage = {
          ...validRequest,
          slippage: null,
        };
        expect(isValidQuoteRequest(requestWithInvalidSlippage as never)).toBe(
          false,
        );
      });

      it('should return true when slippage is undefined', () => {
        const requestWithoutSlippage = { ...validRequest };
        delete requestWithoutSlippage.slippage;
        expect(isValidQuoteRequest(requestWithoutSlippage)).toBe(true);
      });
    });
  });
});

describe('Quote Metadata Utils', () => {
  describe('calcSentAmount', () => {
    it('should calculate sent amount correctly with exchange rates', () => {
      const mockQuote = merge({}, mockBridgeQuotesErc20Erc20V1[0], {
        quote: {
          srcTokenAmount: '2555423',
          srcAsset: { decimals: 6 },
          feeData: {
            metabridge: {
              amount: '110000000',
              asset: {
                assetId:
                  'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85',
              },
            },
          },
        },
      }).quote;
      expect(mockQuote.feeData.metabridge.asset?.assetId).toBe(
        mockQuote.srcAsset.assetId,
      );

      const result = calcSentAmount(mockQuote, {
        exchangeRate: '2.14',
        usdExchangeRate: '1.5',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "amount": "112.555423",
          "usd": "168.8331345",
          "valueInCurrency": "240.86860522",
        }
      `);
    });

    it('should handle missing exchange rates', () => {
      const mockQuote = merge({}, mockBridgeQuotesErc20Erc20V1[0], {
        quote: {
          srcTokenAmount: '1000000000',
          srcAsset: { decimals: 6 },
          feeData: {
            metabridge: { amount: '100000000' },
          },
        },
      }).quote;
      const result = calcSentAmount(mockQuote, {});

      expect(result.amount).toBe('1100');
      expect(result.valueInCurrency).toBeUndefined();
      expect(result.usd).toBeUndefined();
    });

    it('should handle zero values', () => {
      const zeroQuote = merge({}, mockBridgeQuotesErc20Erc20V1[0], {
        quote: {
          srcTokenAmount: '0',
          srcAsset: { decimals: 6 },

          feeData: {
            metabridge: { amount: '0' },
          },
        },
      }).quote;

      const result = calcSentAmount(zeroQuote, {
        exchangeRate: '2',
        usdExchangeRate: '1.5',
      });

      expect(result.amount).toBe('0');
      expect(result.valueInCurrency).toBe('0');
      expect(result.usd).toBe('0');
    });

    it('should handle large numbers', () => {
      const largeQuote = merge({}, mockBridgeQuotesErc20Erc20V1[0], {
        quote: {
          srcTokenAmount: '1000000000000000000',
          srcAsset: {
            decimals: 18,
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000000',
          },
          feeData: {
            metabridge: {
              amount: '100000000000000000',
              asset: {
                assetId:
                  'eip155:1/erc20:0x0000000000000000000000000000000000000000',
                address: '0x0000000000000000000000000000000000000000',
                decimals: 18,
              },
            },
          },
        },
      }).quote;

      const result = calcSentAmount(largeQuote, {
        exchangeRate: '2',
        usdExchangeRate: '1.5',
      });

      // (1 + 0.1) ETH = 1.1 ETH
      expect(result.amount).toBe('1.1');
      expect(result.valueInCurrency).toBe('2.2');
      expect(result.usd).toBe('1.65');
    });

    it('should not add feeData fees for intent-based quotes', () => {
      // For intent-based swaps (e.g. CoW Protocol), srcTokenAmount is already
      // the total fixed commitment including protocol fees. Adding feeData fees
      // on top would double-count them.

      const intentQuote = merge({}, mockBridgeQuotesErc20Erc20V1[0], {
        quote: {
          srcTokenAmount: '10000000', // 10 USDT (6 decimals), fee already included
          srcAsset: {
            decimals: 6,
            assetId:
              'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7',
          },
          feeData: {
            metabridge: {
              amount: '500000', // 0.5 USDT protocol fee — already inside srcTokenAmount
              asset: {
                assetId:
                  'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7',
                address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                decimals: 6,
              },
            },
          },
          intent: {
            protocol: 'cow',
            order: {
              sellToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
              buyToken: '0x0000000000000000000000000000000000000000',
              validTo: 1717027200,
              appData: 'some-app-data',
              appDataHash: '0xabcd',
              feeAmount: '100',
              kind: 'sell' as const,
              partiallyFillable: false,
              sellAmount: '1000',
            },
            typedData: {
              types: {},
              domain: {},
              primaryType: 'Order',
              message: {},
            },
          },
        },
      }).quote;

      const result = calcSentAmount(intentQuote, {
        exchangeRate: '1',
        usdExchangeRate: '1',
      });

      // Should be exactly 10 USDT — not 10.5 (which would double-count the fee)
      expect(result.amount).toBe('10');
      expect(result.valueInCurrency).toBe('10');
      expect(result.usd).toBe('10');
    });
  });

  describe('calcNonEvmTotalNetworkFee', () => {
    const mockBridgeQuote = getMockBridgeQuotesSolErc20V2({
      nonEvmFeesInNative: '1',
    })[0];

    it('should calculate Solana fees correctly with exchange rates', () => {
      const result = calcNonEvmTotalNetworkFee(mockBridgeQuote, {
        exchangeRate: '2',
        usdExchangeRate: '1.5',
      });

      expect(result.amount).toBe('1');
      expect(result.valueInCurrency).toBe('2');
      expect(result.usd).toBe('1.5');
    });

    it('should calculate Bitcoin fees correctly with exchange rates', () => {
      const btcQuote = getMockBridgeQuotesSolErc20V2({
        nonEvmFeesInNative: '0.00005', // BTC fee in native units
      })[0];

      const result = calcNonEvmTotalNetworkFee(btcQuote, {
        exchangeRate: '60000',
        usdExchangeRate: '60000',
      });

      expect(result.amount).toBe('0.00005');
      expect(result.valueInCurrency).toBe('3'); // 0.00005 * 60000 = 3
      expect(result.usd).toBe('3'); // 0.00005 * 60000 = 3
    });

    it('should handle missing exchange rates', () => {
      const result = calcNonEvmTotalNetworkFee(mockBridgeQuote, {});

      expect(result.amount).toBe('1');
      expect(result.valueInCurrency).toBeUndefined();
      expect(result.usd).toBeUndefined();
    });

    it('should handle zero fees', () => {
      const result = calcNonEvmTotalNetworkFee(
        { ...mockBridgeQuote, nonEvmFeesInNative: '0' },
        { exchangeRate: '2', usdExchangeRate: '1.5' },
      );

      expect(result.amount).toBe('0');
      expect(result.valueInCurrency).toBe('0');
      expect(result.usd).toBe('0');
    });
  });

  describe('calcToAmount', () => {
    const mockQuote: Quote = {
      destTokenAmount: '1000000000',
      minDestTokenAmount: '950000000',
      destAsset: { decimals: 6 },
    } as Quote;

    it('should calculate destination amount correctly with exchange rates', () => {
      const result = calcToAmount(
        mockQuote.destTokenAmount,
        mockQuote.destAsset,
        {
          exchangeRate: '2',
          usdExchangeRate: '1.5',
        },
      );

      expect(result.amount).toBe('1000');
      expect(result.valueInCurrency).toBe('2000');
      expect(result.usd).toBe('1500');
    });

    it('should handle missing exchange rates', () => {
      const result = calcToAmount(
        mockQuote.destTokenAmount,
        mockQuote.destAsset,
        {},
      );

      expect(result.amount).toBe('1000');
      expect(result.valueInCurrency).toBeUndefined();
      expect(result.usd).toBeUndefined();
    });
  });

  describe('calcRelayerFee', () => {
    const mockBridgeQuote = merge({}, mockBridgeQuotesNativeErc20V1[0], {
      quote: {
        srcAsset: { address: '0x123', decimals: 18 },
        srcTokenAmount: '1000000000000000000',
        feeData: {
          metabridge: {
            amount: '10000000000000000',
          },
        },
      },
      trade: { value: '0x10A741A462780000' },
    }) as unknown as QuoteResponseV1<TxData, TxData>;

    it('should calculate relayer fee correctly with exchange rates', () => {
      const result = calcRelayerFee(mockBridgeQuote, {
        exchangeRate: '2',
        usdExchangeRate: '1.5',
      });

      expect(new BigNumber(mockBridgeQuote.trade.value, 16).toFixed()).toBe(
        '1200000000000000000',
      );

      expect(mockBridgeQuote.quote.srcAsset.assetId).toStrictEqual(
        mockBridgeQuote.quote.feeData.metabridge.asset?.assetId,
      );
      expect(isNativeAddress(mockBridgeQuote.quote.srcAsset.assetId)).toBe(
        true,
      );

      expect(result?.amount).toStrictEqual(new BigNumber(0.19).toFixed());
      expect(result?.valueInCurrency).toStrictEqual(
        new BigNumber(0.38).toFixed(),
      );
      expect(result?.usd).toStrictEqual(new BigNumber(0.285).toFixed());
    });

    it('should calculate relayer fee correctly with no trade.value', () => {
      const result = calcRelayerFee(
        merge({}, mockBridgeQuotesNativeErc20V1[0], {
          // @ts-expect-error - trade.value is an object
          trade: { ...mockBridgeQuote.trade, value: '0x0' },
        }),
        {
          exchangeRate: '2',
          usdExchangeRate: '1.5',
        },
      );

      expect(result).toBeUndefined();
    });

    it('should handle native token address', () => {
      const nativeBridgeQuote = merge({}, mockBridgeQuotesNativeErc20V1[0], {
        quote: {
          srcTokenAmount: '1000000000000000000',
          feeData: {
            metabridge: {
              amount: '100000000000000000',
              asset: {
                address: AddressZero,
                decimals: 18,
                assetId: getNativeAssetForChainId(1).assetId,
              },
            },
          },
          srcAsset: {
            address: AddressZero,
            decimals: 18,
            assetId: getNativeAssetForChainId(1).assetId,
          },
        },
        trade: {
          value: '0x10A741A462780000',
        },
      }) as QuoteResponseV1<TxData>;

      const result = calcRelayerFee(nativeBridgeQuote, {
        exchangeRate: '2',
        usdExchangeRate: '1.5',
      });

      expect(
        convertHexToDecimal(nativeBridgeQuote.trade.value).toString(),
      ).toBe('1200000000000000000');
      expect(result).toMatchInlineSnapshot(`
        {
          "amount": "0.1",
          "usd": "0.15",
          "valueInCurrency": "0.2",
        }
      `);
    });
  });

  describe('calcEstimatedAndMaxTotalGasFee', () => {
    const mockBridgeQuote: QuoteResponseV1<TxData, TxData> & L1GasFees = {
      quote: {} as Quote,
      trade: { gasLimit: 21000 },
      approval: { gasLimit: 46000 },
      l1GasFeesInHexWei: '0x5AF3107A4000',
    } as unknown as QuoteResponseV1<TxData, TxData> & L1GasFees;

    it('should calculate estimated and max gas fees correctly', () => {
      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: mockBridgeQuote,
        feePerGasInDecGwei: '52',
        exchangeRate: '2000',
        usdExchangeRate: '1500',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "total": {
            "amount": "0.003584",
            "usd": "5.376",
            "valueInCurrency": "7.168",
          },
        }
      `);
      expect(result?.total?.amount).toBeDefined();
    });

    it('should calculate estimated and max gas fees correctly when effectiveGas is available', () => {
      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: {
          ...mockBridgeQuote,
          trade: { gasLimit: 21000, effectiveGas: 10000 },
          approval: { gasLimit: 46000, effectiveGas: 20000 },
        } as QuoteResponseV1<TxData, TxData> & L1GasFees,
        feePerGasInDecGwei: '52',
        exchangeRate: '2000',
        usdExchangeRate: '1500',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "total": {
            "amount": "0.003584",
            "usd": "5.376",
            "valueInCurrency": "7.168",
          },
        }
      `);
      expect(result?.total?.amount).toBeDefined();
    });

    it('should handle missing exchange rates', () => {
      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: mockBridgeQuote,
        feePerGasInDecGwei: '102',
        exchangeRate: undefined,
        usdExchangeRate: undefined,
      });

      expect(result?.total?.valueInCurrency).toBeUndefined();
      expect(result?.total?.usd).toBeUndefined();
      expect(result?.total?.amount).toBeDefined();
    });

    it('should handle only display currency exchange rate', () => {
      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: mockBridgeQuote,
        feePerGasInDecGwei: '102',
        exchangeRate: '2000',
        usdExchangeRate: undefined,
      });

      expect(result?.total?.valueInCurrency).toBeDefined();
      expect(result?.total?.usd).toBeUndefined();
    });

    it('should handle only USD exchange rate', () => {
      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: mockBridgeQuote,
        feePerGasInDecGwei: '102',
        exchangeRate: undefined,
        usdExchangeRate: '1500',
      });

      expect(result?.total?.valueInCurrency).toBeUndefined();
      expect(result?.total?.usd).toBeDefined();
    });

    it('should handle zero gas limits', () => {
      const zeroGasQuote = {
        quote: {} as Quote,
        trade: { gasLimit: 0 },
        approval: { gasLimit: 0 },
        l1GasFeesInHexWei: '0x0',
        estimatedProcessingTimeInSeconds: 60,
      } as unknown as QuoteResponseV1<TxData, TxData> & L1GasFees;

      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: zeroGasQuote,
        feePerGasInDecGwei: '102',
        exchangeRate: '2000',
        usdExchangeRate: '1500',
      });

      expect(result?.total?.amount).toBeUndefined();
      expect(result?.total?.valueInCurrency).toBeUndefined();
      expect(result?.total?.usd).toBeUndefined();
    });

    it('should handle missing approval', () => {
      const noApprovalQuote = {
        quote: {} as Quote,
        trade: { gasLimit: 21000 } as TxData,
        approval: undefined,
        l1GasFeesInHexWei: '0x5AF3107A4000',
        estimatedProcessingTimeInSeconds: 60,
      } as QuoteResponseV1<TxData, TxData> & L1GasFees;

      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: noApprovalQuote,
        feePerGasInDecGwei: '102',
        exchangeRate: '2000',
        usdExchangeRate: '1500',
      });

      expect(result?.total?.amount).toBeDefined();
    });

    it('should handle missing trade and approval gasLimits, with l1GasFeesInHexWei', () => {
      const noGasLimitQuote = {
        quote: {} as Quote,
        trade: { gasLimit: undefined },
        approval: { gasLimit: undefined },
        l1GasFeesInHexWei: '0x5AF3107A4000',
        estimatedProcessingTimeInSeconds: 60,
      } as unknown as QuoteResponseV1<TxData, TxData> & L1GasFees;

      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: noGasLimitQuote,
        feePerGasInDecGwei: '102',
        exchangeRate: '2000',
        usdExchangeRate: '1500',
      });

      expect(result?.total?.amount).toBeUndefined();
    });

    it('should handle missing trade gasLimit, with l1GasFeesInHexWei', () => {
      const noGasLimitQuote = {
        quote: {} as Quote,
        trade: { gasLimit: undefined },
        approval: { gasLimit: 46000 },
        l1GasFeesInHexWei: '0x5AF3107A4000',
        estimatedProcessingTimeInSeconds: 60,
      } as unknown as QuoteResponseV1<TxData, TxData> & L1GasFees;

      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: noGasLimitQuote,
        feePerGasInDecGwei: '102',
        exchangeRate: '2000',
        usdExchangeRate: '1500',
      });

      expect(result?.total?.amount).toBe('0.004792');
    });

    it('should handle missing trade gasLimit, with approval', () => {
      const noGasLimitQuote = {
        quote: {} as Quote,
        trade: { gasLimit: undefined },
        approval: { gasLimit: 46000 },
        estimatedProcessingTimeInSeconds: 60,
      } as unknown as QuoteResponseV1<TxData, TxData> & L1GasFees;

      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: noGasLimitQuote,
        feePerGasInDecGwei: '102',
        exchangeRate: '2000',
        usdExchangeRate: '1500',
      });

      expect(result?.total?.amount).toBe('0.004692');
    });

    it('should handle missing trade and approval gasLimit', () => {
      const noGasLimitQuote = {
        quote: {} as Quote,
        trade: { gasLimit: undefined },
        approval: { gasLimit: undefined },
        estimatedProcessingTimeInSeconds: 60,
      } as unknown as QuoteResponseV1<TxData, TxData> & L1GasFees;

      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: noGasLimitQuote,
        feePerGasInDecGwei: '102',
        exchangeRate: '2000',
        usdExchangeRate: '1500',
      });

      expect(result?.total?.amount).toBeUndefined();
    });

    it('should handle large gas limits and fees', () => {
      const largeGasQuote = {
        quote: {} as Quote,
        trade: { gasLimit: 1000000 } as TxData,
        approval: { gasLimit: 500000 } as TxData,
        l1GasFeesInHexWei: '0x1BC16D674EC80000', // 2 ETH in wei
        estimatedProcessingTimeInSeconds: 60,
      } as QuoteResponseV1<TxData, TxData> & L1GasFees;

      const result = calcEstimatedAndMaxTotalGasFee({
        bridgeQuote: largeGasQuote,
        feePerGasInDecGwei: '210',
        exchangeRate: '3000',
        usdExchangeRate: '2500',
      });

      expect(parseFloat(result?.total?.amount ?? '0')).toBeGreaterThan(2); // Should be > 2 ETH due to L1 fees
      expect(result?.total?.valueInCurrency).toBeDefined();
      expect(result?.total?.usd).toBeDefined();
      expect(
        parseFloat((result?.total?.valueInCurrency as string) ?? '0'),
      ).toBeGreaterThan(6000);
      expect(parseFloat((result?.total?.usd as string) ?? '0')).toBeGreaterThan(
        5000,
      );
    });
  });

  describe('formatEtaInMinutes', () => {
    it('should format seconds less than 60 as "< 1"', () => {
      expect(formatEtaInMinutes(30)).toBe('< 1');
      expect(formatEtaInMinutes(59)).toBe('< 1');
    });

    it('should correctly format minutes for values >= 60 seconds', () => {
      expect(formatEtaInMinutes(60)).toBe('1');
      expect(formatEtaInMinutes(120)).toBe('2');
      expect(formatEtaInMinutes(150)).toBe('3');
    });

    it('should handle large values', () => {
      expect(formatEtaInMinutes(3600)).toBe('60');
    });
  });

  describe('calcSwapRate', () => {
    it('should calculate correct swap rate', () => {
      expect(calcSwapRate('1', '2')).toBe('2');
      expect(calcSwapRate('2', '1')).toBe('0.5');
      expect(calcSwapRate('100', '250')).toBe('2.5');
    });

    it('should handle large numbers', () => {
      expect(calcSwapRate('1000000000000000000', '2000000000000000000')).toBe(
        '2',
      );
    });
  });

  describe('calcTotalEstimatedNetworkFee', () => {
    const mockGasFee = {
      effective: { amount: '0.1', valueInCurrency: '200', usd: '150' },
      total: { amount: '0.1', valueInCurrency: '200', usd: '150' },
      max: { amount: '0.2', valueInCurrency: '400', usd: '300' },
    };

    const mockRelayerFee = {
      amount: '0.05',
      valueInCurrency: '100',
      usd: '75',
    };

    it('should calculate total estimated network fee correctly', () => {
      const result = calcTotalEstimatedNetworkFee(mockGasFee, mockRelayerFee);

      expect(result.amount).toBe('0.15');
      expect(result.valueInCurrency).toBe('300');
      expect(result.usd).toBe('225');
    });

    it('should calculate total estimated network fee correctly with no relayer fee', () => {
      const result = calcTotalEstimatedNetworkFee(mockGasFee, {
        amount: '0',
        valueInCurrency: undefined,
        usd: undefined,
      });

      expect(result.amount).toBe('0.1');
      expect(result.valueInCurrency).toBe('200');
      expect(result.usd).toBe('150');
    });
  });

  describe('calcAdjustedReturn', () => {
    const mockToAmount = {
      amount: '1000',
      valueInCurrency: '1000',
      usd: '750',
    };

    const mockNetworkFee = {
      amount: '48',
      valueInCurrency: '100',
      usd: '75',
    };

    const mockQuote = {
      feeData: {
        txFee: {
          asset: {
            assetId:
              'eip155:1/erc20:0x0000000000000000000000000000000000000000',
          },
        },
      },
      destAsset: {
        assetId: 'eip155:10/erc20:0x0000000000000000000000000000000000000000',
      },
    } as unknown as Quote;
    it('should calculate adjusted return correctly', () => {
      const result = calcAdjustedReturn(
        mockToAmount,
        mockNetworkFee,
        mockQuote,
      );

      expect(result.valueInCurrency).toBe('900');
      expect(result.usd).toBe('675');
    });

    it('should handle null values', () => {
      const result = calcAdjustedReturn(
        { amount: '1000', valueInCurrency: undefined, usd: undefined },
        mockNetworkFee,
        mockQuote,
      );

      expect(result.valueInCurrency).toBeUndefined();
      expect(result.usd).toBeUndefined();
    });
  });

  describe('calcCost', () => {
    const mockAdjustedReturn = {
      amount: '1000',
      valueInCurrency: '900',
      usd: '675',
    };

    const mockSentAmount = {
      amount: '100111',
      valueInCurrency: '1000',
      usd: '750',
    };

    it('should calculate cost correctly', () => {
      const result = calcCost(mockAdjustedReturn, mockSentAmount);

      expect(result.valueInCurrency).toBe('100');
      expect(result.usd).toBe('75');
    });

    it('should handle null values', () => {
      const result = calcCost(
        { valueInCurrency: undefined, usd: undefined },
        mockSentAmount,
      );

      expect(result.valueInCurrency).toBeUndefined();
      expect(result.usd).toBeUndefined();
    });
  });

  describe('calcSlippagePercentage', () => {
    it.each([
      ['100', undefined, '100', undefined, '0'],
      ['95', '95', '100', '100', '5'],
      ['98.3', '98.3', '100', '100', '1.7'],
      [undefined, '100', undefined, '100', '0'],
      [undefined, undefined, undefined, '100', null],
      ['105', '105', '100', '100', '5'],
    ])(
      'calcSlippagePercentage: calculate slippage absolute value for received amount %p, usd %p, sent amount %p, usd %p to expected slippage %p',
      (
        returnValueInCurrency: string | undefined,
        returnUsd: string | undefined,
        sentValueInCurrency: string | undefined,
        sentUsd: string | undefined,
        expectedSlippage: string | undefined | null,
      ) => {
        const result = calcSlippagePercentage(
          {
            valueInCurrency: returnValueInCurrency,
            usd: returnUsd,
          },
          {
            amount: '1000',
            valueInCurrency: sentValueInCurrency,
            usd: sentUsd,
          },
        );
        expect(result).toBe(expectedSlippage);
      },
    );

    it('should handle edge case with zero values', () => {
      const result = calcSlippagePercentage(
        { valueInCurrency: '0', usd: '0' },
        { amount: '100', valueInCurrency: '100', usd: '100' },
      );
      expect(result).toBe('100');
    });
  });

  describe('calcPriceImpact', () => {
    it('returns undefined when activeQuote is null', () => {
      expect(calcPriceImpact(null)).toBeUndefined();
    });

    it('returns undefined when activeQuote is undefined', () => {
      expect(calcPriceImpact(undefined)).toBeUndefined();
    });

    it('returns undefined when sentAmount.valueInCurrency is null', () => {
      expect(
        calcPriceImpact({
          sentAmount: { valueInCurrency: undefined },
          toTokenAmount: { valueInCurrency: '900' },
        }),
      ).toMatchInlineSnapshot(`
              {
                "usd": undefined,
                "valueInCurrency": undefined,
              }
          `);
    });

    it('returns undefined when toTokenAmount.valueInCurrency is undefined', () => {
      expect(
        calcPriceImpact({
          sentAmount: { valueInCurrency: '1000' },
          toTokenAmount: { valueInCurrency: undefined },
        }),
      ).toMatchInlineSnapshot(`
              {
                "usd": undefined,
                "valueInCurrency": undefined,
              }
          `);
    });

    it('returns undefined when sentAmount is missing', () => {
      expect(
        calcPriceImpact({
          sentAmount: {},
          toTokenAmount: { valueInCurrency: '900' },
        }),
      ).toMatchInlineSnapshot(`
              {
                "usd": undefined,
                "valueInCurrency": undefined,
              }
          `);
    });

    it('returns undefined when toTokenAmount is missing', () => {
      expect(
        calcPriceImpact({
          sentAmount: { valueInCurrency: '1000' },
          toTokenAmount: {},
        }),
      ).toMatchInlineSnapshot(`
              {
                "usd": undefined,
                "valueInCurrency": undefined,
              }
          `);
    });

    it('formats the absolute difference between source and destination fiat amounts', () => {
      const result = calcPriceImpact({
        sentAmount: { valueInCurrency: '1000', usd: '995.77' },
        toTokenAmount: { valueInCurrency: '995.77', usd: '1000' },
      });
      expect(result).toMatchInlineSnapshot(`
              {
                "usd": "4.23",
                "valueInCurrency": "4.23",
              }
          `);
    });

    it('uses the absolute value so a favourable quote does not produce a negative result', () => {
      const result = calcPriceImpact({
        sentAmount: { valueInCurrency: '900' },
        toTokenAmount: { valueInCurrency: '1000' },
      });
      expect(result).toMatchInlineSnapshot(`
              {
                "usd": undefined,
                "valueInCurrency": "100",
              }
          `);
    });

    it('handles string numeric inputs', () => {
      const result = calcPriceImpact({
        sentAmount: { valueInCurrency: '500.50', usd: '5' },
        toTokenAmount: { valueInCurrency: '496.27' },
      });
      expect(result).toMatchInlineSnapshot(`
              {
                "usd": undefined,
                "valueInCurrency": "4.23",
              }
          `);
    });

    it('handles numeric inputs', () => {
      const result = calcPriceImpact({
        sentAmount: { valueInCurrency: '1000', usd: '1.5' },
        toTokenAmount: { valueInCurrency: '10', usd: '2.49' },
      });
      expect(result).toMatchInlineSnapshot(`
              {
                "usd": "0.99",
                "valueInCurrency": "990",
              }
          `);
    });

    it('handles NaN inputs', () => {
      const result = calcPriceImpact({
        sentAmount: { valueInCurrency: 'a', usd: '-1.5' },
        toTokenAmount: { valueInCurrency: '10', usd: '2.49' },
      });
      expect(result).toMatchInlineSnapshot(`
              {
                "usd": "3.99",
                "valueInCurrency": undefined,
              }
          `);
    });
  });
});
