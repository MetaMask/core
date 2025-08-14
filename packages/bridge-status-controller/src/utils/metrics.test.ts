import { StatusTypes, FeeType, ActionTypes } from '@metamask/bridge-controller';
import {
  MetricsSwapType,
  MetricsActionType,
} from '@metamask/bridge-controller';
import type {
  TransactionMeta,
  TransactionError,
} from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';

import {
  getTxStatusesFromHistory,
  getFinalizedTxProperties,
  getRequestParamFromHistory,
  getTradeDataFromHistory,
  getRequestMetadataFromHistory,
  getEVMTxPropertiesFromTransactionMeta,
} from './metrics';
import type { BridgeHistoryItem } from '../types';

describe('metrics utils', () => {
  const mockHistoryItem: BridgeHistoryItem = {
    txMetaId: 'test-tx-id',
    quote: {
      srcChainId: 42161,
      destChainId: 10,
      srcAsset: {
        symbol: 'ETH',
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:42161/slip44:60',
        chainId: 42161,
        name: 'Ethereum',
        decimals: 18,
      },
      destAsset: {
        symbol: 'ETH',
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:10/slip44:60',
        chainId: 10,
        name: 'Ethereum',
        decimals: 18,
      },
      bridgeId: 'across',
      requestId: 'test-request-id',
      srcTokenAmount: '1000000000000000000',
      destTokenAmount: '990000000000000000',
      feeData: {
        [FeeType.METABRIDGE]: {
          amount: '10000000000000000',
          asset: {
            symbol: 'ETH',
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:42161/slip44:60',
            chainId: 42161,
            name: 'Ethereum',
            decimals: 18,
          },
        },
      },
      bridges: ['across'],
      steps: [
        {
          action: ActionTypes.BRIDGE,
          protocol: {
            name: 'across',
            displayName: 'Across',
            icon: 'across-icon',
          },
          srcAmount: '1000000000000000000',
          destAmount: '990000000000000000',
          srcAsset: {
            symbol: 'ETH',
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:42161/slip44:60',
            chainId: 42161,
            name: 'Ethereum',
            decimals: 18,
          },
          destAsset: {
            symbol: 'ETH',
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:10/slip44:60',
            chainId: 10,
            name: 'Ethereum',
            decimals: 18,
          },
          srcChainId: 42161,
          destChainId: 10,
        },
      ],
    },
    startTime: 1000,
    completionTime: 2000,
    estimatedProcessingTimeInSeconds: 900,
    slippagePercentage: 0.5,
    account: '0xaccount1',
    targetContractAddress: '0xtarget',
    pricingData: {
      amountSent: '1.234',
      amountSentInUsd: '2000',
      quotedGasInUsd: '2.54739',
      quotedReturnInUsd: '1980',
      quotedGasAmount: '0.00055',
    },
    status: {
      status: StatusTypes.COMPLETE,
      srcChain: {
        chainId: 42161,
        txHash: '0xsrcHash',
      },
      destChain: {
        chainId: 10,
        txHash: '0xdestHash',
        amount: '880000000000000000',
      },
    },
    hasApprovalTx: false,
    isStxEnabled: false,
  };

  describe('getTxStatusesFromHistory', () => {
    it('should return correct statuses for a completed transaction', () => {
      const result = getTxStatusesFromHistory(mockHistoryItem);
      expect(result).toStrictEqual({
        source_transaction: StatusTypes.COMPLETE,
        destination_transaction: StatusTypes.COMPLETE,
        approval_transaction: undefined,
        allowance_reset_transaction: undefined,
      });
    });

    it('should return correct statuses for a pending transaction', () => {
      const pendingHistoryItem = {
        ...mockHistoryItem,
        status: {
          status: StatusTypes.PENDING,
          srcChain: {
            chainId: 42161,
            txHash: '0xsrcHash',
          },
        },
      };
      const result = getTxStatusesFromHistory(pendingHistoryItem);
      expect(result).toStrictEqual({
        source_transaction: StatusTypes.COMPLETE,
        destination_transaction: StatusTypes.PENDING,
        approval_transaction: undefined,
        allowance_reset_transaction: undefined,
      });
    });

    it('should return correct statuses for a failed transaction', () => {
      const failedHistoryItem = {
        ...mockHistoryItem,
        status: {
          status: StatusTypes.FAILED,
          srcChain: {
            chainId: 42161,
            txHash: '0xsrcHash',
          },
        },
      };
      const result = getTxStatusesFromHistory(failedHistoryItem);
      expect(result).toStrictEqual({
        source_transaction: StatusTypes.COMPLETE,
        destination_transaction: StatusTypes.FAILED,
        approval_transaction: undefined,
        allowance_reset_transaction: undefined,
      });
    });

    it('should include approval transaction status when hasApprovalTx is true', () => {
      const historyWithApproval = {
        ...mockHistoryItem,
        hasApprovalTx: true,
      };
      const result = getTxStatusesFromHistory(historyWithApproval);
      expect(result.approval_transaction).toBe(StatusTypes.COMPLETE);
    });

    it('should handle transaction with no source transaction hash', () => {
      const noSrcTxHistoryItem = {
        ...mockHistoryItem,
        status: {
          status: StatusTypes.PENDING,
          srcChain: {
            chainId: 42161,
            txHash: undefined,
          },
        },
      };
      const result = getTxStatusesFromHistory(noSrcTxHistoryItem);
      expect(result.source_transaction).toBe(StatusTypes.PENDING);
    });

    it('should handle transaction with no destination chain', () => {
      const noDestChainHistoryItem = {
        ...mockHistoryItem,
        status: {
          status: StatusTypes.PENDING,
          srcChain: {
            chainId: 42161,
            txHash: '0xsrcHash',
          },
        },
      };
      const result = getTxStatusesFromHistory(noDestChainHistoryItem);
      expect(result.destination_transaction).toBe(StatusTypes.PENDING);
    });

    it('should handle transaction with unknown status', () => {
      const unknownStatusHistoryItem = {
        ...mockHistoryItem,
        status: {
          status: 'UNKNOWN' as StatusTypes,
          srcChain: {
            chainId: 42161,
            txHash: '0xsrcHash',
          },
        },
      };
      const result = getTxStatusesFromHistory(unknownStatusHistoryItem);
      expect(result.destination_transaction).toBe('PENDING');
    });
  });

  describe('getFinalizedTxProperties', () => {
    it('should calculate correct time and ratios for EVM bridge tx', () => {
      const result = getFinalizedTxProperties(
        {
          ...mockHistoryItem,
          pricingData: {
            amountSent: '3',
            amountSentInUsd: '2.999439',
            quotedGasInUsd: '0.00023762029936118124',
            quotedReturnInUsd: '2.89114367789257129',
            quotedGasAmount: '5.1901652883e-8',
          },
        },
        {
          type: TransactionType.bridge,
          txReceipt: {
            gasUsed: '0x2c92a',
            effectiveGasPrice: '0x1880a',
          },
        } as never,
      );
      expect(result).toMatchInlineSnapshot(`
        Object {
          "actual_time_minutes": 0.016666666666666666,
          "quote_vs_execution_ratio": 1.1251337476231986,
          "quoted_vs_used_gas_ratio": 2.8325818363563227,
          "usd_actual_gas": "0.0000838882380418152",
          "usd_actual_return": 2.5696,
        }
      `);
    });

    it('should calculate correct time and ratios for swap to ETH tx', () => {
      const result = getFinalizedTxProperties(
        {
          ...mockHistoryItem,
          account: '0x30e8ccad5a980bdf30447f8c2c48e70989d9d294',
          quote: {
            ...mockHistoryItem.quote,
            destTokenAmount: '635621722151236',
            destAsset: {
              ...mockHistoryItem.quote.destAsset,
              address: '0x0000000000000000000000000000000000000000',
              decimals: 18,
            },
          },
          pricingData: {
            amountSent: '3',
            amountSentInUsd: '2.999439',
            quotedGasInUsd: '0.00034411818110125904',
            quotedReturnInUsd: '2.91005421809056075408',
            quotedGasAmount: '7.5163201268e-8',
          },
        },
        {
          type: TransactionType.swap,
          postTxBalance: '0x10879421cc05e3',
          preTxBalance: '0xe39c0e2d7de7e',
          txReceipt: { gasUsed: '0x57b05', effectiveGasPrice: '0x1880a' },
        } as never,
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actual_time_minutes": 0.016666666666666666,
          "quote_vs_execution_ratio": 0.9801662314040546,
          "quoted_vs_used_gas_ratio": 2.0851258834973363,
          "usd_actual_gas": "0.00016503472707560328",
          "usd_actual_return": 2.968939476645719,
        }
      `);
    });

    it('should calculate correct time and ratios for swap to ERC0 tx', () => {
      const result = getFinalizedTxProperties(
        {
          ...mockHistoryItem,
          account: '0x30e8ccad5a980bdf30447f8c2c48e70989d9d294',
          quote: {
            ...mockHistoryItem.quote,
            destTokenAmount: '8902512',
            destAsset: {
              ...mockHistoryItem.quote.destAsset,
              address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
              decimals: 6,
            },
          },
          pricingData: {
            amountSent: '0.002',
            amountSentInUsd: '9.15656',
            quotedGasInUsd: '0.00021894522672048096',
            quotedReturnInUsd: '8.900847230256',
            quotedGasAmount: '4.7822594232e-8',
          },
        },
        {
          type: TransactionType.swap,
          txReceipt: {
            logs: [
              {
                address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                data: '0x00000000000000000000000000000000000000000000000000000000008a9d24',
                topics: [
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                  '0x0000000000000000000000009a13f98cb987694c9f086b1f5eb990eea8264ec3',
                  '0x0000000000000000000000000a2854fbbd9b3ef66f17d47284e7f899b9509330',
                ],
              },
              {
                address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                data: '0x00000000000000000000000000000000000000000000000000000000008a9d24',
                topics: [
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                  '0x0000000000000000000000000a2854fbbd9b3ef66f17d47284e7f899b9509330',
                  '0x00000000000000000000000030e8ccad5a980bdf30447f8c2c48e70989d9d294',
                ],
              },
            ],
            gasUsed: '0x2c92a',
            effectiveGasPrice: '0x1880a',
          },
        } as never,
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actual_time_minutes": 0.016666666666666666,
          "quote_vs_execution_ratio": 0.9799999911934969,
          "quoted_vs_used_gas_ratio": 2.6099633492283485,
          "usd_actual_gas": "0.0000838882380418152",
          "usd_actual_return": 9.082497255348,
        }
      `);
    });

    it('should calculate correct time and ratios for swap to ERC0 tx, incomplete pricingData', () => {
      const result = getFinalizedTxProperties(
        {
          ...mockHistoryItem,
          account: '0x30e8ccad5a980bdf30447f8c2c48e70989d9d294',
          quote: {
            ...mockHistoryItem.quote,
            destTokenAmount: '8902512',
            destAsset: {
              ...mockHistoryItem.quote.destAsset,
              address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
              decimals: 6,
            },
          },
          pricingData: {
            amountSent: '0.002',
            amountSentInUsd: '9.15656',
            quotedGasInUsd: '0.00021894522672048096',
            quotedGasAmount: '4.7822594232e-8',
          },
        },
        {
          type: TransactionType.swap,
          txReceipt: {
            logs: [
              {
                address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                data: '0x00000000000000000000000000000000000000000000000000000000008a9d24',
                topics: [
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                  '0x0000000000000000000000009a13f98cb987694c9f086b1f5eb990eea8264ec3',
                  '0x0000000000000000000000000a2854fbbd9b3ef66f17d47284e7f899b9509330',
                ],
              },
              {
                address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                data: '0x00000000000000000000000000000000000000000000000000000000008a9d24',
                topics: [
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                  '0x0000000000000000000000000a2854fbbd9b3ef66f17d47284e7f899b9509330',
                  '0x00000000000000000000000030e8ccad5a980bdf30447f8c2c48e70989d9d294',
                ],
              },
            ],
            gasUsed: '0x2c92a',
            effectiveGasPrice: '0x1880a',
          },
        } as never,
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actual_time_minutes": 0.016666666666666666,
          "quote_vs_execution_ratio": 0,
          "quoted_vs_used_gas_ratio": 2.6099633492283485,
          "usd_actual_gas": "0.0000838882380418152",
          "usd_actual_return": 0,
        }
      `);
    });

    it('should calculate correct time and ratios for swap to ETH tx, missing preTxBalance', () => {
      const result = getFinalizedTxProperties(
        {
          ...mockHistoryItem,
          account: '0x30e8ccad5a980bdf30447f8c2c48e70989d9d294',
          quote: {
            ...mockHistoryItem.quote,
            destTokenAmount: '635621722151236',
            destAsset: {
              ...mockHistoryItem.quote.destAsset,
              address: '0x0000000000000000000000000000000000000000',
              decimals: 18,
            },
          },
          pricingData: {
            amountSent: '3',
            amountSentInUsd: '2.999439',
            quotedGasInUsd: '0.00034411818110125904',
            quotedReturnInUsd: '2.91005421809056075408',
            quotedGasAmount: '7.5163201268e-8',
          },
        },
        {
          type: TransactionType.swap,
          postTxBalance: '0x10879421cc05e3',
          txReceipt: { gasUsed: '0x57b05', effectiveGasPrice: '0x1880a' },
        } as never,
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actual_time_minutes": 0.016666666666666666,
          "quote_vs_execution_ratio": 1,
          "quoted_vs_used_gas_ratio": 2.0851258834973363,
          "usd_actual_gas": "0.00016503472707560328",
          "usd_actual_return": 2.910054218090561,
        }
      `);
    });

    it('should calculate correct time and ratios for swap to ERC0 tx with 0x0 status', () => {
      const result = getFinalizedTxProperties(
        {
          ...mockHistoryItem,
          account: '0x30e8ccad5a980bdf30447f8c2c48e70989d9d294',
          quote: {
            ...mockHistoryItem.quote,
            destTokenAmount: '8902512',
            destAsset: {
              ...mockHistoryItem.quote.destAsset,
              address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
              decimals: 6,
            },
          },
          pricingData: {
            amountSent: '0.002',
            amountSentInUsd: '9.15656',
            quotedGasInUsd: '0.00021894522672048096',
            quotedReturnInUsd: '8.900847230256',
            quotedGasAmount: '4.7822594232e-8',
          },
        },
        {
          type: TransactionType.swap,
          txReceipt: {
            status: '0x0',
            logs: [
              {
                address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                data: '0x00000000000000000000000000000000000000000000000000000000008a9d24',
                topics: [
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                  '0x0000000000000000000000009a13f98cb987694c9f086b1f5eb990eea8264ec3',
                  '0x0000000000000000000000000a2854fbbd9b3ef66f17d47284e7f899b9509330',
                ],
              },
              {
                address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                data: '0x00000000000000000000000000000000000000000000000000000000008a9d24',
                topics: [
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                  '0x0000000000000000000000000a2854fbbd9b3ef66f17d47284e7f899b9509330',
                  '0x00000000000000000000000030e8ccad5a980bdf30447f8c2c48e70989d9d294',
                ],
              },
            ],
            gasUsed: '0x2c92a',
            effectiveGasPrice: '0x1880a',
          },
        } as never,
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actual_time_minutes": 0.016666666666666666,
          "quote_vs_execution_ratio": 0,
          "quoted_vs_used_gas_ratio": 2.6099633492283485,
          "usd_actual_gas": "0.0000838882380418152",
          "usd_actual_return": 0,
        }
      `);
    });

    it('should calculate correct time and ratios for swap to ERC0 tx with incomplete log data', () => {
      const result = getFinalizedTxProperties(
        {
          ...mockHistoryItem,
          account: '0x30e8ccad5a980bdf30447f8c2c48e70989d9d294',
          quote: {
            ...mockHistoryItem.quote,
            destTokenAmount: '8902512',
            destAsset: {
              ...mockHistoryItem.quote.destAsset,
              address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
              decimals: 6,
            },
          },
          pricingData: {
            amountSent: '0.002',
            amountSentInUsd: '9.15656',
            quotedGasInUsd: '0.00021894522672048096',
            quotedReturnInUsd: '8.900847230256',
            quotedGasAmount: '4.7822594232e-8',
          },
        },
        {
          type: TransactionType.swap,
          txReceipt: {
            logs: [],
            gasUsed: '0x2c92a',
            effectiveGasPrice: '0x1880a',
          },
        } as never,
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actual_time_minutes": 0.016666666666666666,
          "quote_vs_execution_ratio": 0,
          "quoted_vs_used_gas_ratio": 2.6099633492283485,
          "usd_actual_gas": "0.0000838882380418152",
          "usd_actual_return": 0,
        }
      `);
    });

    it('should calculate correct time and ratios for swap tx without txMeta', () => {
      const result = getFinalizedTxProperties(
        {
          ...mockHistoryItem,
          account: '0x30e8ccad5a980bdf30447f8c2c48e70989d9d294',
          quote: {
            ...mockHistoryItem.quote,
            destTokenAmount: '8902512',
            destAsset: {
              ...mockHistoryItem.quote.destAsset,
              address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
              decimals: 6,
            },
          },
          pricingData: {
            amountSent: '0.002',
            amountSentInUsd: '9.15656',
            quotedGasInUsd: '0.00021894522672048096',
            quotedReturnInUsd: '8.900847230256',
            quotedGasAmount: '4.7822594232e-8',
          },
        },
        { type: TransactionType.swap } as never,
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actual_time_minutes": 0.016666666666666666,
          "quote_vs_execution_ratio": 0,
          "quoted_vs_used_gas_ratio": 0,
          "usd_actual_gas": 0,
          "usd_actual_return": 0,
        }
      `);
    });

    it('should calculate correct time and ratios for Solana tx', () => {
      const result = getFinalizedTxProperties({
        ...mockHistoryItem,
        pricingData: {
          amountSent: '3',
          amountSentInUsd: '2.999439',
          quotedGasInUsd: '0.00023762029936118124',
          quotedReturnInUsd: '2.89114367789257129',
          quotedGasAmount: '5.1901652883e-8',
        },
      });
      expect(result).toMatchInlineSnapshot(`
        Object {
          "actual_time_minutes": 0.016666666666666666,
          "quote_vs_execution_ratio": 1.1251337476231986,
          "quoted_vs_used_gas_ratio": 0,
          "usd_actual_gas": 0,
          "usd_actual_return": 2.5696,
        }
      `);
    });

    it('should handle missing completion time', () => {
      const incompleteHistoryItem = {
        ...mockHistoryItem,
        completionTime: undefined,
      };
      const result = getFinalizedTxProperties(incompleteHistoryItem);
      expect(result.actual_time_minutes).toBe(0);
    });

    it('should handle missing start time', () => {
      const noStartTimeHistoryItem = {
        ...mockHistoryItem,
        startTime: undefined,
      };
      const result = getFinalizedTxProperties(noStartTimeHistoryItem);
      expect(result.actual_time_minutes).toBe(0);
    });

    it('should handle missing pricing data', () => {
      const noPricingDataHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: '0',
          quotedGasInUsd: '0',
          quotedReturnInUsd: '0',
        },
      };
      const result = getFinalizedTxProperties(noPricingDataHistoryItem);
      expect(result.usd_actual_return).toBe(0);
      expect(result.usd_actual_gas).toBe(0);
    });

    it('should handle missing quoted return in USD', () => {
      const noQuotedReturnHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: '2000',
          quotedGasInUsd: '10',
          quotedReturnInUsd: '0',
        },
      };
      const result = getFinalizedTxProperties(noQuotedReturnHistoryItem);
      expect(result.usd_actual_return).toBe(0);
    });

    it('should handle missing quoted gas in USD', () => {
      const noQuotedGasHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: '2000',
          quotedGasInUsd: '0',
          quotedReturnInUsd: '1980',
        },
      };
      const result = getFinalizedTxProperties(noQuotedGasHistoryItem);
      expect(result.usd_actual_gas).toBe(0);
    });
  });

  describe('getRequestParamFromHistory', () => {
    it('should return correct request parameters', () => {
      const result = getRequestParamFromHistory(mockHistoryItem);
      expect(result).toStrictEqual({
        chain_id_source: 'eip155:42161',
        token_symbol_source: 'ETH',
        token_address_source: 'eip155:42161/slip44:60',
        chain_id_destination: 'eip155:10',
        token_symbol_destination: 'ETH',
        token_address_destination: 'eip155:10/slip44:60',
      });
    });

    it('should handle different token symbols', () => {
      const differentTokensHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        quote: {
          ...mockHistoryItem.quote,
          srcAsset: {
            ...mockHistoryItem.quote.srcAsset,
            symbol: 'USDC',
            assetId:
              'eip155:42161/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const,
          },
          destAsset: {
            ...mockHistoryItem.quote.destAsset,
            symbol: 'USDT',
            assetId:
              'eip155:10/erc20:0x94b008aa00579c1307b0ef2c499ad98a8ce58e58' as const,
          },
        },
      };
      const result = getRequestParamFromHistory(differentTokensHistoryItem);
      expect(result.token_symbol_source).toBe('USDC');
      expect(result.token_symbol_destination).toBe('USDT');
      expect(result.token_address_source).toBe(
        'eip155:42161/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      );
      expect(result.token_address_destination).toBe(
        'eip155:10/erc20:0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
      );
    });
  });

  describe('getTradeDataFromHistory', () => {
    it('should return correct trade data', () => {
      const result = getTradeDataFromHistory(mockHistoryItem);
      expect(result).toMatchInlineSnapshot(`
        Object {
          "gas_included": false,
          "provider": "across_across",
          "quoted_time_minutes": 15,
          "usd_quoted_gas": 2.54739,
          "usd_quoted_return": 1980,
        }
      `);
    });

    it('should handle missing pricing data', () => {
      const noPricingDataHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: '0',
          quotedGasInUsd: '0',
          quotedReturnInUsd: '0',
        },
      };
      const result = getTradeDataFromHistory(noPricingDataHistoryItem);
      expect(result.usd_quoted_gas).toBe(0);
      expect(result.usd_quoted_return).toBe(0);
    });

    it('should handle missing quoted gas in USD', () => {
      const noQuotedGasHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: '2000',
          quotedGasInUsd: '0',
          quotedReturnInUsd: '1980',
        },
      };
      const result = getTradeDataFromHistory(noQuotedGasHistoryItem);
      expect(result.usd_quoted_gas).toBe(0);
    });

    it('should handle missing quoted return in USD', () => {
      const noQuotedReturnHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: '2000',
          quotedGasInUsd: '10',
          quotedReturnInUsd: '0',
        },
      };
      const result = getTradeDataFromHistory(noQuotedReturnHistoryItem);
      expect(result.usd_quoted_return).toBe(0);
    });

    it('should handle different bridge providers', () => {
      const differentProviderHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        quote: {
          ...mockHistoryItem.quote,
          bridgeId: 'stargate',
          steps: [
            {
              ...mockHistoryItem.quote.steps[0],
              protocol: {
                name: 'stargate',
                displayName: 'Stargate',
                icon: 'stargate-icon',
              },
            },
          ],
        },
      };
      const result = getTradeDataFromHistory(differentProviderHistoryItem);
      expect(result.provider).toBe('stargate_across');
    });
  });

  describe('getRequestMetadataFromHistory', () => {
    it('should return correct request metadata', () => {
      const result = getRequestMetadataFromHistory(mockHistoryItem);
      expect(result).toStrictEqual({
        slippage_limit: 0.5,
        custom_slippage: true,
        security_warnings: [],
        usd_amount_source: 2000,
        swap_type: 'crosschain',
        is_hardware_wallet: false,
        stx_enabled: false,
      });
    });

    it('should handle hardware wallet account', () => {
      const hardwareWalletAccount = {
        id: 'test-account',
        type: 'eip155:eoa' as const,
        address: '0xaccount1',
        options: {},
        metadata: {
          name: 'Test Account',
          importTime: 1234567890,
          keyring: {
            type: 'Ledger Hardware',
          },
        },
        scopes: [],
        methods: [],
      };
      const result = getRequestMetadataFromHistory(
        mockHistoryItem,
        hardwareWalletAccount,
      );
      expect(result.is_hardware_wallet).toBe(true);
    });

    it('should handle missing pricing data', () => {
      const noPricingDataHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: '0',
          quotedGasInUsd: '0',
          quotedReturnInUsd: '0',
        },
      };
      const result = getRequestMetadataFromHistory(noPricingDataHistoryItem);
      expect(result.usd_amount_source).toBe(0);
    });

    it('should handle missing amount sent in USD', () => {
      const noAmountSentHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: '0',
          quotedGasInUsd: '10',
          quotedReturnInUsd: '1980',
        },
      };
      const result = getRequestMetadataFromHistory(noAmountSentHistoryItem);
      expect(result.usd_amount_source).toBe(0);
    });

    it('should handle different slippage percentages', () => {
      const defaultSlippageHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        slippagePercentage: 0.1,
      };
      const result = getRequestMetadataFromHistory(defaultSlippageHistoryItem);
      expect(result.slippage_limit).toBe(0.1);
      expect(result.custom_slippage).toBe(true);
    });

    it('should handle STX enabled', () => {
      const stxEnabledHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        isStxEnabled: true,
      };
      const result = getRequestMetadataFromHistory(stxEnabledHistoryItem);
      expect(result.stx_enabled).toBe(true);
    });

    it('should handle different swap types', () => {
      // Same chain swap
      const sameChainHistoryItem: BridgeHistoryItem = {
        ...mockHistoryItem,
        quote: {
          ...mockHistoryItem.quote,
          srcChainId: 1,
          destChainId: 1,
        },
      };
      const sameChainResult =
        getRequestMetadataFromHistory(sameChainHistoryItem);
      expect(sameChainResult.swap_type).toBe('single_chain');

      // Cross chain swap (already tested in the main test)
      expect(mockHistoryItem.quote.srcChainId).not.toBe(
        mockHistoryItem.quote.destChainId,
      );
    });
  });

  describe('getEVMSwapTxPropertiesFromTransactionMeta', () => {
    const mockTransactionMeta: TransactionMeta = {
      id: 'test-tx-id',
      networkClientId: 'test-network',
      status: 'submitted' as TransactionStatus,
      time: 1234567890,
      txParams: {
        from: '0x123',
        to: '0x456',
        value: '0x0',
      },
      chainId: '0x1',
      sourceTokenSymbol: 'ETH',
      destinationTokenSymbol: 'USDC',
      sourceTokenAddress: '0x0000000000000000000000000000000000000000',
      destinationTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      type: TransactionType.swap,
    };

    it('should return correct properties for a successful swap transaction', () => {
      const result = getEVMTxPropertiesFromTransactionMeta(mockTransactionMeta);
      expect(result).toStrictEqual({
        error_message: undefined,
        chain_id_source: 'eip155:1',
        chain_id_destination: 'eip155:1',
        token_symbol_source: 'ETH',
        token_symbol_destination: 'USDC',
        usd_amount_source: 100,
        source_transaction: 'COMPLETE',
        stx_enabled: false,
        token_address_source: 'eip155:1/slip44:60',
        token_address_destination:
          'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        custom_slippage: false,
        is_hardware_wallet: false,
        swap_type: MetricsSwapType.SINGLE,
        security_warnings: [],
        price_impact: 0,
        usd_quoted_gas: 0,
        gas_included: false,
        quoted_time_minutes: 0,
        usd_quoted_return: 0,
        provider: '',
        actual_time_minutes: 0,
        quote_vs_execution_ratio: 0,
        quoted_vs_used_gas_ratio: 0,
        usd_actual_return: 0,
        usd_actual_gas: 0,
        action_type: MetricsActionType.SWAPBRIDGE_V1,
      });
    });

    it('should handle failed transaction with error message', () => {
      const failedTransactionMeta: TransactionMeta = {
        ...mockTransactionMeta,
        status: TransactionStatus.failed,
        error: {
          message: 'Transaction failed',
          name: 'Error',
        } as TransactionError,
      };
      const result = getEVMTxPropertiesFromTransactionMeta(
        failedTransactionMeta,
      );
      expect(result.error_message).toBe('Failed to finalize swap tx');
      expect(result.source_transaction).toBe('FAILED');
    });

    it('should handle missing token symbols', () => {
      const noSymbolsTransactionMeta: TransactionMeta = {
        ...mockTransactionMeta,
        sourceTokenSymbol: undefined,
        destinationTokenSymbol: undefined,
      };
      const result = getEVMTxPropertiesFromTransactionMeta(
        noSymbolsTransactionMeta,
      );
      expect(result.token_symbol_source).toBe('');
      expect(result.token_symbol_destination).toBe('');
    });

    it('should handle missing token addresses', () => {
      const noAddressesTransactionMeta: TransactionMeta = {
        ...mockTransactionMeta,
        sourceTokenAddress: undefined,
        destinationTokenAddress: undefined,
      };
      const result = getEVMTxPropertiesFromTransactionMeta(
        noAddressesTransactionMeta,
      );
      expect(result.token_address_source).toBe('eip155:1/slip44:60');
      expect(result.token_address_destination).toBe('eip155:1/slip44:60');
    });

    it('should handle crosschain swap type', () => {
      const crosschainTransactionMeta: TransactionMeta = {
        ...mockTransactionMeta,
        type: TransactionType.swap,
      };
      const result = getEVMTxPropertiesFromTransactionMeta(
        crosschainTransactionMeta,
      );
      expect(result.swap_type).toBe(MetricsSwapType.SINGLE);
    });
  });
});
