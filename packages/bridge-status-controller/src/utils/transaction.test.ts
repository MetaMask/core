import {
  ChainId,
  FeeType,
  formatChainIdToCaip,
  formatChainIdToHex,
  StatusTypes,
} from '@metamask/bridge-controller';
import type { Quote } from '@metamask/bridge-controller';
import type {
  QuoteMetadata,
  QuoteResponse,
  TxData,
} from '@metamask/bridge-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import * as snaps from './snaps';
import {
  getStatusRequestParams,
  getTxMetaFields,
  handleNonEvmTxResponse,
  handleApprovalDelay,
  handleMobileHardwareWalletDelay,
  getClientRequest,
  toBatchTxParams,
  getAddTransactionBatchParams,
  findAndUpdateTransactionsInBatch,
  getHistoryKey,
  getIntentFromQuote,
  rekeyHistoryItemInState,
  waitForTxConfirmation,
} from './transaction';
import { APPROVAL_DELAY_MS } from '../constants';
import type { BridgeStatusControllerMessenger } from '../types';
import type {
  BridgeStatusControllerState,
  BridgeHistoryItem,
  StatusResponse,
} from '../types';

describe('Bridge Status Controller Transaction Utils', () => {
  describe('rekeyHistoryItemInState', () => {
    const makeState = (
      overrides?: Partial<BridgeStatusControllerState>,
    ): BridgeStatusControllerState =>
      ({
        txHistory: {},
        ...overrides,
      }) as BridgeStatusControllerState;

    it('returns false when history item missing', () => {
      const state = makeState();
      const result = rekeyHistoryItemInState(state, 'missing', {
        id: 'tx1',
        hash: '0xhash',
      });
      expect(result).toBe(false);
    });

    it('rekeys and preserves srcTxHash', () => {
      const state = makeState({
        txHistory: {
          action1: {
            txMetaId: undefined,
            actionId: 'action1',
            originalTransactionId: undefined,
            quote: { srcChainId: 1, destChainId: 10 } as Quote,
            status: {
              status: StatusTypes.SUBMITTED,
              srcChain: { chainId: 1, txHash: '0xold' },
            } as StatusResponse,
            account: '0xaccount',
            estimatedProcessingTimeInSeconds: 1,
            slippagePercentage: 0,
            hasApprovalTx: false,
          } as BridgeHistoryItem,
        },
      });

      const result = rekeyHistoryItemInState(state, 'action1', {
        id: 'tx1',
        hash: '0xnew',
      });

      expect(result).toBe(true);
      expect(state.txHistory.action1).toBeUndefined();
      expect(state.txHistory.tx1.status.srcChain.txHash).toBe('0xnew');
    });

    it('uses existing srcTxHash when txMeta hash is missing', () => {
      const state = makeState({
        txHistory: {
          action1: {
            txMetaId: undefined,
            actionId: 'action1',
            originalTransactionId: undefined,
            quote: { srcChainId: 1, destChainId: 10 } as Quote,
            status: {
              status: StatusTypes.SUBMITTED,
              srcChain: { chainId: 1, txHash: '0xold' },
            } as StatusResponse,
            account: '0xaccount',
            estimatedProcessingTimeInSeconds: 1,
            slippagePercentage: 0,
            hasApprovalTx: false,
          } as BridgeHistoryItem,
        },
      });

      const result = rekeyHistoryItemInState(state, 'action1', { id: 'tx1' });

      expect(result).toBe(true);
      expect(state.txHistory.tx1.status.srcChain.txHash).toBe('0xold');
    });
  });

  describe('waitForTxConfirmation', () => {
    it('resolves when confirmed', async () => {
      const messenger = {
        call: jest.fn(() => ({
          transactions: [
            {
              id: 'tx1',
              status: TransactionStatus.confirmed,
            } as TransactionMeta,
          ],
        })),
      } as unknown as BridgeStatusControllerMessenger;

      const promise = waitForTxConfirmation(messenger, 'tx1', {
        timeoutMs: 10,
        pollMs: 1,
      });
      expect(await promise).toStrictEqual(
        expect.objectContaining({ id: 'tx1' }),
      );
    });

    it('throws when rejected', async () => {
      const messenger = {
        call: jest.fn(() => ({
          transactions: [
            {
              id: 'tx1',
              status: TransactionStatus.rejected,
            } as TransactionMeta,
          ],
        })),
      } as unknown as BridgeStatusControllerMessenger;

      const promise = waitForTxConfirmation(messenger, 'tx1', {
        timeoutMs: 10,
        pollMs: 1,
      });
      expect(await promise.catch((error) => error)).toStrictEqual(
        expect.objectContaining({
          message: expect.stringMatching(/did not confirm/iu),
        }),
      );
    });

    it('times out when status never changes', async () => {
      jest.useFakeTimers();
      const messenger = {
        call: jest.fn(() => ({
          transactions: [
            {
              id: 'tx1',
              status: TransactionStatus.submitted,
            } as TransactionMeta,
          ],
        })),
      } as unknown as BridgeStatusControllerMessenger;
      const nowSpy = jest.spyOn(Date, 'now');
      let now = 0;
      nowSpy.mockImplementation(() => now);

      const promise = waitForTxConfirmation(messenger, 'tx1', {
        timeoutMs: 5,
        pollMs: 1,
      });

      now = 10;
      jest.advanceTimersByTime(1);
      await Promise.resolve();

      expect(await promise.catch((error) => error)).toStrictEqual(
        expect.objectContaining({
          message: expect.stringMatching(/Timed out/iu),
        }),
      );

      nowSpy.mockRestore();
      jest.useRealTimers();
    });
  });
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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

    it('should use fallback chain ID for non-EVM destination chains', () => {
      const mockQuoteResponse = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.ETH,
          destChainId: 'bip122:000000000019d6689c085ae165831e93', // Bitcoin CAIP format
          srcTokenAmount: '1000000000000000000',
          destTokenAmount: '100000', // satoshis
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'ETH',
          },
          destAsset: {
            address: 'bc1qxxx',
            decimals: 8,
            symbol: 'BTC',
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
        // QuoteMetadata fields
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '3000',
          usd: '3000',
        },
        toTokenAmount: {
          amount: '0.001',
          valueInCurrency: '3000',
          usd: '3000',
        },
        minToTokenAmount: {
          amount: '0.00095',
          valueInCurrency: '2850',
          usd: '2850',
        },
        swapRate: '0.001',
        totalNetworkFee: {
          amount: '0.01',
          valueInCurrency: '30',
          usd: '30',
        },
        totalMaxNetworkFee: {
          amount: '0.015',
          valueInCurrency: '45',
          usd: '45',
        },
        gasFee: {
          amount: '0.01',
          valueInCurrency: '30',
          usd: '30',
        },
        adjustedReturn: {
          valueInCurrency: '2970',
          usd: '2970',
        },
        cost: {
          valueInCurrency: '30',
          usd: '30',
        },
      };

      const result = getTxMetaFields(mockQuoteResponse as never);

      // Should use fallback mainnet chain ID when CAIP format can't be converted to hex
      expect(result.destinationChainId).toBe('0x1');
      expect(result.destinationTokenSymbol).toBe('BTC');
      expect(result.destinationTokenDecimals).toBe(8);
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

  describe('handleNonEvmTxResponse', () => {
    it('should handle string response format', () => {
      const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          minDestTokenAmount: '1900000000000000000',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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

      const result = handleNonEvmTxResponse(signature, mockQuoteResponse, {
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
          minDestTokenAmount: '1900000000000000000',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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

      const result = handleNonEvmTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBe('solanaSignature123');
    });

    it('should handle onClientRequest response format with signature', () => {
      const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.SOLANA,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          minDestTokenAmount: '1900000000000000000',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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
        signature: 'solanaSignature123',
      };

      const result = handleNonEvmTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBe('solanaSignature123');
      expect(result.type).toBe(TransactionType.swap);
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
          minDestTokenAmount: '1900000000000000000',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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

      const result = handleNonEvmTxResponse(
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
          minDestTokenAmount: '1900000000000000000',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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

      const result = handleNonEvmTxResponse(
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
          minDestTokenAmount: '1900000000000000000',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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

      const result = handleNonEvmTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBe('solanaTxHash123');
    });

    it('should handle new unified interface response with transactionId', () => {
      const mockQuoteResponse: QuoteResponse<string> & QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          minDestTokenAmount: '1900000000000000000',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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

      const snapResponse = { transactionId: 'new-unified-tx-id-123' };

      const result = handleNonEvmTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBe('new-unified-tx-id-123');
      expect(result.chainId).toBe(formatChainIdToHex(ChainId.SOLANA));
      expect(result.type).toBe(TransactionType.bridge);
      expect(result.status).toBe(TransactionStatus.submitted);
      expect(result.destinationTokenAmount).toBe('2000000000000000000');
      expect(result.destinationTokenSymbol).toBe('MATIC');
      expect(result.destinationTokenDecimals).toBe(18);
      expect(result.destinationTokenAddress).toBe(
        '0x0000000000000000000000000000000000000000',
      );
      expect(result.swapTokenValue).toBe('1.0');
      expect(result.isSolana).toBe(true);
      expect(result.isBridgeTx).toBe(true);
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
          minDestTokenAmount: '1900000000000000000',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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

      const result = handleNonEvmTxResponse(
        snapResponse,
        mockQuoteResponse,
        mockSolanaAccount,
      );

      expect(result.hash).toBeUndefined();
    });

    it('should handle Bitcoin transaction with PSBT and non-EVM chain ID', () => {
      const mockBitcoinQuote = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: 'bip122:000000000019d6689c085ae165831e93',
          destChainId: ChainId.ETH,
          srcTokenAmount: '100000',
          destTokenAmount: '1000000000000000000',
          minDestTokenAmount: '950000000000000000',
          srcAsset: {
            address: 'bc1qxxx',
            decimals: 8,
            symbol: 'BTC',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            symbol: 'ETH',
          },
          steps: ['step1'],
          feeData: {
            [FeeType.METABRIDGE]: {
              amount: '500',
            },
          },
        },
        estimatedProcessingTimeInSeconds: 600,
        trade: {
          unsignedPsbtBase64: 'cHNidP8BAH0CAAAAAe...',
        },
        // QuoteMetadata fields
        sentAmount: {
          amount: '0.001',
          valueInCurrency: '60',
          usd: '60',
        },
        toTokenAmount: {
          amount: '1.0',
          valueInCurrency: '3000',
          usd: '3000',
        },
        minToTokenAmount: {
          amount: '0.95',
          valueInCurrency: '2850',
          usd: '2850',
        },
        swapRate: '1000',
        totalNetworkFee: {
          amount: '0.00005',
          valueInCurrency: '3',
          usd: '3',
        },
        totalMaxNetworkFee: {
          amount: '0.00007',
          valueInCurrency: '4.2',
          usd: '4.2',
        },
        gasFee: {
          amount: '0.00005',
          valueInCurrency: '3',
          usd: '3',
        },
        adjustedReturn: {
          valueInCurrency: '2997',
          usd: '2997',
        },
        cost: {
          valueInCurrency: '3',
          usd: '3',
        },
      };

      const snapResponse = { transactionId: 'btc_tx_123' };

      const result = handleNonEvmTxResponse(
        snapResponse,
        mockBitcoinQuote as never,
        mockSolanaAccount,
      );

      // Should use fallback chain ID (0x1 - Ethereum mainnet) when Bitcoin CAIP format can't be converted
      expect(result.chainId).toBe('0x1');
      expect(result.hash).toBe('btc_tx_123');
      expect(result.type).toBe(TransactionType.bridge);
      expect(result.sourceTokenSymbol).toBe('BTC');
      expect(result.destinationTokenSymbol).toBe('ETH');
      expect(result.isBridgeTx).toBe(true);
    });
  });

  describe('handleApprovalDelay', () => {
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
      const delayPromise = handleApprovalDelay(
        mockQuoteResponse.quote.srcChainId,
      );

      // Verify that the timer was set with the correct delay
      expect(jest.getTimerCount()).toBe(1);

      // Fast-forward the timer
      jest.advanceTimersByTime(APPROVAL_DELAY_MS);

      // Wait for the promise to resolve
      await delayPromise;

      // Verify that the timer was cleared
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should delay when source chain is Base', async () => {
      // Create a minimal mock quote response with Base as the source chain
      const mockQuoteResponse = {
        quote: {
          srcChainId: ChainId.BASE,
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
      const delayPromise = handleApprovalDelay(
        mockQuoteResponse.quote.srcChainId,
      );

      // Verify that the timer was set with the correct delay
      expect(jest.getTimerCount()).toBe(1);

      // Fast-forward the timer
      jest.advanceTimersByTime(APPROVAL_DELAY_MS);

      // Wait for the promise to resolve
      await delayPromise;

      // Verify that the timer was cleared
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should not delay when source chain is not Linea or Base', async () => {
      // Create a minimal mock quote response with a non-Linea/Base source chain
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
      const delayPromise = handleApprovalDelay(
        mockQuoteResponse.quote.srcChainId,
      );

      // Verify that no timer was set
      expect(jest.getTimerCount()).toBe(0);

      // Wait for the promise to resolve
      await delayPromise;

      // Verify that no timer was set
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('handleMobileHardwareWalletDelay', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should delay when requireApproval is true', async () => {
      // Create a promise that will resolve after the delay
      const delayPromise = handleMobileHardwareWalletDelay(true);

      // Verify that the timer was set with the correct delay (1000ms)
      expect(jest.getTimerCount()).toBe(1);

      // Fast-forward the timer by 1000ms
      jest.advanceTimersByTime(1000);

      // Wait for the promise to resolve
      await delayPromise;

      // Verify that the timer was cleared
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should not delay when requireApproval is false', async () => {
      // Create a promise that will resolve without delay
      const delayPromise = handleMobileHardwareWalletDelay(false);

      // Verify that no timer was set
      expect(jest.getTimerCount()).toBe(0);

      // Wait for the promise to resolve
      await delayPromise;

      // Verify that no timer was set
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('getClientRequest', () => {
    it('should generate a valid client request', () => {
      const mockQuoteResponse: Omit<QuoteResponse<string>, 'approval'> &
        QuoteMetadata = {
        quote: {
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          srcChainId: ChainId.SOLANA,
          destChainId: ChainId.POLYGON,
          srcTokenAmount: '1000000000',
          destTokenAmount: '2000000000000000000',
          minDestTokenAmount: '1900000000000000000',
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
        minToTokenAmount: {
          amount: '1.9',
          valueInCurrency: '3420',
          usd: '3420',
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

      const mockAccount = {
        id: 'test-account-id',
        address: '0x123456',
        metadata: {
          snap: { id: 'test-snap-id' },
        },
      } as never;

      const result = getClientRequest(
        mockQuoteResponse.trade,
        mockQuoteResponse.quote.srcChainId,
        mockAccount,
      );

      expect(result).toMatchObject({
        origin: 'metamask',
        snapId: 'test-snap-id',
        handler: 'onClientRequest',
        request: {
          id: expect.any(String),
          jsonrpc: '2.0',
          method: 'signAndSendTransaction',
          params: {
            transaction: 'ABCD',
            scope: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            accountId: 'test-account-id',
          },
        },
      });
    });

    it('should include Tron options when trade is Tron', () => {
      const createClientRequestSpy = jest
        .spyOn(snaps, 'createClientTransactionRequest')
        .mockReturnValue({ mocked: true } as never);

      const tronTrade = {
        raw_data_hex: 'abcdef',
        raw_data: {
          contract: [{ type: 'TransferContract' }],
        },
        visible: true,
      } as never;

      const mockAccount = {
        id: 'test-account-id',
        metadata: {
          snap: { id: 'test-snap-id' },
        },
      } as never;

      const result = getClientRequest(tronTrade, ChainId.TRON, mockAccount);

      expect(result).toStrictEqual({ mocked: true });
      expect(createClientRequestSpy).toHaveBeenCalledWith(
        'test-snap-id',
        expect.any(String),
        formatChainIdToCaip(ChainId.TRON),
        'test-account-id',
        {
          visible: true,
          type: 'TransferContract',
        },
      );

      createClientRequestSpy.mockRestore();
    });
  });

  describe('toBatchTxParams', () => {
    it('should return params without gas if disable7702 is false', () => {
      const mockTrade = {
        chainId: 1,
        gasLimit: 1231,
        to: '0x1',
        data: '0x1',
        from: '0x1',
        value: '0x1',
      };
      const result = toBatchTxParams(false, mockTrade, {});
      expect(result).toStrictEqual({
        data: '0x1',
        from: '0x1',
        to: '0x1',
        value: '0x1',
      });
    });
  });

  describe('getAddTransactionBatchParams', () => {
    let mockMessagingSystem: BridgeStatusControllerMessenger;
    const mockAccount = {
      id: 'test-account-id',
      address: '0xUserAddress',
      metadata: {
        keyring: { type: 'simple' },
      },
    };

    const createMockQuoteResponse = (
      overrides: {
        gasIncluded?: boolean;
        gasIncluded7702?: boolean;
        includeApproval?: boolean;
        includeResetApproval?: boolean;
      } = {},
    ): QuoteResponse<TxData, TxData> &
      QuoteMetadata & { approval?: TxData; resetApproval?: TxData } =>
      ({
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
            txFee: '50000000000000000',
          },
          gasIncluded: overrides.gasIncluded ?? false,
          gasIncluded7702: overrides.gasIncluded7702 ?? false,
        },
        estimatedProcessingTimeInSeconds: 300,
        trade: {
          value: '0x1000',
          gasLimit: 21000,
          to: '0xBridgeContract',
          data: '0xbridgeData',
          from: '0xUserAddress',
          chainId: ChainId.ETH,
        },
        ...(overrides.includeApproval && {
          approval: {
            to: '0xTokenContract',
            data: '0xapprovalData',
            from: '0xUserAddress',
          },
        }),
        ...(overrides.includeResetApproval && {
          resetApproval: {
            to: '0xTokenContract',
            data: '0xresetData',
            from: '0xUserAddress',
          },
        }),
        sentAmount: {
          amount: '1.0',
          valueInCurrency: '100',
          usd: '100',
        },
        toTokenAmount: {
          amount: '2.0',
          valueInCurrency: '200',
          usd: '200',
        },
      }) as never;

    const createMockMessagingSystem = () => ({
      call: jest.fn().mockImplementation((method: string) => {
        if (method === 'AccountsController:getAccountByAddress') {
          return mockAccount;
        }
        if (method === 'NetworkController:getNetworkConfiguration') {
          return {
            chainId: '0x1',
            rpcUrl: 'https://mainnet.infura.io/v3/API_KEY',
          };
        }
        if (method === 'GasFeeController:getState') {
          return {
            gasFeeEstimates: {
              low: {
                suggestedMaxFeePerGas: '20',
                suggestedMaxPriorityFeePerGas: '1',
              },
              medium: {
                suggestedMaxFeePerGas: '30',
                suggestedMaxPriorityFeePerGas: '2',
              },
              high: {
                suggestedMaxFeePerGas: '40',
                suggestedMaxPriorityFeePerGas: '3',
              },
            },
          };
        }
        return undefined;
      }),
    });

    beforeEach(() => {
      mockMessagingSystem =
        createMockMessagingSystem() as unknown as BridgeStatusControllerMessenger;
    });

    it('should handle gasIncluded7702 flag set to true', async () => {
      const mockQuoteResponse = createMockQuoteResponse({
        gasIncluded7702: true,
        includeApproval: true,
      });

      const result = await getAddTransactionBatchParams({
        quoteResponse: mockQuoteResponse,
        messenger: mockMessagingSystem,
        isBridgeTx: true,
        trade: mockQuoteResponse.trade,
        approval: mockQuoteResponse.approval,
        estimateGasFeeFn: jest.fn().mockResolvedValue({}),
      });

      expect(result.disable7702).toBe(false);
      expect(result.isGasFeeIncluded).toBe(true);

      // Should use txFee for gas calculation when gasIncluded7702 is true
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe(TransactionType.bridgeApproval);
      expect(result.transactions[1].type).toBe(TransactionType.bridge);
    });

    it('should handle gasIncluded7702 flag set to false', async () => {
      const mockQuoteResponse = createMockQuoteResponse({
        gasIncluded7702: false,
      });

      const result = await getAddTransactionBatchParams({
        quoteResponse: mockQuoteResponse,
        messenger: mockMessagingSystem,
        isBridgeTx: false,
        trade: mockQuoteResponse.trade,
        estimateGasFeeFn: jest.fn().mockResolvedValue({}),
      });

      expect(result.disable7702).toBe(true);
      expect(result.isGasFeeIncluded).toBe(false);

      // Should not use txFee for gas calculation when both gasIncluded and gasIncluded7702 are false
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].type).toBe(TransactionType.swap);
    });

    it('uses swap approval when approval provided and isBridgeTx is false', async () => {
      const mockQuoteResponse = createMockQuoteResponse({
        includeApproval: true,
      });

      const result = await getAddTransactionBatchParams({
        quoteResponse: mockQuoteResponse,
        messenger: mockMessagingSystem,
        isBridgeTx: false,
        trade: mockQuoteResponse.trade,
        approval: mockQuoteResponse.approval,
        estimateGasFeeFn: jest.fn().mockResolvedValue({}),
      });

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe(TransactionType.swapApproval);
      expect(result.transactions[1].type).toBe(TransactionType.swap);
    });

    it('should handle gasIncluded with gasIncluded7702', async () => {
      const mockQuoteResponse = createMockQuoteResponse({
        gasIncluded: true,
        gasIncluded7702: false,
        includeResetApproval: true,
      });

      const result = await getAddTransactionBatchParams({
        quoteResponse: mockQuoteResponse,
        messenger: mockMessagingSystem,
        isBridgeTx: true,
        trade: mockQuoteResponse.trade,
        resetApproval: mockQuoteResponse.resetApproval,
        estimateGasFeeFn: jest.fn().mockResolvedValue({}),
      });

      expect(result.disable7702).toBe(true);
      expect(result.isGasFeeIncluded).toBe(false);

      // Should use txFee for gas calculation when gasIncluded is true
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe(TransactionType.bridgeApproval);
      expect(result.transactions[1].type).toBe(TransactionType.bridge);
    });

    it('should set isGasFeeIncluded to false and set disable7702 to true when gasIncluded7702 is undefined', async () => {
      const mockQuoteResponse = createMockQuoteResponse({
        gasIncluded7702: undefined,
      });

      const result = await getAddTransactionBatchParams({
        quoteResponse: mockQuoteResponse,
        messenger: mockMessagingSystem,
        isBridgeTx: false,
        trade: mockQuoteResponse.trade,
        estimateGasFeeFn: jest.fn().mockResolvedValue({}),
      });

      expect(result.isGasFeeIncluded).toBe(false);
      expect(result.disable7702).toBe(true);
    });

    it('should set isGasFeeIncluded to true and disable7702 to false when gasIncluded7702 is true', async () => {
      const mockQuoteResponse = createMockQuoteResponse({
        gasIncluded7702: true,
      });

      const result = await getAddTransactionBatchParams({
        quoteResponse: mockQuoteResponse,
        messenger: mockMessagingSystem,
        isBridgeTx: false,
        trade: mockQuoteResponse.trade,
        estimateGasFeeFn: jest.fn().mockResolvedValue({}),
      });

      expect(result.isGasFeeIncluded).toBe(true);
      expect(result.disable7702).toBe(false);
    });

    it('should set isGasFeeIncluded to false and disable7702 to true when gasIncluded7702 is false', async () => {
      const mockQuoteResponse = createMockQuoteResponse({
        gasIncluded7702: false,
      });

      const result = await getAddTransactionBatchParams({
        quoteResponse: mockQuoteResponse,
        messenger: mockMessagingSystem,
        isBridgeTx: false,
        trade: mockQuoteResponse.trade,
        estimateGasFeeFn: jest.fn().mockResolvedValue({}),
      });

      expect(result.isGasFeeIncluded).toBe(false);
      expect(result.disable7702).toBe(true);
    });
  });

  describe('findAndUpdateTransactionsInBatch', () => {
    const mockUpdateTransactionFn = jest.fn();
    const batchId = 'test-batch-id';
    let mockMessagingSystem: BridgeStatusControllerMessenger;

    const createMockTransaction = (overrides: {
      id: string;
      batchId?: string;
      data?: string;
      authorizationList?: string[];
      delegationAddress?: string;
      type?: TransactionType;
    }) => ({
      id: overrides.id,
      batchId: overrides.batchId ?? batchId,
      txParams: {
        data: overrides.data ?? '0xdefaultData',
        ...(overrides.authorizationList && {
          authorizationList: overrides.authorizationList,
        }),
      },
      ...(overrides.delegationAddress && {
        delegationAddress: overrides.delegationAddress,
      }),
      ...(overrides.type && { type: overrides.type }),
    });

    // Helper function to create mock messaging system with transactions
    const createMockMessagingSystemWithTxs = (
      txs: ReturnType<typeof createMockTransaction>[],
    ) => ({
      call: jest.fn().mockReturnValue({ transactions: txs }),
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should update transaction types for 7702 swap transactions', () => {
      const txs = [
        createMockTransaction({
          id: 'tx1',
          data: '0xbatchExecuteData',
          authorizationList: ['0xAuth1'], // 7702 transaction
          type: TransactionType.batch,
        }),
        createMockTransaction({
          id: 'tx2',
          data: '0xapprovalData',
        }),
      ];

      mockMessagingSystem = createMockMessagingSystemWithTxs(
        txs,
      ) as unknown as BridgeStatusControllerMessenger;

      const txDataByType = {
        [TransactionType.swap]: '0xswapData',
        [TransactionType.swapApproval]: '0xapprovalData',
      };

      findAndUpdateTransactionsInBatch({
        messenger: mockMessagingSystem,
        batchId,
        txDataByType,
        updateTransactionFn: mockUpdateTransactionFn,
      });

      // Should update the 7702 batch transaction to swap type
      expect(mockUpdateTransactionFn).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx1',
          type: TransactionType.swap,
        }),
        'Update tx type to swap',
      );

      // Should update the approval transaction
      expect(mockUpdateTransactionFn).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx2',
          type: TransactionType.swapApproval,
        }),
        'Update tx type to swapApproval',
      );
    });

    it('should handle 7702 transactions with delegationAddress', () => {
      const txs = [
        createMockTransaction({
          id: 'tx1',
          data: '0xbatchData',
          delegationAddress: '0xDelegationAddress', // 7702 transaction marker
          type: TransactionType.batch,
        }),
      ];

      mockMessagingSystem = createMockMessagingSystemWithTxs(
        txs,
      ) as unknown as BridgeStatusControllerMessenger;

      const txDataByType = {
        [TransactionType.swap]: '0xswapData',
      };

      findAndUpdateTransactionsInBatch({
        messenger: mockMessagingSystem,
        batchId,
        txDataByType,
        updateTransactionFn: mockUpdateTransactionFn,
      });

      // Should identify and update 7702 transaction with delegationAddress
      expect(mockUpdateTransactionFn).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx1',
          type: TransactionType.swap,
        }),
        'Update tx type to swap',
      );
    });

    it('should handle 7702 approval transactions', () => {
      const txs = [
        createMockTransaction({
          id: 'tx1',
          data: '0xapprovalData',
          authorizationList: ['0xAuth1'], // 7702 transaction
        }),
      ];

      mockMessagingSystem = createMockMessagingSystemWithTxs(
        txs,
      ) as unknown as BridgeStatusControllerMessenger;

      const txDataByType = {
        [TransactionType.swapApproval]: '0xapprovalData',
      };

      findAndUpdateTransactionsInBatch({
        messenger: mockMessagingSystem,
        batchId,
        txDataByType,
        updateTransactionFn: mockUpdateTransactionFn,
      });

      // Should match 7702 approval transaction by data
      expect(mockUpdateTransactionFn).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx1',
          type: TransactionType.swapApproval,
        }),
        'Update tx type to swapApproval',
      );
    });

    it('should handle non-7702 transactions normally', () => {
      const txs = [
        createMockTransaction({
          id: 'tx1',
          data: '0xswapData',
        }),
        createMockTransaction({
          id: 'tx2',
          data: '0xapprovalData',
        }),
      ];

      mockMessagingSystem = createMockMessagingSystemWithTxs(
        txs,
      ) as unknown as BridgeStatusControllerMessenger;

      const txDataByType = {
        [TransactionType.bridge]: '0xswapData',
        [TransactionType.bridgeApproval]: '0xapprovalData',
      };

      findAndUpdateTransactionsInBatch({
        messenger: mockMessagingSystem,
        batchId,
        txDataByType,
        updateTransactionFn: mockUpdateTransactionFn,
      });

      // Should update regular transactions by matching data
      expect(mockUpdateTransactionFn).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx1',
          type: TransactionType.bridge,
        }),
        'Update tx type to bridge',
      );

      expect(mockUpdateTransactionFn).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx2',
          type: TransactionType.bridgeApproval,
        }),
        'Update tx type to bridgeApproval',
      );
    });

    it('should not update transactions without matching batchId', () => {
      const txs = [
        createMockTransaction({
          id: 'tx1',
          batchId: 'different-batch-id',
          data: '0xswapData',
        }),
      ];

      mockMessagingSystem = createMockMessagingSystemWithTxs(
        txs,
      ) as unknown as BridgeStatusControllerMessenger;

      const txDataByType = {
        [TransactionType.swap]: '0xswapData',
      };

      findAndUpdateTransactionsInBatch({
        messenger: mockMessagingSystem,
        batchId,
        txDataByType,
        updateTransactionFn: mockUpdateTransactionFn,
      });

      // Should not update transactions with different batchId
      expect(mockUpdateTransactionFn).not.toHaveBeenCalled();
    });

    it('should handle 7702 bridge transactions', () => {
      const txs = [
        createMockTransaction({
          id: 'tx1',
          data: '0xbatchData',
          authorizationList: ['0xAuth1'],
          type: TransactionType.batch,
        }),
      ];

      mockMessagingSystem = createMockMessagingSystemWithTxs(
        txs,
      ) as unknown as BridgeStatusControllerMessenger;

      const txDataByType = {
        [TransactionType.bridge]: '0xbridgeData',
      };

      // Test with bridge transaction (not swap)
      findAndUpdateTransactionsInBatch({
        messenger: mockMessagingSystem,
        batchId,
        txDataByType,
        updateTransactionFn: mockUpdateTransactionFn,
      });

      // Should not match since it's looking for bridge but finds batch type
      expect(mockUpdateTransactionFn).not.toHaveBeenCalled();
    });
  });

  describe('getHistoryKey', () => {
    it('returns actionId when both actionId and bridgeTxMetaId are provided', () => {
      expect(getHistoryKey('action-123', 'tx-456')).toBe('action-123');
    });

    it('returns bridgeTxMetaId when only bridgeTxMetaId is provided', () => {
      expect(getHistoryKey(undefined, 'tx-456')).toBe('tx-456');
    });

    it('returns actionId when only actionId is provided', () => {
      expect(getHistoryKey('action-123', undefined)).toBe('action-123');
    });

    it('throws error when neither actionId nor bridgeTxMetaId is provided', () => {
      expect(() => getHistoryKey(undefined, undefined)).toThrow(
        'Cannot add tx to history: either actionId or bridgeTxMeta.id must be provided',
      );
    });
  });

  describe('getIntentFromQuote', () => {
    it('returns intent when present in quote response', () => {
      const mockIntent = { protocol: 'cowswap', order: { some: 'data' } };
      const quoteResponse = {
        quote: {
          intent: mockIntent,
          srcChainId: 1,
          destChainId: 1,
        },
      } as never;

      expect(getIntentFromQuote(quoteResponse)).toBe(mockIntent);
    });

    it('throws error when intent is missing from quote', () => {
      const quoteResponse = {
        quote: {
          srcChainId: 1,
          destChainId: 1,
        },
      } as never;

      expect(() => getIntentFromQuote(quoteResponse)).toThrow(
        'submitIntent: missing intent data',
      );
    });

    it('throws error when intent is undefined', () => {
      const quoteResponse = {
        quote: {
          intent: undefined,
          srcChainId: 1,
          destChainId: 1,
        },
      } as never;

      expect(() => getIntentFromQuote(quoteResponse)).toThrow(
        'submitIntent: missing intent data',
      );
    });
  });
});
