/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable jest/no-restricted-matchers */
import { BridgeClientId, StatusTypes } from '@metamask/bridge-controller';
import type {
  GasFeeEstimates,
  TransactionMeta,
} from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';

import { BridgeStatusController } from './bridge-status-controller';
import { MAX_ATTEMPTS } from './constants';
import type { BridgeStatusControllerState } from './types';
import * as bridgeStatusUtils from './utils/bridge-status';
import * as historyUtils from './utils/history';
import * as intentApi from './utils/intent-api';
import { IntentOrderStatus } from './utils/validators';

jest.spyOn(intentApi, 'postSubmitOrder').mockImplementation(jest.fn());
jest
  .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
  .mockImplementation(jest.fn());

const minimalIntentQuoteResponse = (overrides?: Partial<any>): any => {
  return {
    quote: {
      requestId: 'req-1',
      srcChainId: 1,
      destChainId: 1,
      srcTokenAmount: '1000',
      destTokenAmount: '990',
      bridges: ['cowswap'],
      bridgeId: 'cowswap',
      minDestTokenAmount: '900',
      srcAsset: {
        symbol: 'ETH',
        chainId: 1,
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:1/slip44:60',
        name: 'ETH',
        decimals: 18,
      },
      destAsset: {
        symbol: 'ETH',
        chainId: 1,
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:1/slip44:60',
        name: 'ETH',
        decimals: 18,
      },
      feeData: { txFee: { maxFeePerGas: '1', maxPriorityFeePerGas: '1' } },
      intent: {
        protocol: 'cowswap',
        order: { some: 'order' },
        settlementContract: '0x9008D19f58AAbd9eD0D60971565AA8510560ab41',
        typedData: {
          types: {},
          domain: {},
          primaryType: 'Order',
          message: {},
        },
      },
    },
    sentAmount: { amount: '1', usd: '1' },
    gasFee: { effective: { amount: '0', usd: '0' } },
    toTokenAmount: { usd: '1' },
    estimatedProcessingTimeInSeconds: 15,
    featureId: undefined,
    approval: undefined,
    resetApproval: undefined,
    trade: {
      chainId: 1,
      from: '0x9008D19f58AAbd9eD0D60971565AA8510560ab4a',
      to: '0x0000000000000000000000000000000000000001',
      data: '0x',
      value: '0x0',
      gasLimit: 21000,
    },
    ...overrides,
  };
};

const minimalBridgeQuoteResponse = (
  accountAddress: string,
  overrides?: Partial<any>,
): any => {
  return {
    quote: {
      requestId: 'req-bridge-1',
      srcChainId: 1,
      destChainId: 10,
      srcTokenAmount: '1000',
      destTokenAmount: '990',
      minDestTokenAmount: '900',
      srcAsset: {
        symbol: 'ETH',
        chainId: 1,
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:1/slip44:60',
        name: 'ETH',
        decimals: 18,
      },
      destAsset: {
        symbol: 'ETH',
        chainId: 10,
        address: '0x0000000000000000000000000000000000000000',
        assetId: 'eip155:10/slip44:60',
        name: 'ETH',
        decimals: 18,
      },
      feeData: { txFee: { maxFeePerGas: '1', maxPriorityFeePerGas: '1' } },
      bridges: ['across'],
      bridgeId: 'socket',
    },
    sentAmount: { amount: '1', usd: '1' },
    gasFee: { effective: { amount: '0', usd: '0' } },
    toTokenAmount: { usd: '1' },
    estimatedProcessingTimeInSeconds: 15,
    featureId: undefined,
    approval: undefined,
    resetApproval: undefined,
    trade: {
      chainId: 1,
      from: accountAddress,
      to: '0x0000000000000000000000000000000000000001',
      data: '0x',
      value: '0x0',
      gasLimit: 21000,
    },
    ...overrides,
  };
};

const createMessengerHarness = (
  accountAddress: string,
  selectedChainId: string = '0x1',
  keyringType: string = 'HD Key Tree',
  approvalStatus?: TransactionStatus,
): any => {
  const transactions: TransactionMeta[] = [];

  const messenger = {
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(), // REQUIRED by BaseController
    subscribe: jest.fn(),
    publish: jest.fn(),
    call: jest.fn((method: string, ...args: any[]) => {
      switch (method) {
        case 'AccountsController:getAccountByAddress': {
          const addr = (args[0] as string) ?? '';
          if (addr.toLowerCase() !== accountAddress.toLowerCase()) {
            return undefined;
          }

          // REQUIRED so isHardwareWallet() doesn't throw
          return {
            address: accountAddress,
            metadata: { keyring: { type: keyringType } },
          };
        }
        case 'TransactionController:getState':
          return { transactions };
        case 'TransactionController:estimateGasFee':
          return { estimates: {} as GasFeeEstimates };
        case 'TransactionController:addTransaction': {
          // Approval TX path (submitIntent -> #handleApprovalTx -> #handleEvmTransaction)
          if (
            args[1]?.type === TransactionType.bridgeApproval ||
            args[1]?.type === TransactionType.swapApproval
          ) {
            const hash = '0xapprovalhash1';

            const approvalTx = {
              id: 'approvalTxId1',
              type: args[1]?.type,
              status: approvalStatus ?? TransactionStatus.failed,
              chainId: args[0]?.chainId ?? '0x1',
              hash,
              networkClientId: 'network-client-id-1',
              time: Date.now(),
              txParams: args[0],
            };
            transactions.push(approvalTx);

            return {
              result: Promise.resolve(hash),
              transactionMeta: approvalTx,
            };
          }

          // Intent “display tx” path
          const intentTx = {
            id: 'intentDisplayTxId1',
            type: args[1]?.type,
            status: TransactionStatus.submitted,
            chainId: args[0]?.chainId ?? '0x1',
            hash: undefined,
            networkClientId: 'network-client-id-1',
            time: Date.now(),
            txParams: args[0],
          };
          transactions.push(intentTx);

          return {
            result: Promise.resolve('0xunused'),
            transactionMeta: intentTx,
          };
        }
        case 'AuthenticationController:getBearerToken': {
          return '0xjwt';
        }
        case 'NetworkController:findNetworkClientIdByChainId':
          return 'network-client-id-1';
        case 'NetworkController:getState':
          return { selectedNetworkClientId: 'selected-network-client-id-1' };
        case 'NetworkController:getNetworkClientById':
          return { configuration: { chainId: selectedChainId } };
        case 'BridgeController:trackUnifiedSwapBridgeEvent':
          return undefined;
        case 'GasFeeController:getState':
          return { gasFeeEstimates: {} };
        case 'KeyringController:signTypedMessage':
          return '0xtest-signature';
        default:
          return undefined;
      }
    }),
  };

  return { messenger, transactions };
};

const setup = (options?: {
  selectedChainId?: string;
  approvalStatus?: TransactionStatus;
  clientId?: BridgeClientId;
  keyringType?: string;
  mockTxHistory?: any;
}) => {
  const accountAddress = '0xAccount1';
  const { messenger, transactions } = createMessengerHarness(
    accountAddress,
    options?.selectedChainId ?? '0x1',
    options?.keyringType,
    options?.approvalStatus,
  );

  const mockFetchFn = jest.fn();
  const controller = new BridgeStatusController({
    messenger,
    state: {
      txHistory: options?.mockTxHistory ?? {},
    },
    addTransactionBatchFn: jest.fn(),
    clientId: options?.clientId ?? BridgeClientId.EXTENSION,
    fetchFn: (...args: any[]) => mockFetchFn(...args),
    addTransactionBatchFn: jest.fn(),
    config: { customBridgeApiBaseUrl: 'http://localhost' },
    traceFn: (_req: any, fn?: any): any => fn?.(),
  });

  const startPollingSpy = jest
    .spyOn(controller, 'startPolling')
    .mockReturnValue('poll-token-1');

  const stopPollingSpy = jest.spyOn(controller, 'stopPollingByPollingToken');

  return {
    mockFetchFn,
    controller,
    messenger,
    transactions,
    startPollingSpy,
    stopPollingSpy,
    accountAddress,
  };
};

describe('BridgeStatusController (intent swaps)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('submitIntent: throws if approval confirmation fails (does not write history or start polling)', async () => {
    const { controller, accountAddress, startPollingSpy } = setup();

    const orderUid = 'order-uid-1';

    // In the "throw on approval confirmation failure" behavior, we should not reach intent submission,
    // but keep this here to prove it wasn't used.
    const intentStatusResponse = {
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    const submitIntentSpy = jest
      .spyOn(intentApi, 'postSubmitOrder')
      .mockResolvedValue(intentStatusResponse);

    const quoteResponse = minimalIntentQuoteResponse({
      // Include approval to exercise the approval confirmation path.
      // Your harness sets approval tx status to failed, so #waitForTxConfirmation should throw.
      approval: {
        chainId: 1,
        from: accountAddress,
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        value: '0x0',
        gasLimit: 21000,
      },
    });

    const promise = controller.submitIntent({
      quoteResponse,
      accountAddress,
    });
    await expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Approval transaction did not confirm"`,
    );

    // Since we throw before intent order submission succeeds, we should not create the history item
    // (and therefore should not start polling).
    const historyKey = orderUid;
    expect(controller.state.txHistory[historyKey]).toBeUndefined();

    expect(startPollingSpy).not.toHaveBeenCalled();

    // Optional: ensure we never called the intent API submit
    expect(submitIntentSpy).not.toHaveBeenCalled();
  });

  it('submitIntent: completes when approval tx confirms', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1773879217428);
    const { controller, accountAddress } = setup({
      approvalStatus: TransactionStatus.confirmed,
    });
    const orderUid = 'order-uid-approve-1';
    const intentStatusResponse = {
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    const submitIntentSpy = jest
      .spyOn(intentApi, 'postSubmitOrder')
      .mockResolvedValue(intentStatusResponse);

    const quoteResponse = minimalIntentQuoteResponse({
      approval: {
        chainId: 1,
        from: accountAddress,
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        value: '0x0',
        gasLimit: 21000,
      },
    });

    await expect(
      controller.submitIntent({
        quoteResponse,
        accountAddress,
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "chainId": "0x1",
        "hash": undefined,
        "id": "intentDisplayTxId1",
        "isIntentTx": true,
        "networkClientId": "network-client-id-1",
        "orderUid": "order-uid-approve-1",
        "status": "submitted",
        "time": 1773879217428,
        "txParams": {
          "chainId": "0x1",
          "data": "0xpprove-1",
          "from": "0xAccount1",
          "gas": "0x5208",
          "gasPrice": "0x3b9aca00",
          "to": "0x9008D19f58AAbd9eD0D60971565AA8510560ab41",
          "value": "0x0",
        },
        "type": "swap",
      }
    `);

    expect(submitIntentSpy).toHaveBeenCalled();
  });

  it('submitIntent: throws when approval tx is rejected', async () => {
    const { controller, accountAddress } = setup({
      approvalStatus: TransactionStatus.rejected,
      clientId: BridgeClientId.MOBILE,
      keyringType: 'Hardware',
    });

    const orderUid = 'order-uid-approve-2';
    const intentStatusResponse = {
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    const submitIntentSpy = jest
      .spyOn(intentApi, 'postSubmitOrder')
      .mockResolvedValue(intentStatusResponse);

    const quoteResponse = minimalIntentQuoteResponse({
      approval: {
        chainId: 1,
        from: accountAddress,
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        value: '0x0',
        gasLimit: 21000,
      },
    });

    const promise = controller.submitIntent({
      quoteResponse,
      accountAddress,
    });
    await expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Approval transaction did not confirm"`,
    );

    expect(submitIntentSpy).not.toHaveBeenCalled();
  });

  it('submitIntent: logs error when history update fails but still returns tx meta', async () => {
    const { controller, accountAddress } = setup();

    const orderUid = 'order-uid-log-1';

    const intentStatusResponse = {
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    jest
      .spyOn(intentApi, 'postSubmitOrder')
      .mockResolvedValue(intentStatusResponse);

    jest.spyOn(historyUtils, 'getInitialHistoryItem').mockImplementation(() => {
      throw new Error('boom');
    });

    const quoteResponse = minimalIntentQuoteResponse();
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await controller.submitIntent({
      quoteResponse,
      accountAddress,
    });

    expect(result).toBeDefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to add to bridge history'),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it('submitIntent: signs typedData', async () => {
    const { controller, messenger, accountAddress } = setup();

    const orderUid = 'order-uid-signed-in-core-1';

    const intentStatusResponse = {
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    const submitIntentSpy = jest
      .spyOn(intentApi, 'postSubmitOrder')
      .mockResolvedValue(intentStatusResponse);

    const quoteResponse = minimalIntentQuoteResponse();
    quoteResponse.quote.intent.typedData = {
      types: {},
      primaryType: 'Order',
      domain: {},
      message: {},
    };

    const originalCallImpl = (
      messenger.call as jest.Mock
    ).getMockImplementation();
    (messenger.call as jest.Mock).mockImplementation(
      (method: string, ...args: any[]) => {
        if (method === 'KeyringController:signTypedMessage') {
          return '0xautosigned';
        }
        return originalCallImpl?.(method, ...args);
      },
    );

    await controller.submitIntent({
      quoteResponse,
      accountAddress,
    });

    expect((messenger.call as jest.Mock).mock.calls).toStrictEqual(
      expect.arrayContaining([
        [
          'KeyringController:signTypedMessage',
          expect.objectContaining({
            from: accountAddress,
            data: quoteResponse.quote.intent.typedData,
          }),
          'V4',
        ],
      ]),
    );

    expect(submitIntentSpy.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
      {
        "bridgeApiBaseUrl": "http://localhost",
        "clientId": "extension",
        "fetchFn": [Function],
        "jwt": "0xjwt",
        "params": {
          "aggregatorId": "cowswap",
          "order": {
            "some": "order",
          },
          "quoteId": "req-1",
          "signature": "0xautosigned",
          "srcChainId": 1,
          "userAddress": "0xAccount1",
        },
      }
    `);
  });

  it('intent polling: updates history, merges tx hashes, updates TC tx, and stops polling on COMPLETED', async () => {
    const { controller, accountAddress, stopPollingSpy } = setup();

    const orderUid = 'order-uid-2';

    const intentStatusResponse = {
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    jest
      .spyOn(intentApi, 'postSubmitOrder')
      .mockResolvedValue(intentStatusResponse);

    const quoteResponse = minimalIntentQuoteResponse();

    await controller.submitIntent({
      quoteResponse,
      accountAddress,
    });

    const historyKey = orderUid;

    const intentStatusResponseCompleted = {
      id: orderUid,
      status: IntentOrderStatus.COMPLETED,
      txHash: '0xnewhash',
      metadata: { txHashes: ['0xold1', '0xnewhash'] },
    };
    jest
      .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
      .mockResolvedValue(intentStatusResponseCompleted);

    await controller._executePoll({ bridgeTxMetaId: historyKey });

    const updated = controller.state.txHistory[historyKey];
    expect(updated.status.status).toBe(StatusTypes.COMPLETE);
    expect(updated.status.srcChain.txHash).toBe('0xnewhash');

    expect(stopPollingSpy).toHaveBeenCalledWith('poll-token-1');
  });

  it('intent polling: maps PENDING to PENDING, falls back to txHash when metadata hashes empty', async () => {
    const { controller, accountAddress, transactions, stopPollingSpy } =
      setup();

    const orderUid = 'order-uid-expired-1';

    const intentStatusResponse = {
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    jest
      .spyOn(intentApi, 'postSubmitOrder')
      .mockResolvedValue(intentStatusResponse);

    const quoteResponse = minimalIntentQuoteResponse();

    await controller.submitIntent({
      quoteResponse,
      accountAddress,
    });

    const historyKey = orderUid;

    // Remove TC tx so update branch logs "transaction not found"
    transactions.splice(0, transactions.length);

    const intentStatusResponsePending = {
      id: orderUid,
      status: IntentOrderStatus.PENDING,
      txHash: '0xonlyhash',
      metadata: { txHashes: [] }, // forces fallback to txHash
    };
    jest
      .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
      .mockResolvedValue(intentStatusResponsePending);

    await controller._executePoll({ bridgeTxMetaId: historyKey });

    const updated = controller.state.txHistory[historyKey];
    expect(updated.status.status).toBe(StatusTypes.PENDING);
    expect(updated.status.srcChain.txHash).toBe('0xonlyhash');

    expect(stopPollingSpy).not.toHaveBeenCalled();
  });

  it('intent polling: maps EXPIRED to FAILED, falls back to txHash when metadata hashes empty, and skips TC update if original tx not found', async () => {
    const { controller, accountAddress, transactions, stopPollingSpy } =
      setup();

    const orderUid = 'order-uid-expired-1';

    const intentStatusResponse = {
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    jest
      .spyOn(intentApi, 'postSubmitOrder')
      .mockResolvedValue(intentStatusResponse);

    const quoteResponse = minimalIntentQuoteResponse();

    await controller.submitIntent({
      quoteResponse,
      accountAddress,
    });

    const historyKey = orderUid;

    // Remove TC tx so update branch logs "transaction not found"
    transactions.splice(0, transactions.length);

    jest
      .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
      .mockResolvedValue({
        id: orderUid,
        status: IntentOrderStatus.EXPIRED,
        txHash: '0xonlyhash',
        metadata: { txHashes: [] }, // forces fallback to txHash
      });

    await controller._executePoll({ bridgeTxMetaId: historyKey });

    const updated = controller.state.txHistory[historyKey];
    expect(updated.status.status).toBe(StatusTypes.FAILED);
    expect(updated.status.srcChain.txHash).toBe('0xonlyhash');

    expect(stopPollingSpy).toHaveBeenCalledWith('poll-token-1');
  });

  it('intent polling: stops polling when attempts reach MAX_ATTEMPTS', async () => {
    const orderUid = 'order-uid-3';
    const { controller, stopPollingSpy } = setup({
      mockTxHistory: {
        [orderUid]: {
          txMetaId: 'order-uid-3',
          originalTransactionId: 'order-uid-3',
          quote: {
            ...minimalIntentQuoteResponse().quote,
          },
          attempts: {
            counter: MAX_ATTEMPTS - 1,
            lastAttemptTime: 0,
          },
          status: {
            status: StatusTypes.PENDING,
            srcChain: { chainId: 1, txHash: undefined },
          },
        },
      },
    });

    jest.spyOn(intentApi, 'postSubmitOrder').mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

    const historyKey = orderUid;

    jest
      .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
      .mockRejectedValue(new Error('boom'));

    await controller._executePoll({ bridgeTxMetaId: historyKey });

    expect(stopPollingSpy).toHaveBeenCalledTimes(1);
    expect(controller.state.txHistory[historyKey].attempts).toStrictEqual(
      expect.objectContaining({ counter: MAX_ATTEMPTS }),
    );
  });
});

describe('BridgeStatusController (subscriptions + bridge polling + wiping)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('transactionFailed subscription: marks main tx as FAILED and tracks (non-rejected)', async () => {
    const mockTxHistory = {
      bridgeTxMetaId1: {
        txMetaId: 'bridgeTxMetaId1',
        originalTransactionId: 'bridgeTxMetaId1',
        quote: {
          srcChainId: 1,
          destChainId: 10,
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:1/slip44:60',
          },
          destAsset: { assetId: 'eip155:10/slip44:60' },
          bridges: ['across'],
          bridgeId: 'rango',
        },
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0xsrc' },
        },
      },
    };
    const { controller, messenger } = setup({
      mockTxHistory,
    });

    const failedCb = messenger.subscribe.mock.calls.find(
      ([evt]: [any]) => evt === 'TransactionController:transactionFailed',
    )?.[1];
    expect(typeof failedCb).toBe('function');

    failedCb({
      transactionMeta: {
        id: 'bridgeTxMetaId1',
        type: TransactionType.bridge,
        status: TransactionStatus.failed,
        chainId: '0x1',
      },
    });

    controller.stopAllPolling();

    expect(controller.state.txHistory.bridgeTxMetaId1.status.status).toBe(
      StatusTypes.FAILED,
    );

    // ensure tracking was attempted
    expect((messenger.call as jest.Mock).mock.calls).toStrictEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'BridgeController:trackUnifiedSwapBridgeEvent',
        ]),
      ]),
    );
  });

  it('transactionFailed subscription: maps approval tx id back to main history item', async () => {
    const mockTxHistory = {
      mainTx: {
        txMetaId: 'mainTx',
        originalTransactionId: 'mainTx',
        approvalTxId: 'approvalTx',
        quote: {
          srcChainId: 1,
          destChainId: 10,
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:1/slip44:60',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:10/slip44:60',
          },
          bridges: ['cowswap'],
          bridgeId: 'cowswap',
        },
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0xsrc' },
        },
      },
    };
    const { controller, messenger } = setup({
      mockTxHistory,
    });
    const failedCb = messenger.subscribe.mock.calls.find(
      ([evt]: [any]) => evt === 'TransactionController:transactionFailed',
    )?.[1];

    failedCb({
      transactionMeta: {
        id: 'approvalTx',
        type: TransactionType.bridgeApproval,
        status: TransactionStatus.failed,
        chainId: '0x1',
      },
    });

    controller.stopAllPolling();

    expect(controller.state.txHistory.mainTx.status.status).toBe(
      StatusTypes.FAILED,
    );
  });

  it('transactionConfirmed subscription: tracks swap Completed; starts polling on bridge confirmed', async () => {
    const mockTxHistory = {
      bridgeConfirmed1: {
        txMetaId: 'bridgeConfirmed1',
        originalTransactionId: 'bridgeConfirmed1',
        quote: {
          srcChainId: 1,
          destChainId: 10,
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:1/slip44:60',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:10/slip44:60',
          },
          bridges: ['cowswap'],
          bridgeId: 'cowswap',
        },
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0xsrc' },
        },
      },
    };
    const { messenger, controller, startPollingSpy } = setup({
      mockTxHistory,
    });

    const confirmedCb = messenger.subscribe.mock.calls.find(
      ([evt]: [any]) => evt === 'TransactionController:transactionConfirmed',
    )?.[1];
    expect(typeof confirmedCb).toBe('function');

    // Swap -> Completed tracking
    confirmedCb({
      id: 'swap1',
      type: TransactionType.swap,
      chainId: '0x1',
    });

    // Bridge -> startPolling
    confirmedCb({
      id: 'bridgeConfirmed1',
      type: TransactionType.bridge,
      chainId: '0x1',
    });

    controller.stopAllPolling();

    expect(startPollingSpy).toHaveBeenCalledWith({
      bridgeTxMetaId: 'bridgeConfirmed1',
    });
  });

  it('restartPollingForFailedAttempts: throws when identifier missing, and when no match found', async () => {
    const { controller } = setup();

    expect(() => controller.restartPollingForFailedAttempts({})).toThrow(
      /Either txMetaId or txHash must be provided/u,
    );

    expect(() =>
      controller.restartPollingForFailedAttempts({
        txMetaId: 'does-not-exist',
      }),
    ).toThrow(/No bridge transaction history found/u);
  });

  it('restartPollingForFailedAttempts: resets attempts and restarts polling via txHash lookup (bridge tx only)', async () => {
    const mockTxHistory = {
      bridgeTx1: {
        txMetaId: 'bridgeTx1',
        originalTransactionId: 'bridgeTx1',
        quote: {
          srcChainId: 1,
          destChainId: 10,
          srcAsset: {
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:1/slip44:60',
          },
          destAsset: {
            address: '0x0000000000000000000000000000000000000000',
            assetId: 'eip155:10/slip44:60',
          },
          bridges: ['cowswap'],
          bridgeId: 'cowswap',
        },
        attempts: { counter: 7, lastAttemptTime: Date.now() },
        account: '0xAccount1',
        status: {
          status: StatusTypes.UNKNOWN,
          srcChain: { chainId: 1, txHash: '0xhash-find-me' },
        },
      },
    };
    const { controller } = setup({
      mockTxHistory,
    });

    expect(controller.state.txHistory.bridgeTx1.attempts).toStrictEqual(
      expect.objectContaining({ counter: 7 }),
    );

    const startPollingSpy = jest.spyOn(controller, 'startPolling');

    controller.stopAllPolling();
    controller.restartPollingForFailedAttempts({ txHash: '0xhash-find-me' });

    expect(controller.state.txHistory.bridgeTx1.attempts).toBeUndefined();
    expect(startPollingSpy).toHaveBeenCalledWith({
      bridgeTxMetaId: 'bridgeTx1',
    });

    controller.stopAllPolling();
  });

  it('restartPollingForFailedAttempts: does not restart polling for same-chain swap tx', async () => {
    const mockTxHistory = {
      swapTx1: {
        txMetaId: 'swapTx1',
        originalTransactionId: 'swapTx1',
        quote: {
          srcChainId: 1,
          destChainId: 1,
          srcAsset: { assetId: 'eip155:1/slip44:60' },
          destAsset: { assetId: 'eip155:1/slip44:60' },
        },
        attempts: { counter: 7, lastAttemptTime: 0 },
        account: '0xAccount1',
        status: {
          status: StatusTypes.UNKNOWN,
          srcChain: { chainId: 1, txHash: '0xhash-samechain' },
        },
      },
    };
    const { controller, startPollingSpy } = setup({
      mockTxHistory,
    });

    controller.restartPollingForFailedAttempts({ txMetaId: 'swapTx1' });

    expect(controller.state.txHistory.swapTx1.attempts).toBeUndefined();
    expect(startPollingSpy).not.toHaveBeenCalled();
  });

  it('wipeBridgeStatus(ignoreNetwork=false): stops polling and removes only matching chain+account history', async () => {
    const { controller, stopPollingSpy, accountAddress } = setup({
      selectedChainId: '0x1',
    });

    const quoteResponse = minimalBridgeQuoteResponse(accountAddress);

    // Use deprecated method to create history and start polling (so token exists in controller)
    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'bridgeToWipe1', hash: '0xsrc' } as TransactionMeta,
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    });

    expect(controller.state.txHistory.bridgeToWipe1).toBeDefined();

    controller.wipeBridgeStatus({
      address: accountAddress,
      ignoreNetwork: false,
    });

    expect(stopPollingSpy).toHaveBeenCalledWith('poll-token-1');
    expect(controller.state.txHistory.bridgeToWipe1).toBeUndefined();
  });
});

describe('BridgeStatusController (target uncovered branches)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('transactionFailed: returns early for intent txs (swapMetaData.isIntentTx)', () => {
    const mockTxHistory = {
      tx1: {
        txMetaId: 'tx1',
        originalTransactionId: 'tx1',
        quote: minimalIntentQuoteResponse().quote,
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0x' },
        },
      },
    };
    const { controller, messenger } = setup({
      mockTxHistory,
    });

    const failedCb = messenger.subscribe.mock.calls.find(
      ([evt]: [any]) => evt === 'TransactionController:transactionFailed',
    )?.[1];

    failedCb({
      transactionMeta: {
        id: 'tx1',
        chainId: '0x1',
        type: TransactionType.bridge,
        status: TransactionStatus.failed,
        swapMetaData: { isIntentTx: true }, // <- triggers early return
      },
    });

    expect(controller.state.txHistory.tx1.status.status).toBe(
      StatusTypes.FAILED,
    );
    controller.stopAllPolling();
  });

  it('constructor restartPolling: skips items when shouldSkipFetchDueToFetchFailures returns true', () => {
    const accountAddress = '0xAccount1';
    const { messenger } = createMessengerHarness(accountAddress);

    const startPollingProtoSpy = jest
      .spyOn(BridgeStatusController.prototype, 'startPolling')
      .mockReturnValue('tok');

    // seed an incomplete bridge history item (PENDING + cross-chain)
    const state = {
      txHistory: {
        init1: {
          txMetaId: 'init1',
          originalTransactionId: 'init1',
          quote: { srcChainId: 1, destChainId: 10 },
          account: accountAddress,
          status: {
            status: StatusTypes.PENDING,
            srcChain: { chainId: 1, txHash: '0xsrc' },
          },
          attempts: { counter: MAX_ATTEMPTS, lastAttemptTime: Date.now() },
        },
      },
    } as unknown as BridgeStatusControllerState;

    // constructor calls #restartPollingForIncompleteHistoryItems()
    // shouldSkipFetchDueToFetchFailures=true => should NOT call startPolling
    const controller = new BridgeStatusController({
      messenger,
      state,
      clientId: BridgeClientId.EXTENSION,
      fetchFn: jest.fn(),
      addTransactionBatchFn: jest.fn(),
      config: { customBridgeApiBaseUrl: 'http://localhost' },
      traceFn: (_r: any, fn?: any): any => fn?.(),
    });

    expect(controller.state.txHistory.init1.attempts?.counter).toBe(
      MAX_ATTEMPTS,
    );

    expect(startPollingProtoSpy).not.toHaveBeenCalled();
    startPollingProtoSpy.mockRestore();
  });

  it('startPollingForTxId: stops existing polling token when restarting same tx', () => {
    const { controller, stopPollingSpy, startPollingSpy, accountAddress } =
      setup();

    // make startPolling return different tokens for the same tx
    startPollingSpy.mockReturnValueOnce('tok1').mockReturnValueOnce('tok2');

    const quoteResponse: any = {
      quote: { srcChainId: 1, destChainId: 10, destAsset: { assetId: 'x' } },
      estimatedProcessingTimeInSeconds: 1,
      sentAmount: { amount: '0' },
      gasFee: { effective: { amount: '0' } },
      toTokenAmount: { usd: '0' },
    };

    // first time => starts polling tok1
    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'sameTx' },
      statusRequest: { srcChainId: 1, srcTxHash: '0xhash', destChainId: 10 },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    } as any);

    // second time => should stop tok1 and start tok2
    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'sameTx' },
      statusRequest: { srcChainId: 1, srcTxHash: '0xhash', destChainId: 10 },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    } as any);

    expect(stopPollingSpy).toHaveBeenCalledWith('tok1');
  });

  it('bridge polling: returns early when shouldSkipFetchDueToFetchFailures returns true', async () => {
    const mockTxHistory = {
      valFail1: {
        txMetaId: 'valFail1',
        originalTransactionId: 'valFail1',
        quote: {
          srcChainId: 1,
          destChainId: 137,
          destAsset: { assetId: 'x' },
          bridges: ['rango'],
        },
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0xhash' },
        },
        attempts: {
          counter: MAX_ATTEMPTS,
          lastAttemptTime: Date.now(),
        },
      },
    };
    const { controller, accountAddress } = setup({
      mockTxHistory,
    });

    const quoteResponse: any = {
      quote: {
        srcChainId: 1,
        destChainId: 10,
        destAsset: { assetId: 'x' },
        bridges: ['across'],
      },
      estimatedProcessingTimeInSeconds: 1,
      sentAmount: { amount: '0' },
      gasFee: { effective: { amount: '0' } },
      toTokenAmount: { usd: '0' },
    };

    const statusResponse = {
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
      validationFailures: [],
    };
    const fetchBridgeTxStatusSpy = jest
      .spyOn(bridgeStatusUtils, 'fetchBridgeTxStatus')
      .mockResolvedValue(statusResponse);

    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'valFail1' },
      statusRequest: { srcChainId: 1, srcTxHash: '0xhash', destChainId: 10 },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    } as any);

    await controller._executePoll({ bridgeTxMetaId: 'valFail1' });

    expect(fetchBridgeTxStatusSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        bridge: 'rango',
        destChainId: 137,
      }),
    );
  });

  it('statusValidationFailed event includes refresh_count from attempts', async () => {
    const quoteResponse = minimalBridgeQuoteResponse('0xAccount1');
    const { controller, messenger, mockFetchFn } = setup({
      mockTxHistory: {
        valFail1: {
          txMetaId: 'valFail1',
          originalTransactionId: 'valFail1',
          quote: quoteResponse.quote,
          account: '0xAccount1',
          attempts: { counter: 3, lastAttemptTime: Date.now() - 100000000 },
          status: {
            status: StatusTypes.PENDING,
            srcChain: { chainId: 1, txHash: '0xhash' },
          },
        },
      },
    });

    mockFetchFn.mockResolvedValueOnce({
      srcChain: { chainId: 1, txHash: '0xhash' },
    });

    await controller._executePoll({ bridgeTxMetaId: 'valFail1' });

    expect(controller.state.txHistory.valFail1.attempts).toStrictEqual(
      expect.objectContaining({ counter: 4 }),
    );

    expect(messenger.call.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "AuthenticationController:getBearerToken",
        ],
        [
          "BridgeController:trackUnifiedSwapBridgeEvent",
          "Unified SwapBridge Status Failed Validation",
          {
            "action_type": "swapbridge-v1",
            "chain_id_destination": "eip155:10",
            "chain_id_source": "eip155:1",
            "failures": [
              "across|status",
            ],
            "location": "Main View",
            "refresh_count": 3,
            "token_address_destination": "eip155:10/slip44:60",
            "token_address_source": "eip155:1/slip44:60",
          },
        ],
      ]
    `);
    controller.stopAllPolling();
  });

  it('track event: history has featureId => #trackUnifiedSwapBridgeEvent returns early (skip tracking)', () => {
    const mockTxHistory = {
      feat1: {
        txMetaId: 'feat1',
        originalTransactionId: 'feat1',
        quote: minimalBridgeQuoteResponse('0xAccount1').quote,
        account: '0xAccount1',
        featureId: 'perps',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0x' },
        },
      },
    };
    const { controller, messenger } = setup({
      mockTxHistory,
    });

    const failedCb = messenger.subscribe.mock.calls.find(
      ([evt]: [any]) => evt === 'TransactionController:transactionFailed',
    )?.[1];

    failedCb({
      transactionMeta: {
        id: 'feat1',
        type: TransactionType.bridge,
        status: TransactionStatus.failed,
        chainId: '0x1',
      },
    });

    // should skip due to featureId
    expect((messenger.call as jest.Mock).mock.calls).not.toStrictEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'BridgeController:trackUnifiedSwapBridgeEvent',
        ]),
      ]),
    );
    controller.stopAllPolling();
  });

  it('intent order PENDING maps to bridge PENDING', async () => {
    const mockTxHistory = {
      'order-1': {
        txMetaId: 'order-1',
        originalTransactionId: 'order-1',
        quote: minimalIntentQuoteResponse().quote,
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0xhash' },
        },
      },
    };
    const { controller } = setup({
      mockTxHistory,
    });

    jest
      .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
      .mockImplementation(
        jest.fn().mockResolvedValue({
          id: 'order-1',
          status: IntentOrderStatus.PENDING,
          txHash: undefined,
          metadata: { txHashes: [] },
        }),
      );

    controller.startPolling({
      bridgeTxMetaId: 'order-1',
    });

    expect(controller.state.txHistory['order-1'].status.status).toBe(
      StatusTypes.PENDING,
    );
    controller.stopAllPolling();
  });

  it('intent order SUBMITTED maps to bridge SUBMITTED', async () => {
    const orderStatusResponseSubmitted = {
      id: 'order-1',
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    const getOrderStatusSpy = jest
      .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
      .mockImplementation(
        jest.fn().mockResolvedValueOnce(orderStatusResponseSubmitted),
      );

    const { controller } = setup({
      mockTxHistory: {
        'order-1': {
          txMetaId: 'order-1',
          originalTransactionId: 'order-1',
          quote: minimalIntentQuoteResponse().quote,
          account: '0xAccount1',
          status: {
            status: StatusTypes.SUBMITTED,
            srcChain: { chainId: 1, txHash: '0xhash' },
          },
        },
      },
    });
    const orderStatusResponse = {
      id: 'order-1',
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    };
    jest
      .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
      .mockImplementation(jest.fn().mockResolvedValue(orderStatusResponse));

    await controller._executePoll({ bridgeTxMetaId: 'order-1' });

    expect(getOrderStatusSpy).toHaveBeenCalledWith(
      'order-1',
      'cowswap',
      1,
      'extension',
    );
    expect(controller.state.txHistory['order-1'].status.status).toBe(
      StatusTypes.SUBMITTED,
    );
    controller.stopAllPolling();
  });

  it('unknown intent order status maps to bridge UNKNOWN', async () => {
    const { controller } = setup({
      mockTxHistory: {
        'order-1': {
          txMetaId: 'order-1',
          originalTransactionId: 'order-1',
          quote: minimalIntentQuoteResponse().quote,
          account: '0xAccount1',
          status: {
            status: StatusTypes.PENDING,
            srcChain: { chainId: 1, txHash: '0xhash' },
          },
        },
      },
    });

    jest
      .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
      .mockImplementation(
        jest.fn().mockResolvedValue({
          id: 'order-1',
          status: 'SOME_NEW_STATUS' as any, // force UNKNOWN branch
          txHash: undefined,
          metadata: { txHashes: [] },
        }),
      );

    await controller._executePoll({ bridgeTxMetaId: 'order-1' });

    expect(controller.state.txHistory['order-1'].status.status).toBe(
      StatusTypes.UNKNOWN,
    );

    controller.stopAllPolling();
  });

  it('intent polling: handles fetch failure when getIntentTransactionStatus returns undefined (e.g. non-Error rejection)', async () => {
    const { controller } = setup({
      mockTxHistory: {
        'order-1': {
          txMetaId: 'order-1',
          originalTransactionId: 'order-1',
          quote: minimalIntentQuoteResponse().quote,
          account: '0xAccount1',
          status: {
            status: StatusTypes.PENDING,
            srcChain: { chainId: 1, txHash: '0xhash' },
          },
        },
      },
    });

    jest
      .spyOn(intentApi.IntentApiImpl.prototype, 'getOrderStatus')
      .mockImplementation(jest.fn().mockRejectedValue('non-Error rejection'));

    await controller._executePoll({ bridgeTxMetaId: 'order-1' });

    expect(controller.state.txHistory['order-1'].status.status).toBe(
      StatusTypes.PENDING,
    );
    expect(controller.state.txHistory['order-1'].attempts).toBeUndefined();
    controller.stopAllPolling();
  });

  it('bridge polling: returns early when history item is missing', async () => {
    const { controller } = setup();
    const fetchBridgeTxStatusSpy = jest.spyOn(
      bridgeStatusUtils,
      'fetchBridgeTxStatus',
    );
    await controller._executePoll({ bridgeTxMetaId: 'missing-history' });

    expect(fetchBridgeTxStatusSpy).not.toHaveBeenCalled();
  });
});
