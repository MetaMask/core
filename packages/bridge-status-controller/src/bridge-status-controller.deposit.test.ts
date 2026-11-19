// oxlint-disable typescript/no-unsafe-call
import type {
  QuoteResponseV1,
  QuoteMetadata,
  SwapTraceFunction,
  SwapTraceRequest,
  Trade,
  TxData,
} from '@metamask/bridge-controller';
import {
  ActionTypes,
  ChainId,
  FeeType,
  StatusTypes,
  getNativeAssetForChainId,
  getQuotesReceivedProperties,
  UnifiedSwapBridgeEventName,
  mergeQuoteMetadata,
  validateQuoteResponseV1,
  toQuoteResponseV2,
} from '@metamask/bridge-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  CHAIN_IDS,
  GasFeeEstimateType,
  TransactionType,
  TransactionStatus,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
// oxlint-disable vitest/no-conditional-in-test typescript/no-unsafe-return
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable vitest/no-restricted-matchers */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { flushPromises } from '../../../tests/vitest/helpers.js';
import {
  getMockInternalAccount,
  getMockPayControllerState,
  getMockPayQuote,
  getMockQuote,
  MockStatusResponse,
  MockTxHistory,
  withController as withControllerBase,
} from './__fixtures__/test-utils.js';
import type { RootMessenger } from './__fixtures__/test-utils.js';
import { BridgeStatusController } from './bridge-status-controller.js';
import { TraceName } from './constants.js';
import { submitDepositHandler } from './strategy/deposit-strategy.js';
import type { SubmitStrategyParams } from './strategy/types.js';
import { BridgeClientId, Operation } from './types.js';
import type {
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
} from './types.js';
import * as bridgeStatusUtils from './utils/bridge-status.js';
import * as historyUtils from './utils/history.js';
import * as intentApi from './utils/intent-api.js';
import * as networkUtils from './utils/network.js';
import { tradeUpdateHandler } from './utils/subscriptions.js';
import * as transactionUtils from './utils/transaction.js';
import { IntentOrderStatus } from './utils/validators.js';

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

const mockIsEthUsdt = vi.fn();
vi.mock(import('@metamask/bridge-controller'), async (importOriginal) => ({
  ...(await importOriginal()),
  isEthUsdt: () => mockIsEthUsdt(),
}));

const mockGenerateBatchId = vi.fn();
vi.mock(import('@metamask/transaction-controller'), async (importOriginal) => ({
  ...(await importOriginal()),
  generateBatchId: () => {
    return mockGenerateBatchId();
  },
}));

const { mockBuildMoneyAccountDepositBatch, mockGetMoneyAccountVaultConfig } =
  vi.hoisted(() => ({
    mockBuildMoneyAccountDepositBatch: vi.fn(),
    mockGetMoneyAccountVaultConfig: vi.fn(),
  }));
vi.mock('@metamask/money-account-utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@metamask/money-account-utils')>();
  return {
    ...actual,
    getMoneyAccountVaultConfig: (...args: unknown[]) =>
      mockGetMoneyAccountVaultConfig(...args),
    buildMoneyAccountDepositBatch: (...args: unknown[]) =>
      mockBuildMoneyAccountDepositBatch(...args),
  };
});

let addTransactionBatchFnMock: Mock = vi.fn();

type WithControllerCallback<ReturnValue> = (payload: {
  controller: BridgeStatusController;
  rootMessenger: RootMessenger;
  messenger: BridgeStatusControllerMessenger;
  startPollingForBridgeTxStatusSpy: Mock;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof BridgeStatusController>[0]>;
  mockMessengerCall?: Mock;
};

let mockTraceFn: Mock<
  (
    request: SwapTraceRequest<TraceName>,
    fn?: (args?: unknown) => unknown,
  ) => unknown
>;

async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [opts, testFunction] = args.length === 2 ? args : [{}, args[0]];
  return await withControllerBase(
    {
      ...opts,
      addTransactionBatchFn: addTransactionBatchFnMock,
      traceFn: mockTraceFn,
    },
    testFunction,
  );
}

const mockSelectedAccount = getMockInternalAccount();

const BATCH_ID_1 = '0x1234BatchId';
const BATCH_ID_2 = 'batchId1';

describe('BridgeStatusController (deposit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    addTransactionBatchFnMock = vi.fn();
    vi.spyOn(historyUtils, 'isHistoryItemTooOld').mockReturnValue(false);
    mockTraceFn = vi.fn(
      async (
        _request: SwapTraceRequest<TraceName>,
        fn?: (args?: unknown) => unknown,
      ) => await fn?.(),
    );
    mockGenerateBatchId.mockReturnValueOnce(BATCH_ID_1);
    mockGenerateBatchId.mockReturnValueOnce(BATCH_ID_2);
  });

  describe('submitTx: Solana bridge', () => {
    const mockQuote: QuoteResponseV1<string> = {
      quote: {
        requestId: '123',
        srcChainId: ChainId.SOLANA,
        destChainId: ChainId.ETH,
        srcTokenAmount: '1000000000',
        srcAsset: {
          chainId: ChainId.SOLANA,
          address: 'native',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          assetId: getNativeAssetForChainId(ChainId.SOLANA).assetId,
        },
        destTokenAmount: '0.5',
        minDestTokenAmount: '0.475',
        destAsset: {
          chainId: ChainId.ETH,
          address: '0x...',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          assetId: 'eip155:1/slip44:60',
        },
        bridgeId: 'test-bridge',
        bridges: ['test-bridge'],
        steps: [
          {
            action: ActionTypes.BRIDGE,
            srcChainId: ChainId.SOLANA,
            destChainId: ChainId.ETH,
            srcAsset: {
              chainId: ChainId.SOLANA,
              address: 'native',
              symbol: 'SOL',
              name: 'Solana',
              decimals: 9,
              assetId: getNativeAssetForChainId(ChainId.SOLANA).assetId,
            },
            destAsset: {
              chainId: ChainId.ETH,
              address: '0x...',
              symbol: 'ETH',
              name: 'Ethereum',
              decimals: 18,
              assetId: 'eip155:1/slip44:60',
            },
          },
        ],
        feeData: {
          [FeeType.METABRIDGE]: {
            amount: '1000000',
            asset: {
              chainId: ChainId.SOLANA,
              address: 'native',
              symbol: 'SOL',
              name: 'Solana',
              decimals: 9,
              assetId: getNativeAssetForChainId(ChainId.SOLANA).assetId,
            },
          },
        },
      },
      estimatedProcessingTimeInSeconds: 300,
      trade:
        'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAHDXLY8oVRIwA8ZdRSGjM5RIZJW8Wv+Twyw3NqU4Hov+OHoHp/dmeDvstKbICW3ezeGR69t3/PTAvdXgZVdJFJXaxkoKXUTWfEAyQyCCG9nwVoDsd10OFdnM9ldSi+9SLqHpqWVDV+zzkmftkF//DpbXxqeH8obNXHFR7pUlxG9uNVOn64oNsFdeUvD139j1M51iRmUY839Y25ET4jDRscT081oGb+rLnywLjLSrIQx6MkqNBhCFbxqY1YmoGZVORW/QMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpBHnVW/IxwG7udMVuzmgVB/2xst6j9I5RArHNola8E4+0P/on9df2SnTAmx8pWHneSwmrNt/J3VFLMhqns4zl6JmXkZ+niuxMhAGrmKBaBo94uMv2Sl+Xh3i+VOO0m5BdNZ1ElenbwQylHQY+VW1ydG1MaUEeNpG+EVgswzPMwPoLBgAFAsBcFQAGAAkDQA0DAAAAAAAHBgABAhMICQAHBgADABYICQEBCAIAAwwCAAAAUEYVOwAAAAAJAQMBEQoUCQADBAETCgsKFw0ODxARAwQACRQj5RfLl3rjrSoBAAAAQ2QAAVBGFTsAAAAAyYZnBwAAAABkAAAJAwMAAAEJDAkAAAIBBBMVCQjGASBMKQwnooTbKNxdBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUHTKomh4KXvNgA0ovYKS5F8GIOBgAAAAAAAAAAAAAAAAAQgAAAAAAAAAAAAAAAAAAAAAAAEIF7RFOAwAAAAAAAAAAAAAAaAIAAAAAAAC4CwAAAAAAAOAA2mcAAAAAAAAAAAAAAAAAAAAApapuIXG0FuHSfsU8qME9s/kaic0AAwGCsZdSuxV5eCm+Ria4LEQPgTg4bg65gNrTAefEzpAfPQgCABIMAgAAAAAAAAAAAAAACAIABQwCAAAAsIOFAAAAAAADWk6DVOZO8lMFQg2r0dgfltD6tRL/B1hH3u00UzZdgqkAAxEqIPdq2eRt/F6mHNmFe7iwZpdrtGmHNJMFlK7c6Bc6k6kjBezr6u/tAgvu3OGsJSwSElmcOHZ21imqH/rhJ2KgqDJdBPFH4SYIM1kBAAA=',
    };
    const mockQuoteResponse = {
      ...mockQuote,
      ...{
        sentAmount: {
          amount: '1',
          valueInCurrency: '100',
          usd: '100',
        },
        toTokenAmount: {
          amount: '0.5',
          valueInCurrency: '1000',
          usd: '1000',
        },
        minToTokenAmount: {
          amount: '0.475',
          valueInCurrency: '950',
          usd: '950',
        },
        totalNetworkFee: {
          amount: '0.1',
          valueInCurrency: '10',
          usd: '10',
        },
        gasFee: {
          total: { amount: '0.05', valueInCurrency: '5', usd: '5' },
        },
        adjustedReturn: {
          valueInCurrency: '985',
          usd: '985',
        },
        cost: {
          valueInCurrency: '15',
          usd: '15',
        },
        swapRate: '0.5',
      },
    };

    const mockSolanaAccount = {
      id: 'solana-account-1',
      address: '0x123...',
      metadata: {
        snap: {
          id: 'test-snap',
        },
        keyring: {
          type: 'any',
        },
      },
      options: { scope: 'solana-chain-id' },
    };

    let mockMessengerCall: Mock;
    beforeEach(() => {
      vi.clearAllMocks();
      vi.clearAllTimers();
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567890);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567891);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567892);

      mockMessengerCall = vi.fn();
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
    });

    it('adds historyItem.next on submit', async () => {
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // track event
      mockMessengerCall.mockResolvedValueOnce('signature');
      mockMessengerCall.mockReturnValueOnce(mockSolanaAccount);
      mockMessengerCall.mockReturnValueOnce({
        transactions: [],
      });

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: 'SOLaccountAddress',
              quoteResponses: [mockQuoteResponse],
              isStxEnabled: false,
            },
          );
          controller.stopAllPolling();

          expect(mockMessengerCall.mock.calls).toMatchSnapshot();
          expect(result).toMatchSnapshot();
          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(1);
          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledWith({
            bridgeTxMetaId: 'signature',
          });
          expect(mockGenerateBatchId).not.toHaveBeenCalled();
          expect(result.id).toBe('signature');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'signature',
          ]);
          expect(controller.state.txHistory.signature.batchId).toBeUndefined();
          expect(controller.state.txHistory.signature.actionId).toBeUndefined();
          expect(
            controller.state.txHistory.signature.depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory.signature.actionId).toBeUndefined();
          expect(
            controller.state.txHistory.signature.depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory.signature.next)
            .toMatchInlineSnapshot(`
              [
                {
                  "operation": "deposit",
                  "partialQuote": {
                    "approval": undefined,
                    "estimatedProcessingTimeInSeconds": 300,
                    "quoteId": undefined,
                    "resetApproval": undefined,
                    "trade": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAHDXLY8oVRIwA8ZdRSGjM5RIZJW8Wv+Twyw3NqU4Hov+OHoHp/dmeDvstKbICW3ezeGR69t3/PTAvdXgZVdJFJXaxkoKXUTWfEAyQyCCG9nwVoDsd10OFdnM9ldSi+9SLqHpqWVDV+zzkmftkF//DpbXxqeH8obNXHFR7pUlxG9uNVOn64oNsFdeUvD139j1M51iRmUY839Y25ET4jDRscT081oGb+rLnywLjLSrIQx6MkqNBhCFbxqY1YmoGZVORW/QMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+FkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbd9uHXZaGT2cvhRs7reawctIXtX1s3kTqM9YV+/wCpBHnVW/IxwG7udMVuzmgVB/2xst6j9I5RArHNola8E4+0P/on9df2SnTAmx8pWHneSwmrNt/J3VFLMhqns4zl6JmXkZ+niuxMhAGrmKBaBo94uMv2Sl+Xh3i+VOO0m5BdNZ1ElenbwQylHQY+VW1ydG1MaUEeNpG+EVgswzPMwPoLBgAFAsBcFQAGAAkDQA0DAAAAAAAHBgABAhMICQAHBgADABYICQEBCAIAAwwCAAAAUEYVOwAAAAAJAQMBEQoUCQADBAETCgsKFw0ODxARAwQACRQj5RfLl3rjrSoBAAAAQ2QAAVBGFTsAAAAAyYZnBwAAAABkAAAJAwMAAAEJDAkAAAIBBBMVCQjGASBMKQwnooTbKNxdBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUHTKomh4KXvNgA0ovYKS5F8GIOBgAAAAAAAAAAAAAAAAAQgAAAAAAAAAAAAAAAAAAAAAAAEIF7RFOAwAAAAAAAAAAAAAAaAIAAAAAAAC4CwAAAAAAAOAA2mcAAAAAAAAAAAAAAAAAAAAApapuIXG0FuHSfsU8qME9s/kaic0AAwGCsZdSuxV5eCm+Ria4LEQPgTg4bg65gNrTAefEzpAfPQgCABIMAgAAAAAAAAAAAAAACAIABQwCAAAAsIOFAAAAAAADWk6DVOZO8lMFQg2r0dgfltD6tRL/B1hH3u00UzZdgqkAAxEqIPdq2eRt/F6mHNmFe7iwZpdrtGmHNJMFlK7c6Bc6k6kjBezr6u/tAgvu3OGsJSwSElmcOHZ21imqH/rhJ2KgqDJdBPFH4SYIM1kBAAA=",
                  },
                },
              ]
            `);
        },
      );
    });
  });

  describe('submitTx: EVM bridge', () => {
    const mockEvmQuoteResponse: QuoteResponseV1<TxData> & QuoteMetadata = {
      quote: {
        ...getMockQuote(),
        srcChainId: 42161, // Arbitrum
        destChainId: 10, // Optimism
      },
      estimatedProcessingTimeInSeconds: 15,
      sentAmount: { amount: '1.234', valueInCurrency: '2.00', usd: '1.01' },
      toTokenAmount: {
        amount: '1.5',
        valueInCurrency: '2.9999',
        usd: '0.134214',
      },
      minToTokenAmount: {
        amount: '1.425',
        valueInCurrency: '2.85',
        usd: '0.127',
      },
      totalNetworkFee: {
        amount: '.00055',
        valueInCurrency: undefined,
        usd: '2.5778',
      },
      gasFee: {
        total: { amount: '.00055', valueInCurrency: undefined, usd: '2.5778' },
      },
      adjustedReturn: { valueInCurrency: undefined, usd: undefined },
      swapRate: '1.234',
      cost: { valueInCurrency: undefined, usd: undefined },
      trade: {
        from: '0xaccount1',
        to: '0xbridgeContract',
        value: '0x0',
        data: '0xdata',
        chainId: 42161,
        gasLimit: 21000,
      },
      approval: {
        from: '0xaccount1',
        to: '0xtokenContract',
        value: '0x0',
        data: '0xapprovalData',
        chainId: 42161,
        gasLimit: 21000,
      },
    };
    validateQuoteResponseV1(mockEvmQuoteResponse);

    const mockEvmTxMeta = {
      id: 'test-tx-id',
      actionId: '1111111111.223',
      hash: '0xevmTxHash',
      time: 1234567890,
      status: 'unapproved',
      type: TransactionType.bridge,
      chainId: '0xa4b1', // 42161 in hex
      txParams: {
        from: '0xaccount1',
        to: '0xbridgeContract',
        value: '0x0',
        data: '0xdata',
        chainId: '0xa4b1',
        gasLimit: '0x5208',
      },
      txReceipt: {
        gasUsed: '0x2c92a',
        effectiveGasPrice: '0x1880a',
      },
    };

    const mockApprovalTxMeta = {
      id: 'test-approval-tx-id',
      actionId: '1111111111.222',
      hash: '0xapprovalTxHash',
      time: 1234567890,
      status: 'unapproved',
      type: TransactionType.bridgeApproval,
      chainId: '0xa4b1', // 42161 in hex
      txParams: {
        from: '0xaccount1',
        to: '0xtokenContract',
        value: '0x0',
        data: '0xapprovalData',
        chainId: '0xa4b1',
        gasLimit: '0x5208',
      },
      txReceipt: {
        gasUsed: '0x2c92a',
        effectiveGasPrice: '0x1880a',
      },
    };

    const mockEstimateGasFeeResult = {
      estimates: {
        type: GasFeeEstimateType.FeeMarket,
        high: {
          suggestedMaxFeePerGas: '0x1234',
          suggestedMaxPriorityFeePerGas: '0x5678',
        },
      },
    };

    let mockMessengerCall: Mock;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.clearAllTimers();
      mockMessengerCall = vi.fn();
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567890);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567891);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567892);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567893);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567894);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567895);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.456);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.457);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.458);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.459);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
    });

    const setupEventTrackingMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockImplementationOnce(vi.fn()); // track event
      mockCall.mockReturnValueOnce([]); // isAtomicBatchSupported
    };

    const setupApprovalMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockReturnValueOnce('arbitrum-client-id');
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce({
        transactionMeta: mockApprovalTxMeta,
        result: Promise.resolve('0xapprovalTxHash'),
      });
      mockCall.mockReturnValueOnce({
        transactions: [mockApprovalTxMeta],
      });
    };

    const setupBridgeMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockReturnValueOnce('arbitrum');
      mockCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockCall.mockResolvedValueOnce({
        transactionMeta: mockEvmTxMeta,
        result: Promise.resolve('0xevmTxHash'),
      });
      mockCall.mockReturnValueOnce({
        transactions: [mockEvmTxMeta],
      });

      mockCall.mockReturnValueOnce(mockSelectedAccount);

      mockCall.mockReturnValue({
        transactions: [mockEvmTxMeta],
      });
    };

    const setupBridgeStxMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockReturnValueOnce('arbitrum');
      mockCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      addTransactionBatchFnMock.mockResolvedValueOnce({
        batchId: 'batchId1',
      });
      mockCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: BATCH_ID_1 }],
      });

      mockCall.mockReturnValueOnce(mockSelectedAccount);

      mockCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: BATCH_ID_1 }],
      });
    };

    it('should successfully submit an EVM bridge transaction with approval', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      setupApprovalMocks(mockMessengerCall);
      setupBridgeMocks(mockMessengerCall);

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: 'otherAccount',
              quoteResponses: [mockEvmQuoteResponse],
              isStxEnabled: false,
            },
          );

          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'test-tx-id',
          ]);
          expect(
            controller.state.txHistory['test-tx-id'].batchId,
          ).toBeUndefined();
          expect(controller.state.txHistory['test-tx-id'].actionId).toBe(
            '1111111111.223',
          );
          expect(
            controller.state.txHistory['test-tx-id'].depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory['test-tx-id'].next)
            .toMatchInlineSnapshot(`
              [
                {
                  "operation": "deposit",
                  "partialQuote": {
                    "approval": {
                      "chainId": 42161,
                      "data": "0xapprovalData",
                      "from": "0xaccount1",
                      "gasLimit": 21000,
                      "to": "0xtokenContract",
                      "value": "0x0",
                    },
                    "estimatedProcessingTimeInSeconds": 15,
                    "quoteId": undefined,
                    "resetApproval": undefined,
                    "trade": {
                      "chainId": 42161,
                      "data": "0xdata",
                      "from": "0xaccount1",
                      "gasLimit": 21000,
                      "to": "0xbridgeContract",
                      "value": "0x0",
                    },
                  },
                },
              ]
            `);
          controller.stopAllPolling();
        },
      );
    });

    it('should handle smart transactions and include quotesReceivedContext', async () => {
      mockGenerateBatchId.mockReturnValue(BATCH_ID_1);
      setupEventTrackingMocks(mockMessengerCall);
      setupBridgeStxMocks(mockMessengerCall);
      addTransactionBatchFnMock.mockResolvedValueOnce({
        batchId: 'batchId1',
      });

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
          const quoteResponseV2 = mergeQuoteMetadata(
            toQuoteResponseV2(quoteWithoutApproval),
            quoteWithoutApproval,
          );
          const quotesReceivedContext = getQuotesReceivedProperties(
            quoteResponseV2,
            ['low_return'],
            true,
          );
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: quoteWithoutApproval.trade.from,
              quoteResponses: [quoteWithoutApproval],
              isStxEnabled: true,
              quotesReceivedContext,
            },
          );
          controller.stopAllPolling();

          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'test-tx-id',
          ]);
          expect(controller.state.txHistory['test-tx-id'].batchId).toBe(
            BATCH_ID_1,
          );
          expect(controller.state.txHistory['test-tx-id'].actionId).toBe(
            '1111111111.223',
          );
          expect(
            controller.state.txHistory['test-tx-id'].depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory['test-tx-id'].next)
            .toMatchInlineSnapshot(`
            [
              {
                "operation": "deposit",
                "partialQuote": {
                  "approval": undefined,
                  "estimatedProcessingTimeInSeconds": 15,
                  "quoteId": undefined,
                  "resetApproval": undefined,
                  "trade": {
                    "chainId": 42161,
                    "data": "0xdata",
                    "from": "0xaccount1",
                    "gasLimit": 21000,
                    "to": "0xbridgeContract",
                    "value": "0x0",
                  },
                },
              },
            ]
          `);
          expect(addTransactionBatchFnMock).toHaveBeenCalledTimes(1);
        },
      );
    });

    describe('actionId tracking and rekeying', () => {
      beforeEach(() => {
        vi.clearAllMocks();
      });

      it('should add pre-submission history keyed by actionId and rekey to next batchId after success', async () => {
        // Mock generateActionId to return a predictable value
        vi.spyOn(transactionUtils, 'generateActionId').mockReturnValueOnce(
          '1234567890.456',
        );

        setupEventTrackingMocks(mockMessengerCall);
        // No approval for this test - direct to bridge tx
        const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;
        setupBridgeMocks(mockMessengerCall);

        await withController(
          { mockMessengerCall },
          async ({
            controller,
            rootMessenger,
            startPollingForBridgeTxStatusSpy,
          }) => {
            const result = await rootMessenger.call(
              'BridgeStatusController:submitTx',
              {
                operation: Operation.DEPOSIT,
                accountAddress: quoteWithoutApproval.trade.from,
                quoteResponses: [quoteWithoutApproval],
                isStxEnabled: false, // STX disabled - uses non-batch path
              },
            );
            controller.stopAllPolling();

            expect(result.id).toBe('test-tx-id');
            expect(Object.keys(controller.state.txHistory)).toStrictEqual([
              'test-tx-id',
            ]);
            expect(controller.state.txHistory['test-tx-id']).toBeDefined();
            expect(controller.state.txHistory['test-tx-id'].txMetaId).toBe(
              result.id,
            );
            expect(controller.state.txHistory['test-tx-id'].actionId).toBe(
              '1111111111.223',
            );
            expect(
              controller.state.txHistory['test-tx-id'].batchId,
            ).toBeUndefined();
            expect(
              controller.state.txHistory['test-tx-id'].depositTxMeta,
            ).toBeUndefined();
            expect(
              controller.state.txHistory['test-tx-id'].status.srcChain.txHash,
            ).toStrictEqual(result.hash);

            expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          },
        );
      });

      it('should preserve pre-submission history for tracking when trade tx submission fails (before adding tx to state)', async () => {
        const mockActionId = '9876543210.789';
        vi.spyOn(transactionUtils, 'generateActionId')
          .mockReturnValueOnce('9876543210.789')
          .mockReturnValueOnce('9876543210.790');

        setupEventTrackingMocks(mockMessengerCall);
        const { approval, ...quoteWithoutApproval } = mockEvmQuoteResponse;

        // Setup for trade tx (no approval)
        mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
        mockMessengerCall.mockReturnValueOnce('arbitrum-client-id');
        mockMessengerCall.mockResolvedValueOnce({
          estimates: {
            type: GasFeeEstimateType.FeeMarket,
            high: {
              suggestedMaxFeePerGas: '0x1234',
              suggestedMaxPriorityFeePerGas: '0x5678',
            },
          },
        });

        // Trade tx fails during submission
        mockMessengerCall.mockRejectedValueOnce(
          new Error('Trade tx submission failed'),
        );
        mockMessengerCall.mockReturnValueOnce({});
        mockMessengerCall.mockReturnValueOnce({});
        mockMessengerCall.mockReturnValueOnce({});

        await withController(
          { mockMessengerCall },
          async ({
            controller,
            rootMessenger,
            startPollingForBridgeTxStatusSpy,
          }) => {
            await expect(
              rootMessenger.call('BridgeStatusController:submitTx', {
                operation: Operation.DEPOSIT,
                accountAddress: quoteWithoutApproval.trade.from,
                quoteResponses: [quoteWithoutApproval],
                isStxEnabled: false,
              }),
            ).rejects.toThrow('Trade tx submission failed');

            // Verify: Pre-submission history should still exist keyed by actionId
            // This allows failed event tracking to find the quote data
            expect(controller.state.txHistory[mockActionId]).toBeDefined();
            expect(controller.state.txHistory[mockActionId].actionId).toBe(
              mockActionId,
            );
            // Verify the final history is keyed by the next batchId
            expect(Object.keys(controller.state.txHistory)).toStrictEqual([
              mockActionId,
            ]);
            expect(
              controller.state.txHistory[mockActionId].batchId,
            ).toBeUndefined();
            expect(
              controller.state.txHistory[mockActionId].depositTxMeta,
            ).toBeUndefined();
            expect(
              controller.state.txHistory[mockActionId].txMetaId,
            ).toBeUndefined();
            expect(
              controller.state.txHistory[mockActionId].status.srcChain.txHash,
            ).toBeUndefined(); // Empty since tx w submitted

            expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
            const expectedProperties = {
              account_hardware_type: null,
              action_type: 'swapbridge-v1',
              chain_id_destination: 'eip155:10',
              chain_id_source: 'eip155:42161',
              custom_slippage: false,
              destination_hash_present: false,
              feature_id: 'unified_swap_bridge',
              gas_included: false,
              gas_included_7702: false,
              is_hardware_wallet: false,
              location: 'Unknown',
              price_impact: 0,
              provider: 'lifi_across',
              quoted_time_minutes: 0.25,
              slippage_limit: 0,
              source_hash_present: false,
              stx_enabled: false,
              swap_type: 'crosschain',
              token_address_destination: 'eip155:10/slip44:60',
              token_address_source: 'eip155:42161/slip44:60',
              token_security_type_destination: null,
              token_symbol_destination: 'ETH',
              token_symbol_source: 'ETH',
              usd_amount_source: 1.01,
              usd_quoted_gas: 2.5778,
              usd_quoted_return: 0,
            };

            expect(
              mockMessengerCall.mock.calls.filter(
                ([action]) =>
                  action === 'BridgeController:trackUnifiedSwapBridgeEvent',
              ),
            ).toStrictEqual([
              [
                'BridgeController:trackUnifiedSwapBridgeEvent',
                'Unified SwapBridge Submitted',
                expectedProperties,
              ],
              [
                'BridgeController:trackUnifiedSwapBridgeEvent',
                'Unified SwapBridge Failed',
                {
                  ...expectedProperties,
                  actual_time_minutes: expect.any(Number),
                  allowance_reset_transaction: undefined,
                  approval_transaction: undefined,
                  destination_transaction: 'FAILED',
                  error_code: 'unknown',
                  error_message: 'Trade tx submission failed',
                  failure_phase: 'broadcast',
                  source_transaction: 'PENDING',
                  quote_vs_execution_ratio: 0,
                  quoted_vs_used_gas_ratio: 0,
                  security_warnings: [],
                  usd_actual_gas: 0,
                  usd_actual_return: 0,
                  usd_quoted_return: 0.134214,
                },
              ],
            ]);
          },
        );
      });

      it('should use provided actionId from addTransactionFn result', async () => {
        vi.spyOn(transactionUtils, 'generateActionId')
          .mockReturnValueOnce('1111111111.222')
          .mockReturnValueOnce('1111111111.223');

        setupEventTrackingMocks(mockMessengerCall);
        setupApprovalMocks(mockMessengerCall);
        setupBridgeMocks(mockMessengerCall);

        await withController(
          { mockMessengerCall },
          async ({
            controller,
            rootMessenger,
            startPollingForBridgeTxStatusSpy,
          }) => {
            const result = await rootMessenger.call(
              'BridgeStatusController:submitTx',
              {
                operation: Operation.DEPOSIT,
                accountAddress: mockEvmQuoteResponse.trade.from,
                quoteResponses: [mockEvmQuoteResponse],
                isStxEnabled: false,
              },
            );
            controller.stopAllPolling();
            expect(result).toMatchInlineSnapshot(`
              {
                "actionId": "1111111111.223",
                "chainId": "0xa4b1",
                "hash": "0xevmTxHash",
                "id": "test-tx-id",
                "status": "unapproved",
                "time": 1234567890,
                "txParams": {
                  "chainId": "0xa4b1",
                  "data": "0xdata",
                  "from": "0xaccount1",
                  "gasLimit": "0x5208",
                  "to": "0xbridgeContract",
                  "value": "0x0",
                },
                "txReceipt": {
                  "effectiveGasPrice": "0x1880a",
                  "gasUsed": "0x2c92a",
                },
                "type": "bridge",
              }
            `);

            expect(result.id).toBe('test-tx-id');
            expect(Object.keys(controller.state.txHistory)).toStrictEqual([
              'test-tx-id',
            ]);
            expect(controller.state.txHistory['test-tx-id'].actionId).toBe(
              '1111111111.223',
            );
            expect(
              controller.state.txHistory['test-tx-id'].batchId,
            ).toBeUndefined();
            expect(
              controller.state.txHistory['test-tx-id'].depositTxMeta,
            ).toBeUndefined();
            expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          },
        );
      });
    });
  });

  describe('submitTx: EVM swap', () => {
    const mockEvmQuoteResponse = {
      ...getMockQuote(),
      quote: {
        ...getMockQuote(),
        srcChainId: 42161,
        destChainId: 42161,
      },
      estimatedProcessingTimeInSeconds: 0,
      sentAmount: { amount: '1.234', valueInCurrency: '2.00', usd: '1.01' },
      toTokenAmount: {
        amount: '1.5',
        valueInCurrency: '2.9999',
        usd: '0.134214',
      },
      minToTokenAmount: {
        amount: '1.425',
        valueInCurrency: '2.85',
        usd: '0.127',
      },
      totalNetworkFee: {
        amount: '1.234',
        valueInCurrency: undefined,
        usd: undefined,
      },
      gasFee: {
        total: { amount: '1.234', valueInCurrency: undefined, usd: '2.5778' },
      },
      adjustedReturn: { valueInCurrency: undefined, usd: undefined },
      swapRate: '1.234',
      cost: { valueInCurrency: undefined, usd: undefined },
      trade: {
        from: '0xaccount1',
        to: '0xbridgeContract',
        value: '0x0',
        data: '0xdata',
        chainId: 42161,
        gasLimit: 21000,
      },
      approval: {
        from: '0xaccount1',
        to: '0xtokenContract',
        value: '0x0',
        data: '0xapprovalData',
        chainId: 42161,
        gasLimit: 21000,
      },
    } as const;

    const mockEvmTxMeta = {
      id: 'test-tx-id',
      hash: '0xevmTxHash',
      time: 1234567890,
      status: 'unapproved',
      type: TransactionType.swap,
      chainId: '0xa4b1', // 42161 in hex
      txParams: {
        from: '0xaccount1',
        to: '0xbridgeContract',
        value: '0x0',
        data: '0xdata',
        chainId: '0xa4b1',
        gasLimit: '0x5208',
      },
    };

    const mockApprovalTxMeta = {
      id: 'test-approval-tx-id',
      hash: '0xapprovalTxHash',
      time: 1234567890,
      status: 'unapproved',
      type: TransactionType.swapApproval,
      chainId: '0xa4b1', // 42161 in hex
      txParams: {
        from: '0xaccount1',
        to: '0xtokenContract',
        value: '0x0',
        data: '0xapprovalData',
        chainId: '0xa4b1',
        gasLimit: '0x5208',
      },
    };

    const mockEstimateGasFeeResult = {
      estimates: {
        type: GasFeeEstimateType.FeeMarket,
        high: {
          suggestedMaxFeePerGas: '0x1234',
          suggestedMaxPriorityFeePerGas: '0x5678',
        },
      },
    };
    let mockMessengerCall: Mock;

    beforeEach(() => {
      vi.clearAllMocks();
      mockMessengerCall = vi.fn();
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567890);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567891);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567892);
      vi.spyOn(Date, 'now').mockReturnValueOnce(1234567893);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.456);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.457);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.458);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
    });

    const setupEventTrackingMocks = (mockCall: Mock) => {
      mockCall.mockReturnValueOnce(mockSelectedAccount);
      mockCall.mockImplementationOnce(vi.fn()); // track event
      mockCall.mockReturnValueOnce([]); // isAtomicBatchSupported
    };

    const setupApprovalMocks = () => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum-client-id');
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce({
        transactionMeta: mockApprovalTxMeta,
        result: Promise.resolve('0xapprovalTxHash'),
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [mockApprovalTxMeta],
      });
    };

    const setupBridgeMocks = () => {
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce({
        transactionMeta: mockEvmTxMeta,
        result: Promise.resolve('0xevmTxHash'),
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [mockEvmTxMeta],
      });

      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
    };

    it('should successfully submit an EVM swap transaction with approval', async () => {
      setupEventTrackingMocks(mockMessengerCall);
      setupApprovalMocks();
      setupBridgeMocks();

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: mockEvmQuoteResponse.trade.from,
              quoteResponses: [mockEvmQuoteResponse],
              isStxEnabled: false,
            },
          );
          controller.stopAllPolling();

          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'test-tx-id',
          ]);
          const { approvalTxId, depositTxMeta, next, actionId, batchId } =
            controller.state.txHistory['test-tx-id'];
          expect(approvalTxId).toBe('test-approval-tx-id');
          expect(
            mockMessengerCall.mock.calls.filter(
              ([action]) => action === 'TransactionController:addTransaction',
            ),
          ).toHaveLength(2);
          expect(depositTxMeta).toBeUndefined();
          expect(batchId).toBeUndefined();
          expect(actionId).toBe('1234567891.456');
          expect(next).toMatchInlineSnapshot(`
            [
              {
                "operation": "deposit",
                "partialQuote": {
                  "approval": {
                    "chainId": 42161,
                    "data": "0xapprovalData",
                    "from": "0xaccount1",
                    "gasLimit": 21000,
                    "to": "0xtokenContract",
                    "value": "0x0",
                  },
                  "estimatedProcessingTimeInSeconds": 0,
                  "quoteId": undefined,
                  "resetApproval": undefined,
                  "trade": {
                    "chainId": 42161,
                    "data": "0xdata",
                    "from": "0xaccount1",
                    "gasLimit": 21000,
                    "to": "0xbridgeContract",
                    "value": "0x0",
                  },
                },
              },
            ]
          `);
        },
      );
    });

    it('should handle a gasless swap transaction with approval', async () => {
      mockGenerateBatchId.mockReturnValue(BATCH_ID_1);
      setupEventTrackingMocks(mockMessengerCall);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arbitrum');
      addTransactionBatchFnMock.mockResolvedValueOnce({
        batchId: BATCH_ID_1,
      });
      mockMessengerCall.mockReturnValueOnce({
        transactions: [{ ...mockEvmTxMeta, batchId: BATCH_ID_1 }],
      });

      const getAddTransactionBatchParamsSpy = vi.spyOn(
        transactionUtils,
        'getAddTransactionBatchParams',
      );

      await withController(
        { mockMessengerCall },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.DEPOSIT,
              accountAddress: mockEvmQuoteResponse.trade.from,
              quoteResponses: [
                {
                  ...mockEvmQuoteResponse,
                  quote: {
                    ...mockEvmQuoteResponse.quote,
                    gasIncluded: true,
                    feeData: {
                      ...mockEvmQuoteResponse.quote.feeData,
                      txFee: {
                        amount: '100',
                        asset: getNativeAssetForChainId(42161),
                        maxFeePerGas: '123',
                        maxPriorityFeePerGas: '123',
                      },
                    },
                  },
                },
              ],
              isStxEnabled: true,
            },
          );
          controller.stopAllPolling();

          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(addTransactionBatchFnMock).toHaveBeenCalledTimes(1);
          expect(
            mockMessengerCall.mock.calls.filter(
              ([action]) => action === 'TransactionController:addTransaction',
            ),
          ).toHaveLength(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            'test-tx-id',
          ]);
          expect(controller.state.txHistory['test-tx-id'].batchId).toBe(
            BATCH_ID_1,
          );
          expect(
            controller.state.txHistory['test-tx-id'].actionId,
          ).toBeUndefined();
          expect(
            controller.state.txHistory['test-tx-id'].depositTxMeta,
          ).toBeUndefined();
          expect(controller.state.txHistory['test-tx-id'].next)
            .toMatchInlineSnapshot(`
              [
                {
                  "operation": "deposit",
                  "partialQuote": {
                    "approval": {
                      "chainId": 42161,
                      "data": "0xapprovalData",
                      "from": "0xaccount1",
                      "gasLimit": 21000,
                      "to": "0xtokenContract",
                      "value": "0x0",
                    },
                    "estimatedProcessingTimeInSeconds": 0,
                    "quoteId": undefined,
                    "resetApproval": undefined,
                    "trade": {
                      "chainId": 42161,
                      "data": "0xdata",
                      "from": "0xaccount1",
                      "gasLimit": 21000,
                      "to": "0xbridgeContract",
                      "value": "0x0",
                    },
                  },
                },
              ]
            `);
          expect(mockMessengerCall).toHaveBeenCalledTimes(8);
        },
      );

      const { messenger, tradeData, ...params } =
        getAddTransactionBatchParamsSpy.mock.calls[0][0];
      expect(params).toMatchInlineSnapshot(`
        {
          "atomic": true,
          "batchId": "0x1234BatchId",
          "disable7702": true,
          "isDelegatedAccount": false,
          "isGasFeeIncluded": false,
          "isGasFeeSponsored": false,
          "requireApproval": false,
        }
      `);
    });
  });

  describe('post-swap deposit', () => {
    const SWAP_ID = 'swapTxMetaId1';
    const SRC_HASH = '0xsrcTxHash1';
    const DEST_HASH = '0xdestTxHash1';
    const DEPOSIT_TX_ID = 'deposit-tx-id';
    const DEPOSIT_HASH = '0xdepositHash';
    const DEPOSIT_DATA = '0xdeposit';
    const DEST_ASSET = '0x0000000000000000000000000000000000000001';
    const MONEY_ACCOUNT = '0x1111111111111111111111111111111111111111';
    const TRANSFER_TOPIC =
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

    const UNDERLYING_TOKEN =
      '0x8888888888888888888888888888888888888888' as const;
    const vaultConfig = (chainId: string = CHAIN_IDS.ARBITRUM) => ({
      chainId,
      boringVault: '0x2222222222222222222222222222222222222222',
      tellerAddress: '0x3333333333333333333333333333333333333333',
      accountantAddress: '0x4444444444444444444444444444444444444444',
      lensAddress: '0x5555555555555555555555555555555555555555',
      underlyingToken: UNDERLYING_TOKEN,
    });

    const depositBatch = () => ({
      approveTx: {
        type: TransactionType.tokenMethodApprove,
        params: {
          to: '0x6666666666666666666666666666666666666666',
          data: '0xapprove',
          value: '0x0',
        },
      },
      depositTx: {
        type: TransactionType.moneyAccountDeposit,
        params: {
          to: '0x7777777777777777777777777777777777777777',
          data: DEPOSIT_DATA,
          value: '0x0',
        },
      },
    });

    const receiptLogs = (wallet = '0xaccount1') => [
      {
        address: DEST_ASSET,
        topics: [
          TRANSFER_TOPIC,
          `0x${'0'.repeat(64)}`,
          `0x${wallet.slice(2).padStart(64, '0')}`,
        ],
        data: '0x64',
      },
    ];

    const transactionReceipt = (
      logs: { address?: string; topics?: string[]; data?: string }[],
    ) => ({ logs });

    const depositTxMeta = (hash?: string): TransactionMeta => ({
      id: DEPOSIT_TX_ID,
      batchId: BATCH_ID_1,
      type: TransactionType.moneyAccountDeposit,
      status: TransactionStatus.confirmed,
      chainId: CHAIN_IDS.ARBITRUM,
      networkClientId: 'arb',
      time: 1,
      txParams: {
        data: DEPOSIT_DATA,
        from: MONEY_ACCOUNT,
        to: '0x7777777777777777777777777777777777777777',
      },
      ...(hash ? { hash } : {}),
    });

    const swapHistory = ({
      srcChainId = 42161,
      destChainId = 42161,
      srcTxHash = SRC_HASH,
      destTxHash,
      destWalletAddress,
      walletAddress,
      gasSponsored,
      gasIncluded7702,
      startTime = Date.now(),
    }: {
      srcChainId?: number;
      destChainId?: number;
      srcTxHash?: string;
      destTxHash?: string;
      destWalletAddress?: string | null;
      walletAddress?: string | null;
      gasSponsored?: boolean;
      gasIncluded7702?: boolean;
      startTime?: number;
    } = {}): Record<string, BridgeHistoryItem> => {
      const pending = MockTxHistory.getPendingSwap({
        txMetaId: SWAP_ID,
        srcTxHash,
        srcChainId,
        destChainId,
      })[SWAP_ID];
      const historyItem: BridgeHistoryItem = {
        ...pending,
        startTime,
        quote: {
          ...pending.quote,
          destAsset: { ...pending.quote.destAsset, address: DEST_ASSET },
          destWalletAddress:
            destWalletAddress === null
              ? undefined
              : (destWalletAddress ?? '0xaccount1'),
          walletAddress: walletAddress === null ? undefined : walletAddress,
          gasSponsored,
          gasIncluded7702,
        },
        next: [
          {
            operation: Operation.DEPOSIT,
            partialQuote: {
              estimatedProcessingTimeInSeconds: 15,
              trade: {
                chainId: destChainId,
                to: '0x1111111111111111111111111111111111111111',
                from: '0x2222222222222222222222222222222222222222',
                value: '0x0',
                data: '0x',
                gasLimit: null,
              },
            },
          },
        ],
      };
      if (destTxHash && historyItem.status.destChain) {
        historyItem.status = {
          ...historyItem.status,
          destChain: {
            ...historyItem.status.destChain,
            txHash: destTxHash,
          },
        };
      }
      return { [SWAP_ID]: historyItem };
    };

    const trackedEvents = (messengerCall: Mock) =>
      messengerCall.mock.calls
        .filter(
          ([action]) =>
            action === 'BridgeController:trackUnifiedSwapBridgeEvent',
        )
        .map(([, eventName]) => eventName);

    const defaultProvider = () => ({
      request: vi.fn(),
      send: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    });

    const queueDepositMessenger = (
      transactions: TransactionMeta[] = [depositTxMeta(DEPOSIT_HASH)],
      options: {
        account?: { id?: string; address: string };
        moneyAccount?: { address?: string };
        provider?: ReturnType<typeof defaultProvider>;
      } = {},
    ) => {
      const account =
        'account' in options ? options.account : mockSelectedAccount;
      const moneyAccount =
        'moneyAccount' in options
          ? options.moneyAccount
          : { id: 'money-account-id', address: MONEY_ACCOUNT };
      const provider =
        'provider' in options ? options.provider : defaultProvider();
      const messengerCall = vi.fn((action: string, ..._args: unknown[]) => {
        switch (action) {
          case 'AccountsController:getAccountByAddress':
            return account;
          case 'TransactionController:isAtomicBatchSupported':
            return [];
          case 'MoneyAccountController:getMoneyAccount':
            return moneyAccount;
          case 'RemoteFeatureFlagController:getState':
            return {
              remoteFeatureFlags: { bridgeConfig: {} },
              cacheTimestamp: 1,
            };
          case 'NetworkController:findNetworkClientIdByChainId':
            return 'arb';
          case 'NetworkController:getNetworkClientById':
            return { provider };
          case 'NetworkController:getState':
            return { selectedNetworkClientId: 'arb' };
          case 'TransactionController:estimateGasFee':
            return {
              estimates: {
                type: GasFeeEstimateType.FeeMarket,
                high: {
                  suggestedMaxFeePerGas: '0x1234',
                  suggestedMaxPriorityFeePerGas: '0x5678',
                },
              },
            };
          case 'TransactionController:getState':
            return { transactions };
          case 'BridgeController:trackUnifiedSwapBridgeEvent':
            return;
          case 'AuthenticationController:getBearerToken':
            return 'auth-token';
          case 'TransactionPayController:setTransactionConfig':
          case 'TransactionPayController:updatePaymentToken':
            return;
          case 'ApprovalController:acceptRequest':
            return Promise.resolve();
          case 'ApprovalController:rejectRequest':
          default:
        }
      });
      return messengerCall;
    };

    const publishSwap = (
      rootMessenger: RootMessenger,
      status: TransactionStatus,
      id = SWAP_ID,
    ) => {
      const transactionMeta: TransactionMeta = {
        id,
        hash: SRC_HASH,
        status,
        type: TransactionType.swap,
        chainId: CHAIN_IDS.ARBITRUM,
        networkClientId: 'arb',
        time: 1,
        txParams: { from: '0xaccount1' },
      };
      rootMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta,
      });
    };

    const publishPayQuotes = (
      rootMessenger: RootMessenger,
      quotes: ReturnType<typeof getMockPayQuote>[],
    ) => {
      rootMessenger.publish(
        'TransactionPayController:stateChange',
        getMockPayControllerState(DEPOSIT_TX_ID, quotes),
        [],
      );
    };

    const publishUnapprovedDeposit = (rootMessenger: RootMessenger) => {
      rootMessenger.publish(
        'TransactionController:unapprovedTransactionAdded',
        {
          ...depositTxMeta(DEPOSIT_HASH),
          status: TransactionStatus.unapproved,
        },
      );
    };

    const completeMmPay = async (rootMessenger: RootMessenger) => {
      publishUnapprovedDeposit(rootMessenger);
      await flushPromises();
      publishPayQuotes(rootMessenger, [getMockPayQuote()]);
      await flushPromises();
    };

    const flushDeposit = async () => {
      await flushPromises();
      await flushPromises();
      await flushPromises();
      await flushPromises();
    };

    let receipt: ReturnType<typeof transactionReceipt>;

    beforeEach(() => {
      mockGenerateBatchId.mockReset();
      mockGenerateBatchId.mockReturnValue(BATCH_ID_1);
      mockGetMoneyAccountVaultConfig.mockReturnValue(vaultConfig());
      mockBuildMoneyAccountDepositBatch.mockResolvedValue(depositBatch());
      receipt = transactionReceipt(receiptLogs());
      vi.spyOn(networkUtils, 'getWeb3Provider').mockImplementation(
        (messenger, chainId) => {
          const networkProvider = networkUtils.getNetworkClientByChainId(
            messenger,
            chainId,
          );
          if (!networkProvider) {
            throw new Error(`No provider available for chain ${chainId}`);
          }
          // const provider = new Web3Provider(networkProvider);
          const provider = {
            getTransactionReceipt: async () => ({
              to: DEST_ASSET,
              from: MONEY_ACCOUNT,
              contractAddress: DEST_ASSET,
              transactionIndex: 0,
              gasUsed: null as never,
              logsBloom: `0x${'0'.repeat(512)}`,
              blockHash: `0x${'0'.repeat(64)}`,
              transactionHash: SRC_HASH,
              logs: (receipt.logs ?? []).map((log, logIndex) => ({
                blockNumber: 1,
                blockHash: `0x${'0'.repeat(64)}`,
                transactionIndex: 0,
                removed: false,
                address: log.address ?? DEST_ASSET,
                data: log.data ?? '0x',
                topics: log.topics ?? [],
                transactionHash: SRC_HASH,
                logIndex,
              })),
              blockNumber: 1,
              confirmations: 1,
              cumulativeGasUsed: null as never,
              effectiveGasPrice: null as never,
              byzantium: true,
              type: 0,
              status: 1,
            }),
          };
          return provider as never;
        },
      );
    });

    it('throws before the deposit batch when params are missing', async () => {
      const selectedAccount: InternalAccount = {
        type: 'eip155:eoa',
        id: 'test-account-id',
        address: '0xaccount1',
        scopes: ['eip155:42161'],
        options: {},
        methods: [],
        metadata: {
          name: 'Account 1',
          importTime: 0,
          keyring: { type: 'HD Key Tree' },
        },
      };
      const traceFn: SwapTraceFunction<TraceName> = (
        _request: SwapTraceRequest<TraceName>,
        fn?: (args?: unknown) => unknown,
      ) => fn?.();

      await withController(async ({ messenger }) => {
        const params = ({
          previousTxHash,
          historyKey,
          batchId,
        }: {
          previousTxHash?: string;
          historyKey?: string;
          batchId?: `0x${string}`;
        } = {}): SubmitStrategyParams<Trade> => ({
          addTransactionBatchFn: async () => ({ batchId: BATCH_ID_1 }),
          messenger,
          traceFn,
          fetchFn: () => Promise.resolve(new Response()),
          batchSellTrades: null,
          isBridgeTx: false,
          isDelegatedAccount: false,
          isStxEnabled: false,
          requireApproval: false,
          selectedAccount,
          clientId: BridgeClientId.EXTENSION,
          bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
          quoteResponses: [
            {
              quote: getMockQuote(),
              trade: {
                chainId: 42161,
                to: '0x1111111111111111111111111111111111111111',
                from: '0x2222222222222222222222222222222222222222',
                value: '0x0',
                data: '0x',
                gasLimit: null,
              },
              estimatedProcessingTimeInSeconds: 15,
            },
          ],
          previousTxHash,
          historyKey,
          batchId,
        });

        await expect(submitDepositHandler(params()).next()).rejects.toThrow(
          'Previous transaction hash is required for deposit',
        );
        await expect(
          submitDepositHandler(params({ previousTxHash: SRC_HASH })).next(),
        ).rejects.toThrow('History key is required for deposit');
        await expect(
          submitDepositHandler(
            params({ previousTxHash: SRC_HASH, historyKey: SWAP_ID }),
          ).next(),
        ).rejects.toThrow('Batch ID is required for deposit');
      });
    });

    it('runs the deposit after the swap confirms and completes only after the deposit', async () => {
      const messengerCall = queueDepositMessenger();
      addTransactionBatchFnMock = vi.fn();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: swapHistory() },
          },
        },
        async ({ controller, rootMessenger }) => {
          addTransactionBatchFnMock.mockImplementation(async () => {
            await completeMmPay(rootMessenger);
          });
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushDeposit();

          expect(mockBuildMoneyAccountDepositBatch).toHaveBeenCalledTimes(1);
          expect(addTransactionBatchFnMock).toHaveBeenCalledTimes(1);
          expect(trackedEvents(messengerCall)).not.toContain(
            UnifiedSwapBridgeEventName.Completed,
          );
          expect(
            controller.state.txHistory[SWAP_ID].depositTxMeta,
          ).toStrictEqual({
            batchId: BATCH_ID_1,
            id: DEPOSIT_TX_ID,
          });
          expect(controller.state.txHistory[SWAP_ID].next).toStrictEqual([]);
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.COMPLETE,
          );

          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();
          expect(mockBuildMoneyAccountDepositBatch).toHaveBeenCalledTimes(1);
          expect(trackedEvents(messengerCall)).not.toContain(
            UnifiedSwapBridgeEventName.Completed,
          );

          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            { transactionMeta: depositTxMeta() },
          );
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.COMPLETE,
          );
          expect(trackedEvents(messengerCall)).toContain(
            UnifiedSwapBridgeEventName.Completed,
          );
        },
      );
    });

    it('deposits after an expired swap quote without refreshing it', async () => {
      const messengerCall = queueDepositMessenger();
      addTransactionBatchFnMock = vi.fn();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: swapHistory({ startTime: 0 }) },
          },
        },
        async ({ controller, rootMessenger }) => {
          addTransactionBatchFnMock.mockImplementation(async () => {
            await completeMmPay(rootMessenger);
          });
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushDeposit();

          expect(
            messengerCall.mock.calls.filter(
              ([action]) => action === 'BridgeController:fetchQuotes',
            ),
          ).toHaveLength(0);
          expect(mockBuildMoneyAccountDepositBatch).toHaveBeenCalledTimes(1);
          expect(
            controller.state.txHistory[SWAP_ID].depositTxMeta,
          ).toStrictEqual({
            batchId: BATCH_ID_1,
            id: DEPOSIT_TX_ID,
          });
          expect(controller.state.txHistory[SWAP_ID].status.status).not.toBe(
            StatusTypes.FAILED,
          );
        },
      );
    });

    it('runs the deposit after a bridge completes and skips completed until the deposit confirms', async () => {
      vi.useFakeTimers();
      vi.spyOn(Date, 'now').mockReturnValue(1729964825189);
      const messengerCall = queueDepositMessenger();
      addTransactionBatchFnMock = vi.fn();
      vi.spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus').mockResolvedValue({
        status: MockStatusResponse.getComplete({
          srcTxHash: SRC_HASH,
          destTxHash: DEST_HASH,
        }),
        validationFailures: [],
      });

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: {
              txHistory: swapHistory({
                destChainId: 10,
                destTxHash: DEST_HASH,
                walletAddress: '0xaccount1',
                destWalletAddress: null,
              }),
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          addTransactionBatchFnMock.mockImplementation(async () => {
            await completeMmPay(rootMessenger);
          });
          controller.startPolling({ bridgeTxMetaId: SWAP_ID });
          await flushDeposit();
          vi.advanceTimersByTime(10000);
          await flushDeposit();

          expect(mockBuildMoneyAccountDepositBatch).toHaveBeenCalledTimes(1);
          expect(trackedEvents(messengerCall)).not.toContain(
            UnifiedSwapBridgeEventName.Completed,
          );
          expect(controller.state.txHistory[SWAP_ID].depositTxMeta?.id).toBe(
            DEPOSIT_TX_ID,
          );
          vi.useRealTimers();
        },
      );
    });

    it('publishes failed and skips the deposit when the swap fails', async () => {
      const messengerCall = queueDepositMessenger();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.failed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(trackedEvents(messengerCall)).toContain(
            UnifiedSwapBridgeEventName.Failed,
          );
          expect(trackedEvents(messengerCall)).not.toContain(
            UnifiedSwapBridgeEventName.Completed,
          );
        },
      );
    });

    it.each([
      {
        name: 'deposit config',
        options: {},
        omitUnderlyingToken: true,
      },
      {
        name: 'money account',
        options: { moneyAccount: undefined },
      },
      {
        name: 'money account address',
        options: { moneyAccount: {} },
      },
      {
        name: 'provider',
        options: { provider: undefined },
      },
      {
        name: 'received amount',
        options: {},
        logs: [],
      },
    ])(
      'publishes failed when the $name is missing',
      async ({ options, logs, omitUnderlyingToken }) => {
        if (logs) {
          receipt = transactionReceipt(logs);
        }
        if (omitUnderlyingToken) {
          mockGetMoneyAccountVaultConfig.mockReturnValue({
            ...vaultConfig(),
            underlyingToken: undefined,
          });
        }
        const messengerCall = queueDepositMessenger([], options);

        await withController(
          {
            mockMessengerCall: messengerCall,
            options: { state: { txHistory: swapHistory() } },
          },
          async ({ controller, rootMessenger }) => {
            publishSwap(rootMessenger, TransactionStatus.confirmed);
            await flushPromises();

            expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
            expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
              StatusTypes.FAILED,
            );
            expect(trackedEvents(messengerCall)).toContain(
              UnifiedSwapBridgeEventName.Failed,
            );
            expect(trackedEvents(messengerCall)).not.toContain(
              UnifiedSwapBridgeEventName.Completed,
            );
          },
        );
      },
    );

    it('publishes failed when underlying token disappears while building deposit txs', async () => {
      let underlyingTokenReads = 0;
      mockGetMoneyAccountVaultConfig.mockReturnValue({
        ...vaultConfig(),
        get underlyingToken() {
          underlyingTokenReads += 1;
          return underlyingTokenReads === 1 ? UNDERLYING_TOKEN : undefined;
        },
      });
      const messengerCall = queueDepositMessenger([]);

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
        },
      );
    });

    it('publishes failed when the deposit batch tx has no hash', async () => {
      mockGetMoneyAccountVaultConfig.mockReturnValue(vaultConfig());
      const messengerCall = queueDepositMessenger([depositTxMeta()]);
      addTransactionBatchFnMock = vi.fn();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: {
              txHistory: swapHistory({
                destWalletAddress: null,
                walletAddress: null,
                gasSponsored: true,
                gasIncluded7702: true,
              }),
            },
          },
        },
        async ({ controller, messenger, rootMessenger }) => {
          addTransactionBatchFnMock.mockImplementation(async () => {
            await completeMmPay(rootMessenger);
          });
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushDeposit();

          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(trackedEvents(messengerCall)).toContain(
            UnifiedSwapBridgeEventName.Failed,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Transaction failed due to missing tx meta',
            }),
          );
        },
      );
    });

    it('rethrows addTransactionBatchFn error if the deposit tx is not in state', async () => {
      const messengerCall = queueDepositMessenger([]);
      addTransactionBatchFnMock = vi
        .fn()
        .mockRejectedValue(new Error('Failed to add batch'));

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: swapHistory() },
          },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(addTransactionBatchFnMock).toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            new Error('Failed to add batch'),
          );
        },
      );
    });

    it('publishes failed when the vault config is missing', async () => {
      mockGetMoneyAccountVaultConfig.mockReturnValue(undefined);
      const messengerCall = queueDepositMessenger();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            new Error('Failed to get money account deposit config'),
          );
        },
      );
    });

    it('ignores an unmatched money-account deposit', async () => {
      const messengerCall = vi.fn();
      await withController(
        { mockMessengerCall: messengerCall },
        async ({ controller, rootMessenger }) => {
          messengerCall.mockClear();
          expect(() =>
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              { transactionMeta: depositTxMeta(DEPOSIT_HASH) },
            ),
          ).not.toThrow();
          expect(controller.state.txHistory).toStrictEqual({});
          expect(messengerCall).not.toHaveBeenCalled();
        },
      );
    });

    it('ignores a nested deposit batch with no matching history item', async () => {
      const messengerCall = vi.fn();
      await withController(
        { mockMessengerCall: messengerCall },
        async ({ controller, rootMessenger }) => {
          messengerCall.mockClear();
          expect(() =>
            rootMessenger.publish(
              'TransactionController:transactionStatusUpdated',
              {
                transactionMeta: {
                  ...depositTxMeta(DEPOSIT_HASH),
                  type: TransactionType.batch,
                  nestedTransactions: [
                    { type: TransactionType.moneyAccountDeposit },
                  ],
                },
              },
            ),
          ).not.toThrow();
          expect(controller.state.txHistory).toStrictEqual({});
        },
      );
    });

    it('marks history failed when a matching deposit fails', async () => {
      const messengerCall = queueDepositMessenger();
      const history = swapHistory();
      history[SWAP_ID].next = [];
      history[SWAP_ID].depositTxMeta = { batchId: BATCH_ID_1 };

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                ...depositTxMeta(DEPOSIT_HASH),
                status: TransactionStatus.failed,
                error: { name: 'Error', message: 'tx-error' },
              },
            },
          );
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(trackedEvents(messengerCall)).toContain(
            UnifiedSwapBridgeEventName.Failed,
          );
        },
      );
    });

    it('ignores a non-terminal matching deposit status', async () => {
      const messengerCall = queueDepositMessenger();
      const history = swapHistory();
      history[SWAP_ID].next = [];
      history[SWAP_ID].depositTxMeta = { batchId: BATCH_ID_1 };

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                ...depositTxMeta(DEPOSIT_HASH),
                status: TransactionStatus.submitted,
              },
            },
          );
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).not.toBe(
            StatusTypes.COMPLETE,
          );
          expect(controller.state.txHistory[SWAP_ID].status.status).not.toBe(
            StatusTypes.FAILED,
          );
        },
      );
    });

    it('skips the next action when the dest token is unexpected', async () => {
      const messengerCall = queueDepositMessenger();
      const history = swapHistory();
      history[SWAP_ID].status.isExpectedToken = false;

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: `Incorrect token received from bridge tx, skipping next action: ${SWAP_ID}`,
            }),
          );
        },
      );
    });

    it('skips the next action when the account is missing', async () => {
      const messengerCall = queueDepositMessenger([], { account: undefined });

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(mockBuildMoneyAccountDepositBatch).not.toHaveBeenCalled();
          expect(
            controller.state.txHistory[SWAP_ID].depositTxMeta,
          ).toStrictEqual({
            batchId: BATCH_ID_1,
          });
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Account not found, skipping next action: 0xaccount1',
            }),
          );
        },
      );
    });

    it('runs a follow-up solana swap after confirm', async () => {
      const solAccount = {
        ...mockSelectedAccount,
        metadata: {
          snap: { id: 'test-snap' },
          keyring: { type: ['any'] },
        },
      };
      const messengerCall = vi.fn(
        (
          action: string,
          request?: { request?: { params?: { transaction?: string } } },
        ) => {
          switch (action) {
            case 'AccountsController:getAccountByAddress':
              return solAccount;
            case 'SnapController:handleRequest': {
              if (request?.request?.params?.transaction === 'solana-approval') {
                return { signature: 'sol-approval' };
              }
              return { signature: 'sol-sig' };
            }
            case 'TransactionController:getState':
              return { transactions: [] };
            case 'BridgeController:trackUnifiedSwapBridgeEvent':
            default:
          }
        },
      );
      const history = swapHistory({
        srcChainId: ChainId.SOLANA,
        destChainId: ChainId.SOLANA,
      });
      history[SWAP_ID].next = [
        {
          operation: Operation.SWAP,
          partialQuote: {
            estimatedProcessingTimeInSeconds: 15,
            trade: 'solana-trade',
            approval: 'solana-approval' as never,
          },
        },
      ];

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();
          expect(controller.state.txHistory[SWAP_ID].next).toStrictEqual([]);
          expect(controller.state.txHistory[SWAP_ID].txMetaId).toBe('sol-sig');
          expect(controller.state.txHistory[SWAP_ID].approvalTxId).toBe(
            'sol-approval',
          );
        },
      );
    });

    it('runs a follow-up smart-transaction swap after confirm', async () => {
      const messengerCall = queueDepositMessenger();
      addTransactionBatchFnMock = vi.fn().mockResolvedValue({
        batchId: BATCH_ID_1,
      });
      const history = swapHistory();
      history[SWAP_ID].isStxEnabled = true;
      history[SWAP_ID].next = [
        {
          operation: Operation.SWAP,
          partialQuote: history[SWAP_ID].next?.[0]?.partialQuote ?? {
            estimatedProcessingTimeInSeconds: 15,
            trade: {
              chainId: 42161,
              to: '0x1111111111111111111111111111111111111111',
              from: '0x2222222222222222222222222222222222222222',
              value: '0x0',
              data: '0x',
              gasLimit: null,
            },
          },
        },
      ];

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: history },
          },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();
          expect(addTransactionBatchFnMock).toHaveBeenCalled();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            new Error(
              'Failed to update cross-chain swap transaction batch: tradeMeta not found',
            ),
          );
        },
      );
    });

    it('updates history from a follow-up swap after withdraw', async () => {
      const messengerCall = queueDepositMessenger();
      const history = swapHistory();
      history[SWAP_ID].next = [
        {
          operation: Operation.SWAP,
          partialQuote: history[SWAP_ID].next?.[0]?.partialQuote ?? {
            estimatedProcessingTimeInSeconds: 15,
            trade: {
              chainId: 42161,
              to: '0x1111111111111111111111111111111111111111',
              from: '0x2222222222222222222222222222222222222222',
              value: '0x0',
              data: '0x',
              gasLimit: null,
            },
          },
        },
      ];

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({ controller, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].next).toStrictEqual([]);
          expect(controller.state.txHistory[SWAP_ID].actionId).toBe(BATCH_ID_1);
          expect(controller.state.txHistory[SWAP_ID].batchId).toBe(BATCH_ID_1);
        },
      );
    });

    it('attaches trade identity on a follow-up intent submit', async () => {
      vi.spyOn(intentApi, 'postSubmitOrder').mockResolvedValue({
        id: 'order-uid-1',
        status: IntentOrderStatus.SUBMITTED,
        txHash: undefined,
        metadata: { txHashes: [] },
      });
      const getOrderStatusSpy = vi
        .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
        .mockResolvedValue({
          id: 'order-uid-1',
          status: IntentOrderStatus.COMPLETED,
          txHash: '0xfilled',
          metadata: { txHashes: ['0xfilled'] },
        });
      const baseMessengerCall = queueDepositMessenger();
      const messengerCall = vi.fn((action: string, ...args: unknown[]) => {
        if (action === 'KeyringController:signTypedMessage') {
          return '0xsignature';
        }
        if (action === 'TransactionController:addTransaction') {
          return {
            transactionMeta: {
              id: 'intent-synthetic-id',
              status: TransactionStatus.submitted,
              chainId: CHAIN_IDS.ARBITRUM,
              networkClientId: 'arb',
              time: 1,
              txParams: { from: '0xaccount1' },
            },
            result: Promise.resolve('0xunused'),
          };
        }
        return baseMessengerCall(action, ...args);
      });
      const history = swapHistory();
      history[SWAP_ID].quote = {
        ...history[SWAP_ID].quote,
        intent: {
          protocol: 'cowswap',
          order: {
            sellToken: '0x0000000000000000000000000000000000000001',
            buyToken: '0x0000000000000000000000000000000000000002',
            validTo: 1717027200,
            appData: 'some-app-data',
            appDataHash: '0xabcd',
            feeAmount: '100',
            kind: 'sell',
            partiallyFillable: false,
            sellAmount: '1000',
          },
          typedData: {
            types: {},
            primaryType: 'Order',
            domain: {},
            message: {},
          },
        },
      };
      history[SWAP_ID].next = [
        {
          operation: Operation.SWAP,
          partialQuote: {
            estimatedProcessingTimeInSeconds: 15,
            trade: {
              chainId: 42161,
              to: '0x1111111111111111111111111111111111111111',
              from: '0x2222222222222222222222222222222222222222',
              value: '0x0',
              data: '0x',
              gasLimit: null,
            },
          },
        },
      ];

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: history } },
        },
        async ({
          controller,
          rootMessenger,
          startPollingForBridgeTxStatusSpy,
        }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].txMetaId).toBe(
            'intent-synthetic-id',
          );
          expect(
            controller.state.txHistory[SWAP_ID].originalTransactionId,
          ).toBe('intent-synthetic-id');
          expect(controller.state.txHistory[SWAP_ID].orderId).toBe(
            'order-uid-1',
          );
          expect(controller.state.txHistory['order-uid-1']).toBeUndefined();
          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledWith({
            bridgeTxMetaId: SWAP_ID,
          });

          await controller._executePoll({ bridgeTxMetaId: SWAP_ID });

          expect(getOrderStatusSpy).toHaveBeenCalledWith(
            'order-uid-1',
            'cowswap',
            42161,
            'extension',
          );
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.COMPLETE,
          );
        },
      );
    });

    it('captures a non-Error thrown while locking the next action', async () => {
      mockGenerateBatchId.mockReset();
      mockGenerateBatchId.mockImplementation(() => {
        throw new Error('batch-id boom');
      });
      const messengerCall = queueDepositMessenger();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'batch-id boom' }),
          );
        },
      );
    });

    it('swallows a rejected swap-operation-completed trace on failure', async () => {
      mockTraceFn.mockImplementation(
        (
          request: SwapTraceRequest<TraceName>,
          fn?: (args?: unknown) => unknown,
        ) => {
          if (request.name === TraceName.SwapOperationCompleted) {
            throw new Error('trace boom');
          }
          return fn?.();
        },
      );
      const messengerCall = queueDepositMessenger();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: { state: { txHistory: swapHistory() } },
        },
        async ({ controller, rootMessenger }) => {
          expect(() =>
            publishSwap(rootMessenger, TransactionStatus.failed),
          ).not.toThrow();
          await flushPromises();
          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
        },
      );
    });

    it('sponsors gas when the vault chain is monad', async () => {
      mockGetMoneyAccountVaultConfig.mockReturnValue(
        vaultConfig(CHAIN_IDS.MONAD),
      );
      const messengerCall = queueDepositMessenger();
      addTransactionBatchFnMock = vi.fn();

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: swapHistory() },
          },
        },
        async ({ rootMessenger }) => {
          addTransactionBatchFnMock.mockImplementation(async () => {
            await completeMmPay(rootMessenger);
          });
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushDeposit();

          expect(addTransactionBatchFnMock).toHaveBeenCalledWith(
            expect.objectContaining({ isGasFeeSponsored: true }),
          );
        },
      );
    });

    it('does not report a submitted swap without a hash', () => {
      const onReportSubmittedOnce = vi.fn();
      tradeUpdateHandler({
        txMeta: {
          id: SWAP_ID,
          type: TransactionType.swap,
          status: TransactionStatus.submitted,
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'arb',
          time: 1,
          txParams: { from: '0xaccount1' },
        },
        historyKey: SWAP_ID,
        onTransactionConfirmed: vi.fn(),
        onTransactionFailed: vi.fn(),
        onReportSubmittedOnce,
      });
      expect(onReportSubmittedOnce).not.toHaveBeenCalled();
    });

    it('captures a non-Error from addTransactionBatchFn', async () => {
      const messengerCall = queueDepositMessenger([]);
      addTransactionBatchFnMock = vi.fn().mockRejectedValue('batch boom');

      await withController(
        {
          mockMessengerCall: messengerCall,
          options: {
            addTransactionBatchFn: addTransactionBatchFnMock,
            state: { txHistory: swapHistory() },
          },
        },
        async ({ controller, messenger, rootMessenger }) => {
          publishSwap(rootMessenger, TransactionStatus.confirmed);
          await flushPromises();
          await flushPromises();

          expect(controller.state.txHistory[SWAP_ID].status.status).toBe(
            StatusTypes.FAILED,
          );
          expect(messenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'batch boom' }),
          );
        },
      );
    });
  });
});
