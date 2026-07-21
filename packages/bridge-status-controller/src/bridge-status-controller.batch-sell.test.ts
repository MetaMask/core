import { jest } from '@jest/globals';
import type {
  BridgeControllerMessenger,
  TxData,
  BatchSellTradesResponse,
  Quote,
} from '@metamask/bridge-controller';
import {
  BatchSellTransactionType,
  FeatureId,
} from '@metamask/bridge-controller';
import { toHex } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';

import {
  getHistoryItem,
  getTxMetasForBatch,
  mockBatchSellErc20Erc20,
  mockBatchSellTradesErc20Erc20,
} from '../test/mock-batch-sell-erc20-erc20.js';
import { BridgeStatusController } from './bridge-status-controller.js';
import { BRIDGE_STATUS_CONTROLLER_NAME } from './constants.js';
import { BridgeClientId } from './types.js';
import type {
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
} from './types.js';
import { getBatchSellHistoryItemsForTxHash } from './utils/history.js';
import { shouldDisable7702 } from './utils/transaction.js';

const mockGenerateBatchId = jest.fn();
jest.mock('@metamask/transaction-controller', () => ({
  ...jest.requireActual('@metamask/transaction-controller'),
  generateBatchId: (): string => mockGenerateBatchId(),
}));

type AllBridgeStatusControllerActions =
  MessengerActions<BridgeStatusControllerMessenger>;

type AllBridgeStatusControllerEvents =
  MessengerEvents<BridgeStatusControllerMessenger>;

type AllBridgeControllerActions = MessengerActions<BridgeControllerMessenger>;

type AllBridgeControllerEvents = MessengerEvents<BridgeControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllBridgeStatusControllerActions | AllBridgeControllerActions,
  AllBridgeStatusControllerEvents | AllBridgeControllerEvents
>;

const addTransactionBatchFn = jest.fn();

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function getControllerMessenger(
  rootMessenger: RootMessenger,
): BridgeStatusControllerMessenger {
  const messenger = new Messenger({
    namespace: BRIDGE_STATUS_CONTROLLER_NAME,
    parent: rootMessenger,
  }) as unknown as BridgeStatusControllerMessenger;
  rootMessenger.delegate({
    messenger,
    actions: [
      'AccountsController:getAccountByAddress',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'SnapController:handleRequest',
      'TransactionController:getState',
      'TransactionController:updateTransaction',
      'TransactionController:addTransaction',
      'TransactionController:estimateGasFee',
      'TransactionController:isAtomicBatchSupported',
      'BridgeController:trackUnifiedSwapBridgeEvent',
      'BridgeController:stopPollingForQuotes',
      'BridgeController:getState',
      'RemoteFeatureFlagController:getState',
      'AuthenticationController:getBearerToken',
      'KeyringController:signTypedMessage',
    ],
    events: ['TransactionController:transactionStatusUpdated'],
  });
  return messenger;
}

type WithControllerCallback<ReturnValue> = (payload: {
  controller: BridgeStatusController;
  rootMessenger: RootMessenger;
  messenger: BridgeStatusControllerMessenger;
  startPollingForBridgeTxStatusSpy: jest.Mock;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof BridgeStatusController>[0]>;
  mockMessengerCall?: jest.Mock;
};

async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {}, mockMessengerCall = undefined }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const messenger = getControllerMessenger(rootMessenger);
  if (mockMessengerCall) {
    jest.spyOn(messenger, 'call').mockImplementation(mockMessengerCall);
  }
  const controller = new BridgeStatusController({
    messenger,
    clientId: BridgeClientId.EXTENSION,
    fetchFn: jest.fn(),
    addTransactionBatchFn,
    ...options,
  });
  const startPollingForBridgeTxStatusSpy = jest.fn();
  if (mockMessengerCall) {
    jest
      .spyOn(controller, 'startPolling')
      .mockImplementation(startPollingForBridgeTxStatusSpy);
  }
  return await testFunction({
    controller,
    rootMessenger,
    messenger,
    startPollingForBridgeTxStatusSpy,
  });
}

// Define mocks at the top level
const mockSelectedAccount = {
  id: 'test-account-id',
  address: '0xaccount1',
  type: 'eth',
  metadata: {
    keyring: {
      type: ['any'],
    },
  },
};
const batchId = '0xBatchId1';
const mockQuotes = mockBatchSellErc20Erc20.map((quote) => ({
  ...quote,
  quote: {
    ...quote.quote,
    // BatchSell quotes have no gasless params because they are not simulated
    gasIncluded7702: undefined,
    gasIncluded: undefined,
    gasSponsored: undefined,
  },
  sentAmount: {
    usd: '100',
    valueInCurrency: '200',
  },
  toTokenAmount: {
    usd: '101',
    valueInCurrency: '201',
  },
}));
const mockTransferTx: BatchSellTradesResponse['transactions'][number] = {
  chainId: 10,
  from: '0xaccount1',
  to: '0xaccount2',
  value: '0x1',
  data: '0x1',
  gasLimit: 100000,
  maxFeePerGas: '0x1',
  maxPriorityFeePerGas: '0x1',
  type: BatchSellTransactionType.TRANSFER,
};

describe('BridgeStatusController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('submitBatchSell', () => {
    let mockMessengerCall: jest.Mock;

    describe.each([true, false])('when gasTransferRequired=%s,', (transfer) => {
      const transferTx = transfer ? mockTransferTx : undefined;

      describe.each([true, false])('gasIncluded7702=%s,', (gasIncluded7702) => {
        describe.each([true, false])('gasIncluded=%s,', (gasIncluded) => {
          describe.each([true, false])('stxEnabled=%s,', (stxEnabled) => {
            beforeEach(() => {
              jest.clearAllMocks();
              mockMessengerCall = jest.fn();
              jest.spyOn(Date, 'now').mockReturnValue(1779922719705);
              mockGenerateBatchId.mockReturnValueOnce('0xGeneratedBatchId1');
            });

            it.each([true, false])(
              'isDelegatedAccount=%s',
              async (isDelegatedAccount) => {
                if (
                  !(
                    !gasIncluded7702 &&
                    !gasIncluded &&
                    !stxEnabled &&
                    !isDelegatedAccount
                  )
                ) {
                  // return;
                }
                const is7702 = !shouldDisable7702(
                  gasIncluded7702,
                  gasIncluded,
                  isDelegatedAccount,
                );

                // Get the mock tx metas for the batch, either a single tx or multiple
                const mockTxMetas = getTxMetasForBatch({
                  batchId,
                  is7702,
                });

                // Append the transfer tx if it is provided
                const mockBatchSellTrades = {
                  ...mockBatchSellTradesErc20Erc20,
                  gasIncluded7702,
                  gasIncluded,
                  transactions: [
                    ...mockBatchSellTradesErc20Erc20.transactions,
                    transferTx,
                  ].filter((tx) => tx !== undefined),
                };

                // Mock messenger calls
                addTransactionBatchFn.mockResolvedValueOnce({
                  batchId,
                });
                mockMessengerCall.mockReturnValueOnce({
                  batchSellTrades: mockBatchSellTrades,
                });
                // stopPollingForQuotes
                mockMessengerCall.mockImplementationOnce(jest.fn());
                // track event
                mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
                mockMessengerCall.mockImplementationOnce(jest.fn());
                // isAtomicBatchSupported
                mockMessengerCall.mockReturnValueOnce(
                  isDelegatedAccount
                    ? [
                        {
                          isSupported: true,
                          delegationAddress: '0x0',
                        },
                      ]
                    : [],
                );
                mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
                mockMessengerCall.mockReturnValueOnce('networkClientId');
                mockMessengerCall.mockReturnValueOnce({
                  transactions: mockTxMetas.map((txMeta) => ({
                    ...txMeta,
                  })),
                });

                await withController(
                  { mockMessengerCall },
                  async ({
                    controller,
                    rootMessenger,
                    startPollingForBridgeTxStatusSpy,
                  }) => {
                    const result = await rootMessenger.call(
                      'BridgeStatusController:submitBatchSell',
                      {
                        accountAddress: (mockQuotes[0].trade as TxData).from,
                        quoteResponses: mockQuotes,
                        isStxEnabled: stxEnabled,
                      },
                    );
                    controller.stopAllPolling();

                    // First txMeta should be returned
                    expect(result).toStrictEqual(mockTxMetas[0]);

                    // Verify the messenger calls
                    expect(mockMessengerCall.mock.calls).toStrictEqual([
                      ['BridgeController:getState'],
                      [
                        'BridgeController:stopPollingForQuotes',
                        'Transaction submitted',
                        undefined,
                      ],
                      [
                        'AccountsController:getAccountByAddress',
                        '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
                      ],
                      [
                        'BridgeController:trackUnifiedSwapBridgeEvent',
                        'Unified SwapBridge Submitted',
                        {
                          account_hardware_type: null,
                          action_type: 'swapbridge-v1',
                          chain_id_destination: 'eip155:10',
                          chain_id_source: 'eip155:10',
                          custom_slippage: false,
                          feature_id: FeatureId.BATCH_SELL,
                          gas_included: gasIncluded,
                          gas_included_7702: gasIncluded7702,
                          is_hardware_wallet: false,
                          location: 'Unknown',
                          price_impact: 0,
                          provider: 'socket_across',
                          quoted_time_minutes: 1,
                          stx_enabled: stxEnabled,
                          swap_type: 'single_chain',
                          token_address_destination:
                            'eip155:10/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
                          token_address_source:
                            'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                          token_security_type_destination: null,
                          token_symbol_destination: 'USDC',
                          token_symbol_source: 'USDC',
                          usd_amount_source: 100,
                          usd_quoted_gas: 0,
                          usd_quoted_return: 0,
                          batch_id: '0xGeneratedBatchId1',
                        },
                      ],
                      [
                        'TransactionController:isAtomicBatchSupported',
                        {
                          address: '0xaccount1',
                          chainIds: ['0xa'],
                        },
                      ],
                      [
                        'AccountsController:getAccountByAddress',
                        '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
                      ],
                      ['NetworkController:findNetworkClientIdByChainId', '0xa'],
                      ['TransactionController:getState'],
                    ]);

                    const { transactions, ...batchParams } =
                      addTransactionBatchFn.mock.calls[0][0];

                    // addTransactionBatch options
                    expect(batchParams).toStrictEqual({
                      disable7702: !is7702,
                      excludeNativeTokenForFee: !transferTx,
                      atomic: false,
                      from: '0xaccount1',
                      isGasFeeIncluded: gasIncluded7702,
                      isGasFeeSponsored: undefined,
                      isInternal: true,
                      networkClientId: 'networkClientId',
                      origin: 'metamask',
                      requireApproval: false,
                      batchId: '0xGeneratedBatchId1',
                      skipInitialGasEstimate: gasIncluded7702
                        ? isDelegatedAccount
                        : Boolean(transferTx),
                    });

                    expect(transactions).toStrictEqual(
                      mockBatchSellTrades.transactions.map(
                        ({ type, gasLimit, chainId, ...tx }) => ({
                          params: {
                            ...tx,
                            gas: toHex(Number(gasLimit)),
                          },
                          type:
                            // eslint-disable-next-line no-nested-ternary
                            type === BatchSellTransactionType.TRADE
                              ? TransactionType.swap
                              : type === BatchSellTransactionType.APPROVAL
                                ? TransactionType.swapApproval
                                : TransactionType.tokenMethodTransfer,
                          assetsFiatValues:
                            type === BatchSellTransactionType.TRADE
                              ? {
                                  sending:
                                    mockQuotes[0].sentAmount?.valueInCurrency?.toString(),
                                  receiving:
                                    mockQuotes[0].toTokenAmount?.valueInCurrency?.toString(),
                                }
                              : undefined,
                        }),
                      ),
                    );

                    // Verify the initial history item
                    expect(result.id).toStrictEqual(mockTxMetas[0].id);

                    const historyItem = controller.state.txHistory[result.id];

                    const expectedHistoryItem = getHistoryItem({
                      isStxEnabled: stxEnabled,
                      batchSellData: mockBatchSellTrades,
                      txMetaId: result.id,
                      featureId: FeatureId.BATCH_SELL,
                      quote: {
                        ...mockQuotes[0].quote,
                        // Gas params should be merged to the initial quote
                        gasIncluded,
                        gasIncluded7702,
                        gasSponsored: false,
                      },

                      quoteIds: is7702
                        ? // 7702 batch should have a list of quoteIds
                          [
                            mockQuotes[0].quote.requestId,
                            mockQuotes[1].quote.requestId,
                          ]
                        : undefined,
                    });
                    expect(historyItem).toStrictEqual(expectedHistoryItem);

                    const expectedHistoryItems = [];
                    const quoteHistoryItem = (
                      quoteObject: Quote,
                    ): Partial<BridgeHistoryItem> => ({
                      batchId: undefined,
                      featureId: FeatureId.BATCH_SELL,
                      slippagePercentage: 0,
                      txMetaId: undefined,
                      actionId: undefined,
                      approvalTxId: undefined,
                      isStxEnabled: stxEnabled,
                      batchSellData: mockBatchSellTrades,
                      quote: {
                        ...quoteObject,
                        gasIncluded,
                        gasIncluded7702,
                        gasSponsored: false,
                      },
                    });

                    // Add a txHistory item for each 7702 quote
                    for (const [
                      index,
                    ] of expectedHistoryItem.quoteIds?.entries() ?? []) {
                      const quoteItem = quoteHistoryItem(
                        mockQuotes[index].quote,
                      );

                      expectedHistoryItems.push(
                        expect.objectContaining(quoteItem),
                      );
                    }

                    // Add a txHistory item for each STX swap tx
                    const stxSwapTxMetas = mockTxMetas.filter(
                      ({ type }) => type === TransactionType.swap,
                    );
                    expect(stxSwapTxMetas).toHaveLength(is7702 ? 0 : 2);
                    for (const [index, txMeta] of stxSwapTxMetas.entries()) {
                      const quoteItem = {
                        ...quoteHistoryItem(mockQuotes[index].quote),
                        batchId: txMeta.batchId,
                        txMetaId: txMeta.id,
                      };
                      expectedHistoryItems.push(
                        expect.objectContaining(quoteItem),
                      );
                    }

                    expect(expectedHistoryItems.length).toBeGreaterThan(1);

                    // STX tx hash is not stored initially, so use the txMeta.id instead
                    const { historyItems, is7702Batch } =
                      getBatchSellHistoryItemsForTxHash(
                        controller.state.txHistory,
                        mockTxMetas[0].id,
                      );

                    expect(is7702Batch).toBe(is7702);
                    expect(historyItems).toHaveLength(
                      expectedHistoryItems.length,
                    );
                    expect(historyItems).toStrictEqual(expectedHistoryItems);

                    // No history items should be returned if no txHashOrId is provided
                    expect(
                      getBatchSellHistoryItemsForTxHash(
                        controller.state.txHistory,
                      ).historyItems,
                    ).toStrictEqual([]);

                    // Test confirmation subscription
                    mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
                    mockMessengerCall.mockReturnValueOnce({
                      transactions: mockTxMetas.map((txMeta) => ({
                        ...txMeta,
                      })),
                    });

                    // Publish confirmation event for swap
                    rootMessenger.publish(
                      'TransactionController:transactionStatusUpdated',
                      {
                        transactionMeta: {
                          ...mockTxMetas[0],
                          status: TransactionStatus.confirmed,
                        },
                      },
                    );

                    expect(
                      getBatchSellHistoryItemsForTxHash(
                        controller.state.txHistory,
                        mockTxMetas[0].hash,
                      ).historyItems,
                    ).toStrictEqual(expectedHistoryItems);

                    // Verify the messenger calls
                    expect(
                      mockMessengerCall.mock.calls.slice(-3),
                    ).toStrictEqual([
                      ['AccountsController:getAccountByAddress', '0xaccount1'],
                      ['TransactionController:getState'],
                      [
                        'BridgeController:trackUnifiedSwapBridgeEvent',
                        'Unified SwapBridge Completed',
                        {
                          account_hardware_type: null,
                          action_type: 'swapbridge-v1',
                          batch_id: '0xBatchId1',
                          feature_id: FeatureId.BATCH_SELL,
                          // actual_time_minutes: expect.closeTo(29644790, -1),
                          actual_time_minutes: expect.any(Number),
                          allowance_reset_transaction: undefined,
                          approval_transaction: 'COMPLETE',
                          chain_id_destination: 'eip155:10',
                          chain_id_source: 'eip155:10',
                          custom_slippage: true,
                          destination_transaction: 'PENDING',
                          gas_included: gasIncluded,
                          gas_included_7702: gasIncluded7702,
                          is_hardware_wallet: false,
                          location: 'Unknown',
                          price_impact: 0,
                          provider: 'socket_across',
                          quote_vs_execution_ratio: 0,
                          quoted_time_minutes: 1,
                          quoted_vs_used_gas_ratio: 0,
                          security_warnings: [],
                          slippage_limit: 0,
                          source_transaction: 'COMPLETE',
                          stx_enabled: stxEnabled,
                          swap_type: 'single_chain',
                          token_address_destination:
                            'eip155:10/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
                          token_address_source:
                            'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                          token_security_type_destination: null,
                          token_symbol_destination: 'USDC',
                          token_symbol_source: 'USDC',
                          transaction_internal_id: mockTxMetas[0].id,
                          usd_amount_source: 100,
                          usd_actual_gas: 0,
                          usd_actual_return: 0,
                          usd_quoted_gas: 0,
                          usd_quoted_return: 101,
                        },
                      ],
                    ]);

                    expect(
                      startPollingForBridgeTxStatusSpy,
                    ).toHaveBeenCalledTimes(0);

                    // Test failure subscription
                    mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
                    mockMessengerCall.mockReturnValueOnce({
                      transactions: mockTxMetas.map((txMeta) => ({
                        ...txMeta,
                      })),
                    });

                    // Publish failed event for swap
                    const failedTxMeta = mockTxMetas[2] ?? mockTxMetas[0];
                    rootMessenger.publish(
                      'TransactionController:transactionStatusUpdated',
                      {
                        transactionMeta: {
                          ...failedTxMeta,
                          status: TransactionStatus.failed,
                        },
                      },
                    );

                    expect(
                      getBatchSellHistoryItemsForTxHash(
                        controller.state.txHistory,
                        failedTxMeta.hash,
                      ).historyItems,
                    ).toStrictEqual(expectedHistoryItems);

                    // Verify the messenger calls
                    expect(mockMessengerCall.mock.calls.at(-1)).toStrictEqual([
                      'BridgeController:trackUnifiedSwapBridgeEvent',
                      'Unified SwapBridge Failed',
                      {
                        account_hardware_type: null,
                        action_type: 'swapbridge-v1',
                        // actual_time_minutes: expect.closeTo(is7702 ? 1103 : 0, -1),
                        actual_time_minutes: expect.any(Number),
                        allowance_reset_transaction: undefined,
                        approval_transaction: 'COMPLETE',
                        batch_id: '0xBatchId1',
                        chain_id_destination: 'eip155:10',
                        chain_id_source: 'eip155:10',
                        custom_slippage: true,
                        destination_transaction: 'FAILED',
                        error_message: 'Transaction failed',
                        feature_id: FeatureId.BATCH_SELL,
                        gas_included: gasIncluded,
                        gas_included_7702: gasIncluded7702,
                        is_hardware_wallet: false,
                        location: 'Unknown',
                        price_impact: 0,
                        provider: is7702
                          ? 'socket_across'
                          : 'socket_celercircle',
                        quote_vs_execution_ratio: 0,
                        quoted_time_minutes: is7702 ? 1 : 26,
                        quoted_vs_used_gas_ratio: 0,
                        security_warnings: [],
                        slippage_limit: 0,
                        source_transaction: 'COMPLETE',
                        stx_enabled: stxEnabled,
                        swap_type: 'single_chain',
                        token_address_destination:
                          'eip155:10/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
                        token_address_source: is7702
                          ? 'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85'
                          : 'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff81',
                        token_security_type_destination: null,
                        token_symbol_destination: 'USDC',
                        token_symbol_source: is7702 ? 'USDC' : 'USDT',
                        usd_amount_source: 100,
                        usd_actual_gas: 0,
                        usd_actual_return: 0,
                        usd_quoted_gas: 0,
                        usd_quoted_return: 101,
                      },
                    ]);

                    expect(
                      startPollingForBridgeTxStatusSpy,
                    ).toHaveBeenCalledTimes(0);
                  },
                );
              },
            );
          });
        });
      });
    });

    it('returns undefined if there is no matching txMeta for the batch', async () => {
      const gasIncluded7702 = true;
      const gasIncluded = false;
      const isDelegatedAccount = true;
      const stxEnabled = false;

      // Append the transfer tx if it is provided
      const mockBatchSellTrades = {
        ...mockBatchSellTradesErc20Erc20,
        gasIncluded7702,
        gasIncluded,
        transactions: [
          mockTransferTx,
          ...mockBatchSellTradesErc20Erc20.transactions,
        ].filter((tx) => tx !== undefined),
      };

      // Mock messenger calls
      addTransactionBatchFn.mockResolvedValueOnce({
        batchId,
      });
      mockMessengerCall.mockReturnValueOnce({
        batchSellTrades: mockBatchSellTrades,
      });
      // stopPollingForQuotes
      mockMessengerCall.mockImplementationOnce(jest.fn());
      // track event
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockImplementationOnce(jest.fn());
      // isAtomicBatchSupported
      mockMessengerCall.mockReturnValueOnce(
        isDelegatedAccount
          ? [
              {
                isSupported: true,
                delegationAddress: '0x0',
              },
            ]
          : [],
      );
      mockMessengerCall.mockReturnValueOnce(mockSelectedAccount);
      mockMessengerCall.mockReturnValueOnce('networkClientId');
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
          const expectedHistory = controller.state.txHistory;
          const result = await expect(
            rootMessenger.call('BridgeStatusController:submitBatchSell', {
              accountAddress: (mockQuotes[0].trade as TxData).from,
              quoteResponses: mockQuotes,
              isStxEnabled: stxEnabled,
            }),
          ).rejects.toThrow(
            'Failed to add BatchSell trade to history: txMeta not found',
          );
          controller.stopAllPolling();

          // First txMeta should be returned
          expect(result).toBeUndefined();

          // Verify the messenger calls
          expect(mockMessengerCall.mock.calls).toStrictEqual([
            ['BridgeController:getState'],
            [
              'BridgeController:stopPollingForQuotes',
              'Transaction submitted',
              undefined,
            ],
            [
              'AccountsController:getAccountByAddress',
              '0x141d32a89a1e0a5ef360034a2f60a4b917c18838',
            ],
            [
              'BridgeController:trackUnifiedSwapBridgeEvent',
              'Unified SwapBridge Submitted',
              {
                account_hardware_type: null,
                action_type: 'swapbridge-v1',
                chain_id_destination: 'eip155:10',
                chain_id_source: 'eip155:10',
                custom_slippage: false,
                feature_id: FeatureId.BATCH_SELL,
                gas_included: gasIncluded,
                gas_included_7702: gasIncluded7702,
                is_hardware_wallet: false,
                location: 'Unknown',
                price_impact: 0,
                provider: 'socket_across',
                quoted_time_minutes: 1,
                stx_enabled: stxEnabled,
                swap_type: 'single_chain',
                token_address_destination:
                  'eip155:10/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
                token_address_source:
                  'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                token_security_type_destination: null,
                token_symbol_destination: 'USDC',
                token_symbol_source: 'USDC',
                usd_amount_source: 100,
                usd_quoted_gas: 0,
                usd_quoted_return: 0,
              },
            ],
            [
              'TransactionController:isAtomicBatchSupported',
              {
                address: '0xaccount1',
                chainIds: ['0xa'],
              },
            ],
            ['AccountsController:getAccountByAddress', '0xaccount1'],
            ['NetworkController:findNetworkClientIdByChainId', '0xa'],
            ['TransactionController:getState'],
            [
              'BridgeController:trackUnifiedSwapBridgeEvent',
              'Unified SwapBridge Failed',
              {
                account_hardware_type: null,
                action_type: 'swapbridge-v1',
                chain_id_destination: 'eip155:10',
                chain_id_source: 'eip155:10',
                custom_slippage: false,
                error_message:
                  'Failed to add BatchSell trade to history: txMeta not found',
                feature_id: FeatureId.BATCH_SELL,
                gas_included: false,
                gas_included_7702: true,
                is_hardware_wallet: false,
                location: 'Unknown',
                price_impact: 0,
                provider: 'socket_across',
                quoted_time_minutes: 1,
                stx_enabled: false,
                swap_type: 'single_chain',
                token_address_destination:
                  'eip155:10/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
                token_address_source:
                  'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85',
                token_security_type_destination: null,
                token_symbol_destination: 'USDC',
                token_symbol_source: 'USDC',
                usd_amount_source: 100,
                usd_quoted_gas: 0,
                usd_quoted_return: 0,
              },
            ],
          ]);

          expect(startPollingForBridgeTxStatusSpy).toHaveBeenCalledTimes(0);

          // Verify that history item was not added
          expect(controller.state.txHistory).toStrictEqual(expectedHistory);
        },
      );
    });
  });
});
