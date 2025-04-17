import type { QuoteResponse, TxData } from '@metamask/bridge-controller';
import { ChainId } from '@metamask/bridge-controller';
import {
  formatChainIdToHex,
  type QuoteMetadata,
  FeeType,
  formatChainIdToCaip,
} from '@metamask/bridge-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';

import {
  getStatusRequestParams,
  getTxMetaFields,
  handleSolanaTxResponse,
  handleLineaDelay,
} from './transaction';
import { LINEA_DELAY_MS } from '../constants';

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
        chainId: '0x1',
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

  const snapId = 'snapId123';
  const selectedAccountAddress = 'solanaAccountAddress123';
  const mockSolanaAccount = {
    metadata: {
      snap: { id: snapId },
    },
    options: { scope: formatChainIdToCaip(ChainId.SOLANA) },
    id: 'test-account-id',
    address: selectedAccountAddress,
  } as never;

  describe('handleSolanaTxResponse', () => {
    it('should handle string response format', () => {
      const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
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
        trade: 'ABCD',
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

      const result = handleSolanaTxResponse(signature, mockQuoteResponse, {
        metadata: {
          snap: { id: undefined },
        },
        options: { scope: formatChainIdToCaip(ChainId.SOLANA) },
        id: 'test-account-id',
        address: selectedAccountAddress,
      } as never);

      expect(result).toMatchObject({
        id: expect.any(String),
        chainId: formatChainIdToHex(ChainId.SOLANA),
        txParams: { from: selectedAccountAddress },
        type: TransactionType.bridge,
        status: TransactionStatus.submitted,
        hash: signature,
        isSolana: true,
        isBridgeTx: true,
        origin: undefined,
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
      const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
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
        trade: 'ABCD',
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

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBe('solanaSignature123');
    });

    it('should handle object response format with txid', () => {
      const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
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
        trade: 'ABCD',
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

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBe('solanaTxId123');
    });

    it('should handle object response format with hash', () => {
      const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
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
        trade: 'ABCD',
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

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBe('solanaHash123');
    });

    it('should handle object response format with txHash', () => {
      const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
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
        trade: 'ABCD',
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

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBe('solanaTxHash123');
    });

    it('should handle empty or invalid response', () => {
      const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
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
        trade: 'ABCD',
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

      const result = handleSolanaTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBeUndefined();
    });
  });

  describe('handleLineaDelay', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should delay when source chain is Linea', async () => {
      // Create a minimal mock quote response with Linea as the source chain
      const mockQuoteResponse = {
        quote: {
          srcChainId: ChainId.LINEA,
          // Other required properties with minimal values
          requestId: 'test-request-id',
          srcAsset: { address: '0x123', symbol: 'ETH', decimals: 18 },
          srcTokenAmount: '1000000000000000000',
          destChainId: ChainId.ETH,
          destAsset: { address: '0x456', symbol: 'ETH', decimals: 18 },
          destTokenAmount: '1000000000000000000',
          bridgeId: 'test-bridge',
          bridges: ['test-bridge'],
          steps: [],
          feeData: {},
        },
        // Required properties for QuoteResponse
        trade: {} as TxData,
        estimatedProcessingTimeInSeconds: 60,
      } as unknown as QuoteResponse;

      // Create a promise that will resolve after the delay
      const delayPromise = handleLineaDelay(mockQuoteResponse);

      // Verify that the timer was set with the correct delay
      expect(jest.getTimerCount()).toBe(1);

      // Fast-forward the timer
      jest.advanceTimersByTime(LINEA_DELAY_MS);

      // Wait for the promise to resolve
      await delayPromise;

      // Verify that the timer was cleared
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should not delay when source chain is not Linea', async () => {
      // Create a minimal mock quote response with a non-Linea source chain
      const mockQuoteResponse = {
        quote: {
          srcChainId: ChainId.ETH,
          // Other required properties with minimal values
          requestId: 'test-request-id',
          srcAsset: { address: '0x123', symbol: 'ETH', decimals: 18 },
          srcTokenAmount: '1000000000000000000',
          destChainId: ChainId.LINEA,
          destAsset: { address: '0x456', symbol: 'ETH', decimals: 18 },
          destTokenAmount: '1000000000000000000',
          bridgeId: 'test-bridge',
          bridges: ['test-bridge'],
          steps: [],
          feeData: {},
        },
        // Required properties for QuoteResponse
        trade: {} as TxData,
        estimatedProcessingTimeInSeconds: 60,
      } as unknown as QuoteResponse;

      // Create a promise that will resolve after the delay
      const delayPromise = handleLineaDelay(mockQuoteResponse);

      // Verify that no timer was set
      expect(jest.getTimerCount()).toBe(0);

      // Wait for the promise to resolve
      await delayPromise;

      // Verify that no timer was set
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
