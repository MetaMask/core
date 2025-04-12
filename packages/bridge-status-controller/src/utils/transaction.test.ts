import {
  formatChainIdToHex,
  type QuoteMetadata,
  type QuoteResponse,
  ChainId,
  FeeType,
} from '@metamask/bridge-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';

import {
  getStatusRequestParams,
  getTxMetaFields,
  handleSolanaTxResponse,
} from './transaction';

describe('Bridge Status Controller Transaction Utils', () => {
  describe('getStatusRequestParams', () => {
    it('should extract status request parameters from a quote response', () => {
      const mockQuoteResponse: QuoteResponse = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.ETH,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'ETH',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000000000000',
            },
          },
          refuel: false,
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: 21000,
        },
      } as never;

      const result = getStatusRequestParams(mockQuoteResponse);

      expect(result).toStrictEqual({
        bridgeId: 'bridge1',
        bridge: 'bridge1',
        srcChainId: ChainId.ETH,
        destChainId: ChainId.POLYGON,
        quote: mockQuoteResponse.quote,
        refuel: false,
      });
    });

    it('should handle quote with refuel flag set to true', () => {
      const mockQuoteResponse: QuoteResponse = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.ETH,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'ETH',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000000000000',
            },
          },
          refuel: true,
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
      } as never;

      const result = getStatusRequestParams(mockQuoteResponse);

      expect(result.refuel).toBe(true);
    });

    it('should handle quote with multiple bridges', () => {
      const mockQuoteResponse: QuoteResponse = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1', 'bridge2'],
          srcChainId: ChainId.ETH,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'ETH',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000000000000',
            },
          },
          refuel: false,
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
      } as never;

      const result = getStatusRequestParams(mockQuoteResponse);

      expect(result.bridge).toBe('bridge1'); // Should take the first bridge
    });
  });

  describe('getTxMetaFields', () => {
    it('should extract transaction meta fields from a quote response', () => {
      const mockQuoteResponse: QuoteResponse & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.ETH,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'ETH',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000000000000',
            },
          },
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
        // QuoteMetadata fields
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '1800',
          usd: '1800',
        },
        toTokenAmount: {
          amount: '2.0',
          valueInCurrency: '3600',
          usd: '3600',
        },
        swapRate: '2.0',
        totalNetworkFee: {
          amount: '0.1',
          valueInCurrency: '180',
          usd: '180',
        },
        totalMaxNetworkFee: {
          amount: '0.15',
          valueInCurrency: '270',
          usd: '270',
        },
        gasFee: {
          amount: '0.05',
          valueInCurrency: '90',
          usd: '90',
        },
        adjustedReturn: {
          valueInCurrency: '3420',
          usd: '3420',
        },
        cost: {
          valueInCurrency: '0.1',
          usd: '0.1',
        },
      } as never;

      const result = getTxMetaFields(mockQuoteResponse);

      expect(result).toStrictEqual({
        destinationChainId: formatChainIdToHex(ChainId.POLYGON),
        sourceTokenAmount: '1000000000000000000',
        sourceTokenSymbol: 'ETH',
        sourceTokenDecimals: 18,
        sourceTokenAddress: '0x0000000000000000000000000000000000000000',
        destinationTokenAmount: '2000000000000000000',
        destinationTokenSymbol: 'MATIC',
        destinationTokenDecimals: 18,
        destinationTokenAddress: '0x0000000000000000000000000000000000000000',
        approvalTxId: undefined,
        swapTokenValue: '1.0',
        isBridgeTx: true,
      });
    });

    it('should include approvalTxId when provided', () => {
      const mockQuoteResponse: QuoteResponse & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.ETH,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'ETH',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000000000000',
            },
          },
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
        // QuoteMetadata fields
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '1800',
          usd: '1800',
        },
        toTokenAmount: {
          amount: '2.0',
          valueInCurrency: '3600',
          usd: '3600',
        },
        swapRate: '2.0',
        totalNetworkFee: {
          amount: '0.1',
          valueInCurrency: '180',
          usd: '180',
        },
        totalMaxNetworkFee: {
          amount: '0.15',
          valueInCurrency: '270',
          usd: '270',
        },
        gasFee: {
          amount: '0.05',
          valueInCurrency: '90',
          usd: '90',
        },
        adjustedReturn: {
          valueInCurrency: '3420',
          usd: '3420',
        },
        cost: {
          valueInCurrency: '0.1',
          usd: '0.1',
        },
      } as never;

      const approvalTxId = '0x1234567890abcdef';
      const result = getTxMetaFields(mockQuoteResponse, approvalTxId);

      expect(result.approvalTxId).toBe(approvalTxId);
    });
  });

  describe('handleSolanaTxResponse', () => {
    it('should handle string response format', () => {
      const mockQuoteResponse: QuoteResponse & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: 'solanaNativeAddress',
            decimals: 9,
            symbol: 'SOL',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000',
            },
          },
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
        solanaFeesInLamports: '5000',
        // QuoteMetadata fields
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '100',
          usd: '100',
        },
        toTokenAmount: {
          amount: '2.0',
          valueInCurrency: '3600',
          usd: '3600',
        },
        swapRate: '2.0',
        totalNetworkFee: {
          amount: '0.1',
          valueInCurrency: '10',
          usd: '10',
        },
        totalMaxNetworkFee: {
          amount: '0.15',
          valueInCurrency: '15',
          usd: '15',
        },
        gasFee: {
          amount: '0.05',
          valueInCurrency: '5',
          usd: '5',
        },
        adjustedReturn: {
          valueInCurrency: '3585',
          usd: '3585',
        },
        cost: {
          valueInCurrency: '0.1',
          usd: '0.1',
        },
      } as never;

      const signature = 'solanaSignature123';
      const snapId = 'snapId123';
      const selectedAccountAddress = 'solanaAccountAddress123';

      const result = handleSolanaTxResponse(
        signature,
        mockQuoteResponse,
        snapId,
        selectedAccountAddress,
      );

      expect(result).toMatchObject({
        id: expect.any(String),
        chainId: formatChainIdToHex(ChainId.SOLANA),
        txParams: { from: selectedAccountAddress },
        type: TransactionType.bridge,
        status: TransactionStatus.submitted,
        hash: signature,
        isSolana: true,
        isBridgeTx: true,
        origin: snapId,
        destinationChainId: formatChainIdToHex(ChainId.POLYGON),
        sourceTokenAmount: '1000000000',
        sourceTokenSymbol: 'SOL',
        sourceTokenDecimals: 9,
        sourceTokenAddress: 'solanaNativeAddress',
        destinationTokenAmount: '2000000000000000000',
        destinationTokenSymbol: 'MATIC',
        destinationTokenDecimals: 18,
        destinationTokenAddress: '0x0000000000000000000000000000000000000000',
        swapTokenValue: '1.0',
      });
    });

    it('should handle object response format with signature', () => {
      const mockQuoteResponse: QuoteResponse & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: 'solanaNativeAddress',
            decimals: 9,
            symbol: 'SOL',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000',
            },
          },
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
        solanaFeesInLamports: '5000',
        // QuoteMetadata fields
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '100',
          usd: '100',
        },
        toTokenAmount: {
          amount: '2.0',
          valueInCurrency: '3600',
          usd: '3600',
        },
        swapRate: '2.0',
        totalNetworkFee: {
          amount: '0.1',
          valueInCurrency: '10',
          usd: '10',
        },
        totalMaxNetworkFee: {
          amount: '0.15',
          valueInCurrency: '15',
          usd: '15',
        },
        gasFee: {
          amount: '0.05',
          valueInCurrency: '5',
          usd: '5',
        },
        adjustedReturn: {
          valueInCurrency: '3585',
          usd: '3585',
        },
        cost: {
          valueInCurrency: '0.1',
          usd: '0.1',
        },
      } as never;

      const snapResponse = {
        result: {
          signature: 'solanaSignature123',
        },
      };
      const snapId = 'snapId123';
      const selectedAccountAddress = 'solanaAccountAddress123';

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        snapId,
        selectedAccountAddress,
      );

      expect(result.hash).toBe('solanaSignature123');
    });

    it('should handle object response format with txid', () => {
      const mockQuoteResponse: QuoteResponse & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: 'solanaNativeAddress',
            decimals: 9,
            symbol: 'SOL',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000',
            },
          },
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
        solanaFeesInLamports: '5000',
        // QuoteMetadata fields
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '100',
          usd: '100',
        },
        toTokenAmount: {
          amount: '2.0',
          valueInCurrency: '3600',
          usd: '3600',
        },
        swapRate: '2.0',
        totalNetworkFee: {
          amount: '0.1',
          valueInCurrency: '10',
          usd: '10',
        },
        totalMaxNetworkFee: {
          amount: '0.15',
          valueInCurrency: '15',
          usd: '15',
        },
        gasFee: {
          amount: '0.05',
          valueInCurrency: '5',
          usd: '5',
        },
        adjustedReturn: {
          valueInCurrency: '3585',
          usd: '3585',
        },
        cost: {
          valueInCurrency: '0.1',
          usd: '0.1',
        },
      } as never;

      const snapResponse = {
        result: {
          txid: 'solanaTxId123',
        },
      };
      const snapId = 'snapId123';
      const selectedAccountAddress = 'solanaAccountAddress123';

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        snapId,
        selectedAccountAddress,
      );

      expect(result.hash).toBe('solanaTxId123');
    });

    it('should handle object response format with hash', () => {
      const mockQuoteResponse: QuoteResponse & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: 'solanaNativeAddress',
            decimals: 9,
            symbol: 'SOL',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000',
            },
          },
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
        solanaFeesInLamports: '5000',
        // QuoteMetadata fields
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '100',
          usd: '100',
        },
        toTokenAmount: {
          amount: '2.0',
          valueInCurrency: '3600',
          usd: '3600',
        },
        swapRate: '2.0',
        totalNetworkFee: {
          amount: '0.1',
          valueInCurrency: '10',
          usd: '10',
        },
        totalMaxNetworkFee: {
          amount: '0.15',
          valueInCurrency: '15',
          usd: '15',
        },
        gasFee: {
          amount: '0.05',
          valueInCurrency: '5',
          usd: '5',
        },
        adjustedReturn: {
          valueInCurrency: '3585',
          usd: '3585',
        },
        cost: {
          valueInCurrency: '0.1',
          usd: '0.1',
        },
      } as never;

      const snapResponse = {
        result: {
          hash: 'solanaHash123',
        },
      };
      const snapId = 'snapId123';
      const selectedAccountAddress = 'solanaAccountAddress123';

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        snapId,
        selectedAccountAddress,
      );

      expect(result.hash).toBe('solanaHash123');
    });

    it('should handle object response format with txHash', () => {
      const mockQuoteResponse: QuoteResponse & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: 'solanaNativeAddress',
            decimals: 9,
            symbol: 'SOL',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000',
            },
          },
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
        solanaFeesInLamports: '5000',
        // QuoteMetadata fields
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '100',
          usd: '100',
        },
        toTokenAmount: {
          amount: '2.0',
          valueInCurrency: '3600',
          usd: '3600',
        },
        swapRate: '2.0',
        totalNetworkFee: {
          amount: '0.1',
          valueInCurrency: '10',
          usd: '10',
        },
        totalMaxNetworkFee: {
          amount: '0.15',
          valueInCurrency: '15',
          usd: '15',
        },
        gasFee: {
          amount: '0.05',
          valueInCurrency: '5',
          usd: '5',
        },
        adjustedReturn: {
          valueInCurrency: '3585',
          usd: '3585',
        },
        cost: {
          valueInCurrency: '0.1',
          usd: '0.1',
        },
      } as never;

      const snapResponse = {
        result: {
          txHash: 'solanaTxHash123',
        },
      };
      const snapId = 'snapId123';
      const selectedAccountAddress = 'solanaAccountAddress123';

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        snapId,
        selectedAccountAddress,
      );

      expect(result.hash).toBe('solanaTxHash123');
    });

    it('should handle empty or invalid response', () => {
      const mockQuoteResponse: QuoteResponse & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          srcAsset: {
            address: 'solanaNativeAddress',
            decimals: 9,
            symbol: 'SOL',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'MATIC',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '100000000',
            },
          },
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x0',
          gasLimit: '21000',
        },
        approval: {
          gasLimit: '46000',
        },
        solanaFeesInLamports: '5000',
        // QuoteMetadata fields
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '100',
          usd: '100',
        },
        toTokenAmount: {
          amount: '2.0',
          valueInCurrency: '3600',
          usd: '3600',
        },
        swapRate: '2.0',
        totalNetworkFee: {
          amount: '0.1',
          valueInCurrency: '10',
          usd: '10',
        },
        totalMaxNetworkFee: {
          amount: '0.15',
          valueInCurrency: '15',
          usd: '15',
        },
        gasFee: {
          amount: '0.05',
          valueInCurrency: '5',
          usd: '5',
        },
        adjustedReturn: {
          valueInCurrency: '3585',
          usd: '3585',
        },
        cost: {
          valueInCurrency: '0.1',
          usd: '0.1',
        },
      } as never;

      const snapResponse = { result: {} } as { result: Record<string, string> };
      const snapId = 'snapId123';
      const selectedAccountAddress = 'solanaAccountAddress123';

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        snapId,
        selectedAccountAddress,
      );

      expect(result.hash).toBeUndefined();
    });
  });
});
