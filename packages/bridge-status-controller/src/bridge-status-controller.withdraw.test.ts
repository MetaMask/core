/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable vitest/no-restricted-matchers */
import type {
  TxData,
  Trade,
  SwapTraceRequest,
} from '@metamask/bridge-controller';
import {
  StatusTypes,
  getNativeAssetForChainId,
  formatAddressToAssetId,
  FeatureId,
  MetaMetricsSwapsEventSource,
  ChainId,
  REFRESH_INTERVAL_MS,
} from '@metamask/bridge-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MessengerActions, MessengerEvents } from '@metamask/messenger';
import type { MoneyAccountVaultConfig } from '@metamask/money-account-utils';
import {
  CHAIN_IDS,
  GasFeeEstimateType,
  TransactionType,
  TransactionStatus,
} from '@metamask/transaction-controller';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { flushPromises } from '../../../tests/vitest/helpers.js';
import {
  getMockInternalAccount,
  getMockPayControllerState,
  getMockPayQuote,
  getMockQuote,
  MockStatusResponse,
  registerDefaultActionHandlers,
  withController as withControllerBase,
} from './__fixtures__/test-utils.js';
import type { RootMessenger } from './__fixtures__/test-utils.js';
import { BridgeStatusController } from './bridge-status-controller.js';
import { BRIDGE_STATUS_CONTROLLER_NAME } from './constants.js';
import type { TraceName } from './constants.js';
import { SubmitStep } from './strategy/types.js';
import type { SubmitStrategyParams } from './strategy/types.js';
import { submitWithdrawHandler } from './strategy/withdraw-strategy.js';
import { BridgeClientId, Operation } from './types.js';
import type {
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
} from './types.js';
import * as historyUtils from './utils/history.js';
import * as transactionUtils from './utils/transaction.js';

const mockGetMoneyAccountVaultConfig =
  vi.fn<() => MoneyAccountVaultConfig | undefined>();
const mockBuildMoneyAccountWithdrawBatch = vi.fn();
vi.mock('@metamask/money-account-utils', async (importOriginal) => ({
  ...(await importOriginal()),
  getMoneyAccountVaultConfig: () => mockGetMoneyAccountVaultConfig(),
  // oxlint-disable-next-line typescript/no-unsafe-return
  buildMoneyAccountWithdrawBatch: (...args: unknown[]) =>
    mockBuildMoneyAccountWithdrawBatch(...args),
}));

const WITHDRAW_SWAP_TX_HASH = '0xwithdrawHash1';
const { mockSubmitEvmHandler } = vi.hoisted(() => ({
  mockSubmitEvmHandler: vi.fn(async function* submitEvmHandler() {
    yield {
      type: SubmitStep.SetTradeMeta,
      payload: {
        tradeMeta: {
          id: '0xswapTxMetaId1',
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      },
    };
  }),
}));
vi.mock('./strategy/evm-strategy.js', () => ({
  submitEvmHandler: mockSubmitEvmHandler,
}));

const { mockSubmitBatchHandler } = vi.hoisted(() => ({
  mockSubmitBatchHandler: vi.fn(async function* submitBatchHandler() {
    yield {
      type: SubmitStep.SetTradeMeta,
      payload: {
        tradeMeta: {
          id: '0xswapTxMetaId1',
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      },
    };
  }),
}));
vi.mock('./strategy/batch-strategy.js', () => ({
  submitBatchHandler: mockSubmitBatchHandler,
}));

const { mockExecuteSubmitStrategy, setRealExecuteSubmitStrategy } = vi.hoisted(
  () => {
    // mockReset restores this implementation. A later mockImplementation() does not survive.
    let realExecuteSubmitStrategy:
      | ((
          params: SubmitStrategyParams<Trade>,
        ) => AsyncGenerator<unknown, void, void>)
      | undefined;
    return {
      mockExecuteSubmitStrategy: vi.fn(
        (params: SubmitStrategyParams<Trade>) => {
          if (!realExecuteSubmitStrategy) {
            throw new Error('executeSubmitStrategy spy is not ready');
          }
          return realExecuteSubmitStrategy(params);
        },
      ),
      setRealExecuteSubmitStrategy: (
        real: (
          params: SubmitStrategyParams<Trade>,
        ) => AsyncGenerator<unknown, void, void>,
      ) => {
        realExecuteSubmitStrategy = real;
      },
    };
  },
);
vi.mock('./strategy/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./strategy/index.js')>();
  setRealExecuteSubmitStrategy(actual.default);
  return {
    ...actual,
    default: (params: Parameters<typeof actual.default>[0]) =>
      mockExecuteSubmitStrategy(params),
  };
});

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

const mockIsEthUsdt = vi.fn<() => boolean>();
vi.mock(import('@metamask/bridge-controller'), async (importOriginal) => ({
  ...(await importOriginal()),
  isEthUsdt: () => mockIsEthUsdt(),
}));

const mockGenerateBatchId = vi.fn<() => `0x${string}`>();
vi.mock(import('@metamask/transaction-controller'), async (importOriginal) => ({
  ...(await importOriginal()),
  generateBatchId: () => {
    return mockGenerateBatchId();
  },
}));

const WITHDRAW_BATCH_ID_1 = '0xwithdrawBatchId1';
const WITHDRAW_TX_META_ID_1 = 'withdrawTxMetaId1';
const WITHDRAW_SWAP_QUOTE = getMockQuote({
  srcChainId: ChainId.MONAD,
  destChainId: ChainId.MONAD,
});

const PARTIAL_QUOTE = {
  quoteId: 'withdrawQuoteId1',
  estimatedProcessingTimeInSeconds: 15,
  trade: {
    data: '0xdata',
    from: '0xfrom1',
    to: '0xto1',
    chainId: ChainId.MONAD,
    value: '0xvalue1',
    gasLimit: 100,
  } satisfies TxData,
};

const WITHDRAW_BATCH_ID_2 = '0xwithdrawBatchId2';
const WITHDRAW_TX_META_ID_2 = 'withdrawTxMetaId2';
const WITHDRAW_SWAP_QUOTE_2 = getMockQuote({
  srcChainId: ChainId.MONAD,
  destChainId: ChainId.SOLANA,
});
const WITHDRAW_SWAP_TX_HASH_2 = '0xwithdrawHash2';

const WITHDRAW_BATCH_ID_STX = '0xwithdrawBatchIdStx';
const WITHDRAW_TX_META_ID_STX = '0xwithdrawTxMetaIdStx';
const WITHDRAW_SWAP_TX_HASH_STX = '0xwithdrawHashStx';

const MockTxHistory = {
  getPendingWithdraw: ({
    destChainId = ChainId.MONAD,
    txMetaId = WITHDRAW_TX_META_ID_1,
    batchId = WITHDRAW_BATCH_ID_1,
    isStxEnabled = false,
  }: {
    txMetaId?: string;
    destChainId?: ChainId;
    batchId?: `0x${string}`;
    isStxEnabled?: boolean;
  }): Record<string, BridgeHistoryItem> => {
    const quote = getMockQuote({
      srcChainId: ChainId.MONAD,
      destChainId,
    });
    return {
      [txMetaId]: {
        txMetaId: undefined,
        quote,
        startTime: Date.now() - 5000,
        estimatedProcessingTimeInSeconds: 15,
        slippagePercentage: 0,
        account: '0xaccount1',
        status: MockStatusResponse.getPending({
          srcTxHash: undefined,
          srcChainId: ChainId.MONAD,
          destChainId,
        }),
        withdrawTxMeta: {
          id: txMetaId,
          batchId,
        },
        pricingData: {
          amountSent: '1.234',
          amountSentInUsd: undefined,
          quotedGasInUsd: undefined,
          quotedReturnInUsd: undefined,
        },
        approvalTxId: undefined,
        isStxEnabled,
        hasApprovalTx: false,
        completionTime: undefined,
        featureId: FeatureId.UNIFIED_SWAP_BRIDGE,
        location: MetaMetricsSwapsEventSource.MainView,
        quoteId: 'withdrawQuoteId1',
        next: [
          {
            operation: 'swap',
            partialQuote: PARTIAL_QUOTE,
          },
        ],
      },
    };
  },
};

const addTransactionBatchFn = vi.fn();

let mockTraceFn: Mock;

async function withController<ReturnValue>(
  ...args: Parameters<typeof withControllerBase<ReturnValue>>
): Promise<ReturnValue> {
  if (args.length === 2) {
    const [opts, testFunction] = args;
    return await withControllerBase(
      {
        ...opts,
        addTransactionBatchFn,
        traceFn: mockTraceFn,
      },
      testFunction,
    );
  }
  return await withControllerBase(
    { addTransactionBatchFn, traceFn: mockTraceFn },
    args[0],
  );
}

// Define mocks at the top level
const mockSelectedAccount = getMockInternalAccount();

const BATCH_ID_1 = '0x1234BatchId';
const BATCH_ID_2 = '0xbatchId2';

const MOCK_VAULT_CONFIG = {
  boringVault: '0xboringVault' as const,
  lensAddress: '0xlensAddress' as const,
  chainId: '0xa4b1' as const,
  tellerAddress: '0x123' as const,
  accountantAddress: '0x456' as const,
  underlyingToken: '0xaca92e438df0b2401ff60da7e4337b687a2435da' as const,
};

const requireDestAssetId = (
  address: string,
  chainId: (typeof MOCK_VAULT_CONFIG)['chainId'],
) => {
  const destAssetId = formatAddressToAssetId(address, chainId);
  if (!destAssetId) {
    throw new Error('expected dest asset id');
  }
  return destAssetId;
};
const MOCK_WITHDRAW_TXS = {
  withdrawTx: {
    params: {
      to: '0x123',
      data: '0xdata',
      value: '0x0',
    },
    type: TransactionType.moneyAccountWithdraw,
  },
  transferTx: {
    params: {
      to: '0x123',
      data: '0xdata',
      value: '0x0',
    },
    type: TransactionType.tokenMethodTransfer,
  },
};
const MOCK_TRANSACTION_META = [
  {
    id: 'test-tx-id',
    hash: '0xevmWithdrawTxHash',
    time: 1234567890,
    status: TransactionStatus.unapproved,
    chainId: '0xa4b1' as const,
    networkClientId: 'arb',
    txParams: {
      from: '0xaccount1',
      to: '0xbridgeContract',
      value: '0x0',
      data: '0xdata',
      chainId: '0xa4b1' as const,
      gasLimit: '0x5208',
    },
    type: TransactionType.batch,
    batchId: BATCH_ID_1 as `0x${string}`,
    nestedTransactions: [
      {
        id: 'test-tx-id',
        txParams: {
          from: '0xaccount1',
          to: '0xbridgeContract',
          value: '0x0',
          data: '0xdataNested',
          chainId: '0xa4b1' as const,
          gasLimit: '0x5208',
        },
        type: TransactionType.moneyAccountWithdraw,
      },
    ],
  },
];

const completeMmPay = async (rootMessenger: RootMessenger) => {
  rootMessenger.publish('TransactionController:unapprovedTransactionAdded', {
    ...MOCK_TRANSACTION_META[0],
    status: TransactionStatus.unapproved,
  });
  await flushPromises();
  rootMessenger.publish(
    'TransactionPayController:stateChange',
    getMockPayControllerState(MOCK_TRANSACTION_META[0].id, [getMockPayQuote()]),
    [],
  );
  await flushPromises();
};

describe('BridgeStatusController (withdraw)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.spyOn(historyUtils, 'isHistoryItemTooOld').mockReturnValue(false);
    mockTraceFn = vi.fn(
      async (
        _request: SwapTraceRequest<TraceName>,
        fn?: (args?: unknown) => unknown,
      ) => await fn?.(),
    );
  });

  describe('submitTx: EVM withdraw', () => {
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
      mockGenerateBatchId.mockReturnValueOnce(BATCH_ID_1);
      mockGenerateBatchId.mockReturnValueOnce(BATCH_ID_2);
    });

    it('should handle a withdraw transaction', async () => {
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // track event
      mockMessengerCall.mockReturnValueOnce([]); // isAtomicBatchSupported

      mockMessengerCall.mockReturnValueOnce({}); // feature flags
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce(MOCK_VAULT_CONFIG);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount); // primary money account
      mockMessengerCall.mockReturnValueOnce('arb'); // get network client
      mockMessengerCall.mockReturnValueOnce({ provider: vi.fn() });

      mockBuildMoneyAccountWithdrawBatch.mockResolvedValueOnce(
        MOCK_WITHDRAW_TXS,
      );

      mockMessengerCall.mockReturnValueOnce('arb');

      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockReturnValueOnce({
        transactions: MOCK_TRANSACTION_META,
      });
      mockMessengerCall.mockReturnValue({
        transactions: MOCK_TRANSACTION_META,
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
          addTransactionBatchFn.mockImplementation(async () => {
            await completeMmPay(rootMessenger);
          });
          const result = await rootMessenger.call(
            'BridgeStatusController:submitTx',
            {
              operation: Operation.WITHDRAW,
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

          expect(result).toMatchInlineSnapshot(`
            {
              "batchId": "0x1234BatchId",
              "chainId": "0xa4b1",
              "hash": "0xevmWithdrawTxHash",
              "id": "test-tx-id",
              "nestedTransactions": [
                {
                  "id": "test-tx-id",
                  "txParams": {
                    "chainId": "0xa4b1",
                    "data": "0xdataNested",
                    "from": "0xaccount1",
                    "gasLimit": "0x5208",
                    "to": "0xbridgeContract",
                    "value": "0x0",
                  },
                  "type": "moneyAccountWithdraw",
                },
              ],
              "networkClientId": "arb",
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
              "type": "batch",
            }
          `);

          controller.stopAllPolling();

          expect(mockMessengerCall.mock.calls).toMatchInlineSnapshot(`
            [
              [
                "BridgeController:stopPollingForQuotes",
                "Transaction submitted",
                undefined,
              ],
              [
                "AccountsController:getAccountByAddress",
                "0xaccount1",
              ],
              [
                "BridgeController:trackUnifiedSwapBridgeEvent",
                "Unified SwapBridge Submitted",
                {
                  "account_hardware_type": null,
                  "action_type": "swapbridge-v1",
                  "chain_id_destination": "eip155:42161",
                  "chain_id_source": "eip155:42161",
                  "custom_slippage": false,
                  "destination_hash_present": false,
                  "feature_id": "unified_swap_bridge",
                  "gas_included": true,
                  "gas_included_7702": false,
                  "is_hardware_wallet": false,
                  "location": "Unknown",
                  "price_impact": 0,
                  "provider": "lifi_across",
                  "quoted_time_minutes": 0,
                  "slippage_limit": 0,
                  "source_hash_present": false,
                  "stx_enabled": true,
                  "swap_type": "single_chain",
                  "token_address_destination": "eip155:10/slip44:60",
                  "token_address_source": "eip155:42161/slip44:60",
                  "token_security_type_destination": null,
                  "token_symbol_destination": "ETH",
                  "token_symbol_source": "ETH",
                  "usd_amount_source": 1.01,
                  "usd_quoted_gas": 2.5778,
                  "usd_quoted_return": 0,
                },
              ],
              [
                "TransactionController:isAtomicBatchSupported",
                {
                  "address": "0xaccount1",
                  "chainIds": [
                    "0xa4b1",
                  ],
                },
              ],
              [
                "RemoteFeatureFlagController:getState",
              ],
              [
                "MoneyAccountController:getMoneyAccount",
              ],
              [
                "NetworkController:findNetworkClientIdByChainId",
                "0xa4b1",
              ],
              [
                "NetworkController:getNetworkClientById",
                "arb",
              ],
              [
                "NetworkController:findNetworkClientIdByChainId",
                "0xa4b1",
              ],
              [
                "TransactionController:estimateGasFee",
                {
                  "chainId": "0xa4b1",
                  "networkClientId": "arb",
                  "transactionParams": {
                    "data": "0xdata",
                    "from": "0xaccount1",
                    "gas": undefined,
                    "to": "0x123",
                    "value": "0x0",
                  },
                },
              ],
              [
                "TransactionController:estimateGasFee",
                {
                  "chainId": "0xa4b1",
                  "networkClientId": "arb",
                  "transactionParams": {
                    "data": "0xdata",
                    "from": "0xaccount1",
                    "gas": undefined,
                    "to": "0x123",
                    "value": "0x0",
                  },
                },
              ],
              [
                "TransactionPayController:setTransactionConfig",
                "test-tx-id",
                [Function],
              ],
              [
                "TransactionPayController:updatePaymentToken",
                {
                  "assetId": "eip155:42161/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA",
                  "transactionId": "test-tx-id",
                },
              ],
              [
                "TransactionController:getState",
              ],
              [
                "ApprovalController:acceptRequest",
                "test-tx-id",
              ],
              [
                "TransactionController:getState",
              ],
            ]
          `);
          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);
          expect(addTransactionBatchFn).toHaveBeenCalledTimes(1);
          expect(
            mockMessengerCall.mock.calls.filter(
              ([action]) => action === 'TransactionController:addTransaction',
            ),
          ).toHaveLength(0);
          expect(result.id).toBe('test-tx-id');
          expect(Object.keys(controller.state.txHistory)).toStrictEqual([
            BATCH_ID_1,
          ]);
          expect(controller.state.txHistory[BATCH_ID_1].withdrawTxMeta)
            .toMatchInlineSnapshot(`
              {
                "batchId": "0x1234BatchId",
                "id": "test-tx-id",
              }
            `);
          expect(
            controller.state.txHistory[BATCH_ID_1].actionId,
          ).toBeUndefined();
          expect(controller.state.txHistory[BATCH_ID_1].next)
            .toMatchInlineSnapshot(`
              [
                {
                  "operation": "swap",
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
          expect(mockMessengerCall).toHaveBeenCalledTimes(16);
        },
      );

      const { messenger, tradeData, ...params } =
        getAddTransactionBatchParamsSpy.mock.calls[0][0];
      expect(params).toMatchInlineSnapshot(`
        {
          "atomic": true,
          "batchId": "0x1234BatchId",
          "disable7702": false,
          "disableHook": true,
          "disableSequential": true,
          "isDelegatedAccount": false,
          "isGasFeeSponsored": false,
          "requireApproval": true,
          "selectedAccount": {
            "address": "0xaccount1",
            "id": "test-account-id",
          },
        }
      `);
    });

    const queueWithdrawSubmitCalls = () => {
      // Failure tracking looks up TransactionController state after the throw.
      mockMessengerCall.mockReturnValue({ transactions: [] });
      mockMessengerCall.mockImplementationOnce(vi.fn()); // stopPollingForQuotes
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockImplementationOnce(vi.fn()); // track event
      mockMessengerCall.mockReturnValueOnce([]); // isAtomicBatchSupported
    };

    const queueMoneyAccountAndProvider = ({
      provider = { provider: vi.fn() },
    }: {
      provider?: { provider: ReturnType<typeof vi.fn> | undefined };
    } = {}) => {
      mockMessengerCall.mockReturnValueOnce({}); // feature flags
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce(MOCK_VAULT_CONFIG);
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount); // money account
      mockMessengerCall.mockReturnValueOnce('arb');
      mockMessengerCall.mockReturnValueOnce(provider);
      mockBuildMoneyAccountWithdrawBatch.mockResolvedValueOnce(
        MOCK_WITHDRAW_TXS,
      );
    };

    const queueBatchLookup = (transactions: Record<string, unknown>[]) => {
      mockMessengerCall.mockReturnValueOnce('arb');
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockResolvedValueOnce(mockEstimateGasFeeResult);
      mockMessengerCall.mockReturnValue({ transactions });
    };

    const submitWithdraw = (rootMessenger: RootMessenger) =>
      rootMessenger.call('BridgeStatusController:submitTx', {
        operation: Operation.WITHDRAW,
        accountAddress: mockEvmQuoteResponse.trade.from,
        quoteResponses: [mockEvmQuoteResponse],
        isStxEnabled: false,
      });

    it('throws when the primary money account is missing', async () => {
      queueWithdrawSubmitCalls();
      mockMessengerCall.mockReturnValueOnce({});
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce(MOCK_VAULT_CONFIG);
      mockMessengerCall.mockReturnValueOnce(undefined);

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to get primary money account',
        );
      });
    });

    it('throws when the vault config is missing', async () => {
      queueWithdrawSubmitCalls();
      mockMessengerCall.mockReturnValueOnce({});
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce(undefined);

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to get vault config',
        );
      });
    });

    it('throws when the src chain provider is missing', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider({ provider: { provider: undefined } });

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'No provider available for chain 42161',
        );
      });
    });

    it('uses a transfer tx in the batch as the withdraw trade meta', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider();
      queueBatchLookup([
        {
          ...MOCK_TRANSACTION_META[0],
          type: TransactionType.tokenMethodTransfer,
          nestedTransactions: [],
        },
      ]);

      await withController(
        { mockMessengerCall },
        async ({ rootMessenger, controller }) => {
          addTransactionBatchFn.mockImplementation(async () => {
            await completeMmPay(rootMessenger);
          });
          const result = await submitWithdraw(rootMessenger);
          expect(result.id).toBe('test-tx-id');
          expect(result.hash).toBe('0xevmWithdrawTxHash');
          expect(
            controller.state.txHistory[BATCH_ID_1].withdrawTxMeta,
          ).toMatchObject({
            batchId: BATCH_ID_1,
            id: 'test-tx-id',
          });
        },
      );
    });

    it('skips the next swap when dest asset is the vault underlying token', async () => {
      const underlyingToken = '0x1111111111111111111111111111111111111111';
      const destAssetId = requireDestAssetId(
        underlyingToken,
        MOCK_VAULT_CONFIG.chainId,
      );
      queueWithdrawSubmitCalls();
      mockMessengerCall.mockReturnValueOnce({});
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce({
        ...MOCK_VAULT_CONFIG,
        underlyingToken,
      });
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arb');
      mockMessengerCall.mockReturnValueOnce({ provider: vi.fn() });
      mockBuildMoneyAccountWithdrawBatch.mockResolvedValueOnce(
        MOCK_WITHDRAW_TXS,
      );
      queueBatchLookup(MOCK_TRANSACTION_META);

      await withController(
        { mockMessengerCall },
        async ({ rootMessenger, controller }) => {
          addTransactionBatchFn.mockImplementation(async () => {
            await completeMmPay(rootMessenger);
          });
          await rootMessenger.call('BridgeStatusController:submitTx', {
            operation: Operation.WITHDRAW,
            accountAddress: mockEvmQuoteResponse.trade.from,
            quoteResponses: [
              {
                ...mockEvmQuoteResponse,
                quote: {
                  ...mockEvmQuoteResponse.quote,
                  destAsset: {
                    ...mockEvmQuoteResponse.quote.destAsset,
                    address: underlyingToken,
                    assetId: destAssetId,
                  },
                },
              },
            ],
            isStxEnabled: false,
          });

          expect(controller.state.txHistory[BATCH_ID_1].next).toStrictEqual([]);
        },
      );
    });

    it('sponsors gas when the vault chain is monad', async () => {
      queueWithdrawSubmitCalls();
      mockMessengerCall.mockReturnValueOnce({});
      mockGetMoneyAccountVaultConfig.mockReturnValueOnce({
        ...MOCK_VAULT_CONFIG,
        chainId: CHAIN_IDS.MONAD,
      });
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('arb');
      mockMessengerCall.mockReturnValueOnce({ provider: vi.fn() });
      mockBuildMoneyAccountWithdrawBatch.mockResolvedValueOnce(
        MOCK_WITHDRAW_TXS,
      );
      queueBatchLookup(MOCK_TRANSACTION_META);
      const getAddTransactionBatchParamsSpy = vi.spyOn(
        transactionUtils,
        'getAddTransactionBatchParams',
      );

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        addTransactionBatchFn.mockImplementation(async () => {
          await completeMmPay(rootMessenger);
        });
        await submitWithdraw(rootMessenger);
      });

      expect(
        getAddTransactionBatchParamsSpy.mock.calls[0][0].isGasFeeSponsored,
      ).toBe(true);
    });

    it('uses the provided historyKey for the withdraw history item', async () => {
      queueMoneyAccountAndProvider();
      queueBatchLookup(MOCK_TRANSACTION_META);

      await withController(
        { mockMessengerCall },
        async ({ messenger, rootMessenger }) => {
          addTransactionBatchFn.mockImplementation(async () => {
            await completeMmPay(rootMessenger);
          });
          const steps: unknown[] = [];
          for await (const step of submitWithdrawHandler({
            addTransactionBatchFn,
            messenger,
            traceFn: mockTraceFn,
            fetchFn: () => Promise.resolve(new Response()),
            batchSellTrades: null,
            isBridgeTx: false,
            isDelegatedAccount: false,
            isStxEnabled: false,
            requireApproval: false,
            selectedAccount: mockSelectedAccount,
            clientId: BridgeClientId.EXTENSION,
            bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
            quoteResponses: [mockEvmQuoteResponse],
            operation: Operation.WITHDRAW,
            historyKey: 'custom-withdraw-key',
          })) {
            steps.push(step);
          }
          expect(steps[0]).toMatchObject({
            type: SubmitStep.AddHistoryItem,
            payload: { historyKey: 'custom-withdraw-key' },
          });
        },
      );
    });

    it('swallows withMmPayApproval error when withdraw trade meta exists', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider();
      queueBatchLookup(MOCK_TRANSACTION_META);

      await withController(
        { mockMessengerCall },
        async ({ rootMessenger, controller }) => {
          addTransactionBatchFn.mockRejectedValue(new Error('batch boom'));
          await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
            'Failed to submit transaction',
          );
          expect(
            controller.state.txHistory[BATCH_ID_1].withdrawTxMeta,
          ).toStrictEqual({
            batchId: BATCH_ID_1,
          });
        },
      );
    });

    it('throws when trade meta is missing after the withdraw batch is added', async () => {
      queueWithdrawSubmitCalls();
      queueMoneyAccountAndProvider();
      queueBatchLookup(MOCK_TRANSACTION_META);

      await withController({ mockMessengerCall }, async ({ rootMessenger }) => {
        addTransactionBatchFn.mockImplementation(async () => {
          await completeMmPay(rootMessenger);
          mockMessengerCall.mockReturnValue({ transactions: [] });
        });
        await expect(submitWithdraw(rootMessenger)).rejects.toThrow(
          'Failed to find trade meta after withdraw batch added',
        );
      });
    });
  });

  describe('subscription handlers: confirmed withdraw + EVM swap/bridge', () => {
    let mockMessenger: RootMessenger;
    let mockBridgeStatusMessenger: Messenger<
      'BridgeStatusController',
      MessengerActions<BridgeStatusControllerMessenger>,
      MessengerEvents<BridgeStatusControllerMessenger>,
      RootMessenger
    >;
    let bridgeStatusController: BridgeStatusController;

    let mockFetchFn: Mock;
    const consoleFn = console.warn;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.clearAllTimers();
      vi.clearAllMocks();
      // eslint-disable-next-line no-empty-function
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE });
      mockBridgeStatusMessenger = new Messenger({
        namespace: BRIDGE_STATUS_CONTROLLER_NAME,
        parent: mockMessenger,
      });
      mockMessenger.delegate({
        messenger: mockBridgeStatusMessenger,
        actions: [
          'TransactionController:getState',
          'BridgeController:trackUnifiedSwapBridgeEvent',
          'BridgeController:fetchQuotes',
          'AccountsController:getAccountByAddress',
          'RemoteFeatureFlagController:getState',
        ],
        events: ['TransactionController:transactionStatusUpdated'],
      });

      mockFetchFn = vi
        .fn()
        .mockResolvedValueOnce(MockStatusResponse.getPending());

      vi.setSystemTime(1779988919707);

      bridgeStatusController = new BridgeStatusController({
        messenger: mockBridgeStatusMessenger,
        clientId: BridgeClientId.EXTENSION,
        clientProduct: 'test-client-product',
        fetchFn: mockFetchFn,
        traceFn: mockTraceFn,
        addTransactionBatchFn: vi.fn(),
        state: {
          txHistory: {
            ...MockTxHistory.getPendingWithdraw({}),
            ...MockTxHistory.getPendingWithdraw({
              txMetaId: WITHDRAW_TX_META_ID_2,
              batchId: WITHDRAW_BATCH_ID_2,
              destChainId: ChainId.SOLANA,
            }),
            ...MockTxHistory.getPendingWithdraw({
              txMetaId: WITHDRAW_TX_META_ID_STX,
              batchId: WITHDRAW_BATCH_ID_STX,
              isStxEnabled: true,
            }),
          },
        },
      });
    });

    afterEach(() => {
      bridgeStatusController.stopAllPolling();
      console.warn = consoleFn;
      vi.useRealTimers();
    });

    it('should route to batch-strategy (swap) after withdraw transaction', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_STX,
        txHash: WITHDRAW_SWAP_TX_HASH_STX,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_STX);
      const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: { from: '0xaccount1' },
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_STX,
          batchId: WITHDRAW_BATCH_ID_STX,
          hash: WITHDRAW_SWAP_TX_HASH_STX,
        },
      });
      await flushPromises();

      expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "RemoteFeatureFlagController:getState",
          ],
          [
            "AccountsController:getAccountByAddress",
            "0xaccount1",
          ],
          [
            "TransactionController:isAtomicBatchSupported",
            {
              "address": "0xaccount1",
              "chainIds": [
                "0x8f",
              ],
            },
          ],
        ]
      `);

      expect(mockExecuteSubmitStrategy).toHaveBeenCalledWith({
        addTransactionBatchFn: expect.any(Function),
        batchId: WITHDRAW_BATCH_ID_STX,
        batchSellTrades: null,
        bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
        clientId: 'extension',
        fetchFn: expect.any(Function),
        historyKey: WITHDRAW_TX_META_ID_STX,
        isBridgeTx: false,
        isDelegatedAccount: false,
        isStxEnabled: true,
        messenger: mockMessenger,
        next: [],
        operation: 'swap',
        previousTxHash: WITHDRAW_SWAP_TX_HASH_STX,
        quoteResponses: [{ quote: WITHDRAW_SWAP_QUOTE, ...PARTIAL_QUOTE }],
        requireApproval: false,
        selectedAccount: mockSelectedAccount,
        traceFn: expect.any(Function),
      });

      expect(mockSubmitBatchHandler.mock.calls).toStrictEqual([
        [
          {
            addTransactionBatchFn: expect.any(Function),
            batchId: WITHDRAW_BATCH_ID_STX,
            batchSellTrades: null,
            bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
            clientId: 'extension',
            fetchFn: expect.any(Function),
            historyKey: WITHDRAW_TX_META_ID_STX,
            isBridgeTx: false,
            isDelegatedAccount: false,
            isStxEnabled: true,
            messenger: mockMessenger,
            next: [],
            operation: 'swap',
            previousTxHash: WITHDRAW_SWAP_TX_HASH_STX,
            quoteResponses: [{ quote: WITHDRAW_SWAP_QUOTE, ...PARTIAL_QUOTE }],
            requireApproval: false,
            selectedAccount: mockSelectedAccount,
            traceFn: expect.any(Function),
          },
        ],
      ]);
      expect(
        bridgeStatusController.state.txHistory[WITHDRAW_TX_META_ID_STX].status
          .status,
      ).toBe(StatusTypes.PENDING);
      expect(
        bridgeStatusController.state.txHistory[WITHDRAW_TX_META_ID_STX]
          .withdrawTxMeta,
      ).toMatchObject({
        batchId: WITHDRAW_BATCH_ID_STX,
        hash: WITHDRAW_SWAP_TX_HASH_STX,
      });
      expect(
        bridgeStatusController.state.txHistory[WITHDRAW_TX_META_ID_STX]
          .completionTime,
      ).toBeUndefined();
    });

    it('should route to evm-strategy (swap) after withdraw transaction', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_1,
        txHash: WITHDRAW_SWAP_TX_HASH,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_1);
      const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: { from: '0xaccount1' },
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_1,
          batchId: WITHDRAW_BATCH_ID_1,
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      });
      await flushPromises();

      expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "RemoteFeatureFlagController:getState",
          ],
          [
            "AccountsController:getAccountByAddress",
            "0xaccount1",
          ],
          [
            "TransactionController:isAtomicBatchSupported",
            {
              "address": "0xaccount1",
              "chainIds": [
                "0x8f",
              ],
            },
          ],
        ]
      `);

      expect(mockSubmitEvmHandler.mock.calls).toStrictEqual([
        [
          {
            addTransactionBatchFn: expect.any(Function),
            batchId: '0xwithdrawBatchId1',
            batchSellTrades: null,
            bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
            clientId: 'extension',
            fetchFn: expect.any(Function),
            historyKey: 'withdrawTxMetaId1',
            isBridgeTx: false,
            isDelegatedAccount: false,
            isStxEnabled: false,
            messenger: mockMessenger,
            next: [],
            operation: 'swap',
            previousTxHash: WITHDRAW_SWAP_TX_HASH,
            quoteResponses: [{ quote: WITHDRAW_SWAP_QUOTE, ...PARTIAL_QUOTE }],
            requireApproval: false,
            selectedAccount: mockSelectedAccount,
            traceFn: expect.any(Function),
          },
        ],
      ]);
      expect(
        bridgeStatusController.state.txHistory[WITHDRAW_TX_META_ID_1].status
          .status,
      ).toBe(StatusTypes.PENDING);
      expect(
        bridgeStatusController.state.txHistory[WITHDRAW_TX_META_ID_1]
          .withdrawTxMeta,
      ).toMatchObject({
        batchId: WITHDRAW_BATCH_ID_1,
        hash: WITHDRAW_SWAP_TX_HASH,
      });
    });

    it('should route to evm-strategy (bridge) after withdraw transaction', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_2,
        txHash: WITHDRAW_SWAP_TX_HASH_2,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_2);
      const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: { from: '0xaccount1' },
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_2,
          batchId: WITHDRAW_BATCH_ID_2,
          hash: WITHDRAW_SWAP_TX_HASH_2,
        },
      });
      await flushPromises();

      expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "RemoteFeatureFlagController:getState",
          ],
          [
            "AccountsController:getAccountByAddress",
            "0xaccount1",
          ],
          [
            "TransactionController:isAtomicBatchSupported",
            {
              "address": "0xaccount1",
              "chainIds": [
                "0x8f",
              ],
            },
          ],
        ]
      `);

      expect(mockSubmitEvmHandler.mock.calls).toStrictEqual([
        [
          {
            addTransactionBatchFn: expect.any(Function),
            batchId: '0xwithdrawBatchId2',
            batchSellTrades: null,
            bridgeApiBaseUrl: 'https://bridge.api.cx.metamask.io',
            clientId: 'extension',
            fetchFn: expect.any(Function),
            historyKey: 'withdrawTxMetaId2',
            isBridgeTx: true,
            isDelegatedAccount: false,
            isStxEnabled: false,
            messenger: mockMessenger,
            next: [],
            operation: 'swap',
            previousTxHash: WITHDRAW_SWAP_TX_HASH_2,
            quoteResponses: [
              { quote: WITHDRAW_SWAP_QUOTE_2, ...PARTIAL_QUOTE },
            ],
            requireApproval: false,
            selectedAccount: mockSelectedAccount,
            traceFn: expect.any(Function),
          },
        ],
      ]);
      expect(
        bridgeStatusController.state.txHistory[WITHDRAW_TX_META_ID_2].status
          .status,
      ).toBe(StatusTypes.PENDING);
    });

    it('refreshes quotes when the cached quote is expired', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_1,
        txHash: WITHDRAW_SWAP_TX_HASH,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_1);

      const refreshedQuote = {
        quote: getMockQuote({
          srcChainId: ChainId.MONAD,
          destChainId: ChainId.MONAD,
        }),
        ...PARTIAL_QUOTE,
        quoteId: 'refreshedQuoteId',
      };
      const fetchQuotes = vi.fn().mockResolvedValue([refreshedQuote]);
      mockMessenger.registerActionHandler(
        'BridgeController:fetchQuotes',
        fetchQuotes,
      );

      vi.advanceTimersByTime(REFRESH_INTERVAL_MS);

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: { from: '0xaccount1' },
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_1,
          batchId: WITHDRAW_BATCH_ID_1,
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      });
      await flushPromises();

      const quote = WITHDRAW_SWAP_QUOTE;
      expect(fetchQuotes).toHaveBeenCalledTimes(1);
      expect(fetchQuotes).toHaveBeenCalledWith(
        {
          walletAddress: '0xaccount1',
          srcTokenAddress: quote.srcAsset.address,
          destTokenAddress: quote.destAsset.address,
          srcChainId: quote.srcChainId,
          destChainId: quote.destChainId,
          srcTokenAmount: quote.srcTokenAmount,
          slippage: undefined,
          gasIncluded: false,
          gasIncluded7702: false,
          isMoneyAccount: true,
        },
        FeatureId.UNIFIED_SWAP_BRIDGE,
      );
      expect(mockSubmitEvmHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          historyKey: WITHDRAW_TX_META_ID_1,
          operation: 'swap',
          quoteResponses: [refreshedQuote],
        }),
      );
    });

    it('fails when the refreshed quote is missing', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_1,
        txHash: WITHDRAW_SWAP_TX_HASH,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_1);

      const fetchQuotes = vi.fn().mockResolvedValue([]);
      mockMessenger.registerActionHandler(
        'BridgeController:fetchQuotes',
        fetchQuotes,
      );

      vi.advanceTimersByTime(REFRESH_INTERVAL_MS);

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: { from: '0xaccount1' },
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.confirmed,
          id: WITHDRAW_TX_META_ID_1,
          batchId: WITHDRAW_BATCH_ID_1,
          hash: WITHDRAW_SWAP_TX_HASH,
        },
      });
      await flushPromises();

      expect(fetchQuotes).toHaveBeenCalledTimes(1);
      expect(mockSubmitEvmHandler).not.toHaveBeenCalled();
      expect(
        bridgeStatusController.state.txHistory[WITHDRAW_TX_META_ID_1].status
          .status,
      ).toBe(StatusTypes.FAILED);
    });
  });

  describe('subscription handlers: failed withdraw', () => {
    let mockMessenger: RootMessenger;
    let mockBridgeStatusMessenger: Messenger<
      'BridgeStatusController',
      MessengerActions<BridgeStatusControllerMessenger>,
      MessengerEvents<BridgeStatusControllerMessenger>,
      RootMessenger
    >;
    let bridgeStatusController: BridgeStatusController;

    let mockFetchFn: Mock;
    const consoleFn = console.warn;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.clearAllTimers();
      vi.clearAllMocks();
      // eslint-disable-next-line no-empty-function
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE });
      mockBridgeStatusMessenger = new Messenger({
        namespace: BRIDGE_STATUS_CONTROLLER_NAME,
        parent: mockMessenger,
      });
      mockMessenger.delegate({
        messenger: mockBridgeStatusMessenger,
        actions: [
          'TransactionController:getState',
          'BridgeController:trackUnifiedSwapBridgeEvent',
          'AccountsController:getAccountByAddress',
          'BridgeController:fetchQuotes',
          'RemoteFeatureFlagController:getState',
        ],
        events: ['TransactionController:transactionStatusUpdated'],
      });

      mockFetchFn = vi
        .fn()
        .mockResolvedValueOnce(MockStatusResponse.getPending());

      vi.setSystemTime(1779988919707);

      bridgeStatusController = new BridgeStatusController({
        messenger: mockBridgeStatusMessenger,
        clientId: BridgeClientId.EXTENSION,
        clientProduct: 'test-client-product',
        fetchFn: mockFetchFn,
        traceFn: mockTraceFn,
        addTransactionBatchFn: vi.fn(),
        state: {
          txHistory: {
            ...MockTxHistory.getPendingWithdraw({}),
            ...MockTxHistory.getPendingWithdraw({
              txMetaId: WITHDRAW_TX_META_ID_2,
              batchId: WITHDRAW_BATCH_ID_2,
              destChainId: ChainId.SOLANA,
            }),
            ...MockTxHistory.getPendingWithdraw({
              txMetaId: WITHDRAW_TX_META_ID_STX,
              batchId: WITHDRAW_BATCH_ID_STX,
              isStxEnabled: true,
            }),
          },
        },
      });
    });

    afterEach(() => {
      bridgeStatusController.stopAllPolling();
      console.warn = consoleFn;
      vi.useRealTimers();
    });

    it('should mark history item as failed and skip swap/bridge', async () => {
      registerDefaultActionHandlers(mockMessenger, {
        account: '0xaccount1',
        txMetaId: WITHDRAW_TX_META_ID_STX,
        txHash: WITHDRAW_SWAP_TX_HASH_STX,
      });
      mockGenerateBatchId.mockReturnValueOnce(WITHDRAW_BATCH_ID_STX);
      const messengerCallSpy = vi.spyOn(mockBridgeStatusMessenger, 'call');

      mockMessenger.publish('TransactionController:transactionStatusUpdated', {
        transactionMeta: {
          chainId: CHAIN_IDS.ARBITRUM,
          networkClientId: 'eth-id',
          time: Date.now(),
          txParams: { from: '0xaccount1' },
          nestedTransactions: MOCK_TRANSACTION_META[0].nestedTransactions,
          type: TransactionType.batch,
          status: TransactionStatus.failed,
          id: WITHDRAW_TX_META_ID_STX,
          batchId: WITHDRAW_BATCH_ID_STX,
          error: {
            name: 'TransactionFailedError',
            message: 'Withdraw transaction failed',
          },
          hash: WITHDRAW_SWAP_TX_HASH_STX,
        },
      });
      await flushPromises();

      expect(messengerCallSpy.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "AccountsController:getAccountByAddress",
            "0xaccount1",
          ],
          [
            "TransactionController:getState",
          ],
          [
            "BridgeController:trackUnifiedSwapBridgeEvent",
            "Unified SwapBridge Failed",
            {
              "account_hardware_type": null,
              "action_type": "swapbridge-v1",
              "actual_time_minutes": 0.08333333333333333,
              "allowance_reset_transaction": undefined,
              "approval_transaction": undefined,
              "batch_id": "0xwithdrawBatchIdStx",
              "chain_id_destination": "eip155:143",
              "chain_id_source": "eip155:143",
              "custom_slippage": false,
              "destination_hash_present": false,
              "destination_transaction": "FAILED",
              "error_code": "unknown",
              "error_message": "Transaction failed. Withdraw transaction failed",
              "failure_phase": "source_execution",
              "feature_id": "unified_swap_bridge",
              "gas_included": false,
              "gas_included_7702": false,
              "is_hardware_wallet": false,
              "location": "Main View",
              "price_impact": 0,
              "provider": "lifi_across",
              "quote_vs_execution_ratio": 0,
              "quoted_time_minutes": 0.25,
              "quoted_vs_used_gas_ratio": 0,
              "security_warnings": [],
              "slippage_limit": 0,
              "source_hash_present": true,
              "source_transaction": "COMPLETE",
              "stx_enabled": true,
              "swap_type": "single_chain",
              "token_address_destination": "eip155:143/slip44:60",
              "token_address_source": "eip155:143/slip44:60",
              "token_security_type_destination": null,
              "token_symbol_destination": "ETH",
              "token_symbol_source": "ETH",
              "usd_actual_gas": 0,
              "usd_actual_return": 0,
              "usd_amount_source": 0,
              "usd_quoted_gas": 0,
              "usd_quoted_return": 0,
            },
          ],
        ]
      `);

      expect(mockExecuteSubmitStrategy).not.toHaveBeenCalled();
    });
  });

  describe('subscription handlers: withdraw routing', () => {
    it('ignores an unmatched money-account withdraw', async () => {
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
                  id: 'withdraw-tx-id',
                  hash: '0xwithdrawHash',
                  batchId: BATCH_ID_1,
                  type: TransactionType.moneyAccountWithdraw,
                  status: TransactionStatus.confirmed,
                  chainId: CHAIN_IDS.ARBITRUM,
                  networkClientId: 'arb',
                  time: 1,
                  txParams: { from: '0xaccount1' },
                },
              },
            ),
          ).not.toThrow();
          expect(controller.state.txHistory).toStrictEqual({});
          expect(messengerCall).not.toHaveBeenCalled();
        },
      );
    });

    it('marks COMPLETE when withdraw has no follow-up swap', async () => {
      const history = MockTxHistory.getPendingWithdraw({});
      history[WITHDRAW_TX_META_ID_1].next = [];

      await withController(
        { options: { state: { txHistory: history } } },
        async ({ controller, rootMessenger }) => {
          registerDefaultActionHandlers(rootMessenger, {
            account: '0xaccount1',
            txMetaId: WITHDRAW_TX_META_ID_1,
            txHash: WITHDRAW_SWAP_TX_HASH,
          });
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                id: WITHDRAW_TX_META_ID_1,
                hash: WITHDRAW_SWAP_TX_HASH,
                batchId: WITHDRAW_BATCH_ID_1,
                status: TransactionStatus.confirmed,
                type: TransactionType.moneyAccountWithdraw,
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'arb',
                time: 1,
                txParams: { from: '0xaccount1' },
              },
            },
          );
          await flushPromises();

          expect(
            controller.state.txHistory[WITHDRAW_TX_META_ID_1].status.status,
          ).toBe(StatusTypes.COMPLETE);
          expect(mockExecuteSubmitStrategy).not.toHaveBeenCalled();
        },
      );
    });

    it('skips the next action when the swap has already started', async () => {
      const history = MockTxHistory.getPendingWithdraw({});
      history[WITHDRAW_TX_META_ID_1].batchId = WITHDRAW_BATCH_ID_1;

      await withController(
        { options: { state: { txHistory: history } } },
        async ({ controller, messenger, rootMessenger }) => {
          registerDefaultActionHandlers(rootMessenger, {
            account: '0xaccount1',
            txMetaId: WITHDRAW_TX_META_ID_1,
            txHash: WITHDRAW_SWAP_TX_HASH,
          });
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                id: WITHDRAW_TX_META_ID_1,
                hash: WITHDRAW_SWAP_TX_HASH,
                status: TransactionStatus.confirmed,
                type: TransactionType.swap,
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'arb',
                time: 1,
                txParams: { from: '0xaccount1' },
              },
            },
          );
          await flushPromises();

          expect(
            controller.state.txHistory[WITHDRAW_TX_META_ID_1].next,
          ).toHaveLength(1);
          expect(
            controller.state.txHistory[WITHDRAW_TX_META_ID_1].status.status,
          ).not.toBe(StatusTypes.FAILED);
          expect(mockExecuteSubmitStrategy).not.toHaveBeenCalled();
          expect(messenger.captureException).not.toHaveBeenCalled();
        },
      );
    });

    it('ignores a second withdraw confirmation after the swap has started', async () => {
      const history = MockTxHistory.getPendingWithdraw({});
      history[WITHDRAW_TX_META_ID_1].batchId = '0xswapBatchId';

      await withController(
        { options: { state: { txHistory: history } } },
        async ({ controller, messenger, rootMessenger }) => {
          registerDefaultActionHandlers(rootMessenger, {
            account: '0xaccount1',
            txMetaId: WITHDRAW_TX_META_ID_1,
            txHash: WITHDRAW_SWAP_TX_HASH,
          });
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                id: WITHDRAW_TX_META_ID_1,
                hash: WITHDRAW_SWAP_TX_HASH,
                batchId: WITHDRAW_BATCH_ID_1,
                status: TransactionStatus.confirmed,
                type: TransactionType.moneyAccountWithdraw,
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'arb',
                time: 1,
                txParams: { from: '0xaccount1' },
                nestedTransactions: [
                  { type: TransactionType.moneyAccountWithdraw },
                ],
              },
            },
          );
          await flushPromises();

          expect(mockExecuteSubmitStrategy).not.toHaveBeenCalled();
          expect(messenger.captureException).not.toHaveBeenCalled();
          expect(
            controller.state.txHistory[WITHDRAW_TX_META_ID_1].status.status,
          ).toBe(StatusTypes.PENDING);
          expect(
            controller.state.txHistory[WITHDRAW_TX_META_ID_1].completionTime,
          ).toBeUndefined();
        },
      );
    });

    it('does not mark COMPLETE when a later withdraw confirm arrives after next is cleared', async () => {
      const history = MockTxHistory.getPendingWithdraw({});
      history[WITHDRAW_TX_META_ID_1].batchId = '0xswapBatchId';
      history[WITHDRAW_TX_META_ID_1].next = [];

      await withController(
        { options: { state: { txHistory: history } } },
        async ({ controller, messenger, rootMessenger }) => {
          registerDefaultActionHandlers(rootMessenger, {
            account: '0xaccount1',
            txMetaId: WITHDRAW_TX_META_ID_1,
            txHash: WITHDRAW_SWAP_TX_HASH,
          });
          rootMessenger.publish(
            'TransactionController:transactionStatusUpdated',
            {
              transactionMeta: {
                id: WITHDRAW_TX_META_ID_1,
                hash: WITHDRAW_SWAP_TX_HASH,
                batchId: WITHDRAW_BATCH_ID_1,
                status: TransactionStatus.confirmed,
                type: TransactionType.batch,
                chainId: CHAIN_IDS.ARBITRUM,
                networkClientId: 'arb',
                time: 1,
                txParams: { from: '0xaccount1' },
                nestedTransactions: [
                  { type: TransactionType.moneyAccountWithdraw },
                ],
              },
            },
          );
          await flushPromises();

          expect(mockExecuteSubmitStrategy).not.toHaveBeenCalled();
          expect(messenger.captureException).not.toHaveBeenCalled();
          expect(
            controller.state.txHistory[WITHDRAW_TX_META_ID_1].status.status,
          ).toBe(StatusTypes.PENDING);
          expect(
            controller.state.txHistory[WITHDRAW_TX_META_ID_1].completionTime,
          ).toBeUndefined();
        },
      );
    });
  });
});
