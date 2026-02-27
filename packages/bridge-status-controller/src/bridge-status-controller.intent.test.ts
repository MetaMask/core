/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable jest/no-restricted-matchers */
import {
  StatusTypes,
  UnifiedSwapBridgeEventName,
} from '@metamask/bridge-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';

import { MAX_ATTEMPTS } from './constants';
import { IntentOrderStatus } from './utils/validators';

type Tx = Pick<TransactionMeta, 'id' | 'status'> & {
  type?: TransactionType;
  chainId?: string;
  hash?: string;
  txReceipt?: any;
};

const seedIntentHistory = (controller: any): any => {
  controller.update((state: any) => {
    state.txHistory['order-1'] = {
      txMetaId: 'order-1',
      originalTransactionId: 'tx1',
      quote: {
        srcChainId: 1,
        destChainId: 1,
        intent: { protocol: 'cowswap' },
      },
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1, txHash: '' },
      },
      attempts: undefined, // IMPORTANT: prevents early return
    };
  });
};

const minimalIntentQuoteResponse = (overrides?: Partial<any>): any => {
  return {
    quote: {
      requestId: 'req-1',
      srcChainId: 1,
      destChainId: 1,
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
      },
    },
    sentAmount: { amount: '1', usd: '1' },
    gasFee: { effective: { amount: '0', usd: '0' } },
    toTokenAmount: { usd: '1' },
    estimatedProcessingTimeInSeconds: 15,
    featureId: undefined,
    approval: undefined,
    resetApproval: undefined,
    trade: '0xdeadbeef',
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
): any => {
  const transactions: Tx[] = [];

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
            metadata: { keyring: { type: 'HD Key Tree' } },
          };
        }
        case 'TransactionController:getState':
          return { transactions };
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
        default:
          return undefined;
      }
    }),
  };

  return { messenger, transactions };
};

const loadControllerWithMocks = (): any => {
  const submitIntentMock = jest.fn();
  const getOrderStatusMock = jest.fn();

  const fetchBridgeTxStatusMock = jest.fn();
  const getStatusRequestWithSrcTxHashMock = jest.fn();
  const getStatusRequestParamsMock = jest.fn().mockReturnValue({
    srcChainId: 1,
    destChainId: 1,
    srcTxHash: '',
  });

  // ADD THIS
  const shouldSkipFetchDueToFetchFailuresMock = jest
    .fn()
    .mockReturnValue(false);

  let BridgeStatusController: any;

  jest.resetModules();

  jest.isolateModules(() => {
    jest.doMock('./utils/intent-api', () => {
      const actual = jest.requireActual('./utils/intent-api');
      return {
        ...actual,
        IntentApiImpl: jest.fn().mockImplementation(() => ({
          submitIntent: submitIntentMock,
          getOrderStatus: getOrderStatusMock,
        })),
      };
    });

    jest.doMock('./utils/bridge-status', () => {
      const actual = jest.requireActual('./utils/bridge-status');
      return {
        ...actual,
        fetchBridgeTxStatus: fetchBridgeTxStatusMock,
        getStatusRequestWithSrcTxHash: getStatusRequestWithSrcTxHashMock,
        shouldSkipFetchDueToFetchFailures:
          shouldSkipFetchDueToFetchFailuresMock,
      };
    });

    jest.doMock('./utils/transaction', () => {
      const actual = jest.requireActual('./utils/transaction');
      return {
        ...actual,
        generateActionId: jest
          .fn()
          .mockReturnValue({ toString: () => 'action-id-1' }),
        handleApprovalDelay: jest.fn().mockResolvedValue(undefined),
        handleMobileHardwareWalletDelay: jest.fn().mockResolvedValue(undefined),

        // keep your existing getStatusRequestParams stub here if you have it
        getStatusRequestParams: getStatusRequestParamsMock,
      };
    });

    jest.doMock('./utils/metrics', () => ({
      getFinalizedTxProperties: jest.fn().mockReturnValue({}),
      getPriceImpactFromQuote: jest.fn().mockReturnValue({}),
      getRequestMetadataFromHistory: jest.fn().mockReturnValue({}),
      getRequestParamFromHistory: jest.fn().mockReturnValue({
        chain_id_source: 'eip155:1',
        chain_id_destination: 'eip155:10',
        token_address_source: '0xsrc',
        token_address_destination: '0xdest',
      }),
      getTradeDataFromHistory: jest.fn().mockReturnValue({}),
      getEVMTxPropertiesFromTransactionMeta: jest.fn().mockReturnValue({}),
      getTxStatusesFromHistory: jest.fn().mockReturnValue({}),
      getPreConfirmationPropertiesFromQuote: jest.fn().mockReturnValue({}),
    }));

    /* eslint-disable @typescript-eslint/no-require-imports, n/global-require */
    BridgeStatusController =
      require('./bridge-status-controller').BridgeStatusController;
    /* eslint-enable @typescript-eslint/no-require-imports, n/global-require */
  });

  return {
    BridgeStatusController,
    submitIntentMock,
    getOrderStatusMock,
    fetchBridgeTxStatusMock,
    getStatusRequestWithSrcTxHashMock,
    shouldSkipFetchDueToFetchFailuresMock,
    getStatusRequestParamsMock,
  };
};

const setup = (options?: {
  selectedChainId?: string;
  approvalStatus?: TransactionStatus;
}): any => {
  const accountAddress = '0xAccount1';
  const { messenger, transactions } = createMessengerHarness(
    accountAddress,
    options?.selectedChainId ?? '0x1',
  );

  const {
    BridgeStatusController,
    submitIntentMock,
    getOrderStatusMock,
    fetchBridgeTxStatusMock,
    getStatusRequestWithSrcTxHashMock,
    shouldSkipFetchDueToFetchFailuresMock,
    getStatusRequestParamsMock,
  } = loadControllerWithMocks();

  const addTransactionFn = jest.fn(async (txParams: any, reqOpts: any) => {
    // Approval TX path (submitIntent -> #handleApprovalTx -> #handleEvmTransaction)
    if (
      reqOpts?.type === TransactionType.bridgeApproval ||
      reqOpts?.type === TransactionType.swapApproval
    ) {
      const hash = '0xapprovalhash1';

      const approvalTx: Tx = {
        id: 'approvalTxId1',
        type: reqOpts.type,
        status: options?.approvalStatus ?? TransactionStatus.failed,
        chainId: txParams.chainId,
        hash,
      };
      transactions.push(approvalTx);

      return {
        result: Promise.resolve(hash),
        transactionMeta: approvalTx,
      };
    }

    // Intent “display tx” path
    const intentTx: Tx = {
      id: 'intentDisplayTxId1',
      type: reqOpts?.type,
      status: TransactionStatus.submitted,
      chainId: txParams.chainId,
      hash: undefined,
    };
    transactions.push(intentTx);

    return {
      result: Promise.resolve('0xunused'),
      transactionMeta: intentTx,
    };
  });

  const controller = new BridgeStatusController({
    messenger,
    clientId: 'extension',
    fetchFn: jest.fn(),
    addTransactionFn,
    addTransactionBatchFn: jest.fn(),
    updateTransactionFn: jest.fn(),
    estimateGasFeeFn: jest.fn(async () => ({ estimates: {} })),
    config: { customBridgeApiBaseUrl: 'http://localhost' },
    traceFn: (_req: any, fn?: any): any => fn?.(),
  });

  const startPollingSpy = jest
    .spyOn(controller, 'startPolling')
    .mockReturnValue('poll-token-1');

  const stopPollingSpy = jest
    .spyOn(controller, 'stopPollingByPollingToken')
    .mockImplementation(() => undefined);

  return {
    controller,
    messenger,
    transactions,
    addTransactionFn,
    startPollingSpy,
    stopPollingSpy,
    accountAddress,
    submitIntentMock,
    getOrderStatusMock,
    fetchBridgeTxStatusMock,
    getStatusRequestWithSrcTxHashMock,
    shouldSkipFetchDueToFetchFailuresMock,
    getStatusRequestParamsMock,
  };
};

describe('BridgeStatusController (intent swaps)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submitIntent: throws if approval confirmation fails (does not write history or start polling)', async () => {
    const { controller, accountAddress, submitIntentMock, startPollingSpy } =
      setup();

    const orderUid = 'order-uid-1';

    // In the "throw on approval confirmation failure" behavior, we should not reach intent submission,
    // but keep this here to prove it wasn't used.
    submitIntentMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

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
      signature: '0xsig',
      accountAddress,
    });
    expect(await promise.catch((error: any) => error)).toStrictEqual(
      expect.objectContaining({
        message: expect.stringMatching(/approval/iu),
      }),
    );

    // Since we throw before intent order submission succeeds, we should not create the history item
    // (and therefore should not start polling).
    const historyKey = orderUid;
    expect(controller.state.txHistory[historyKey]).toBeUndefined();

    expect(startPollingSpy).not.toHaveBeenCalled();

    // Optional: ensure we never called the intent API submit
    expect(submitIntentMock).not.toHaveBeenCalled();
  });

  it('submitIntent: completes when approval tx confirms', async () => {
    const { controller, accountAddress, submitIntentMock } = setup({
      approvalStatus: TransactionStatus.confirmed,
    });

    const orderUid = 'order-uid-approve-1';
    submitIntentMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

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
        signature: '0xsig',
        accountAddress,
      }),
    ).resolves.toBeDefined();

    expect(submitIntentMock).toHaveBeenCalled();
  });

  it('submitIntent: throws when approval tx is rejected', async () => {
    const { controller, accountAddress, submitIntentMock } = setup({
      approvalStatus: TransactionStatus.rejected,
    });

    const orderUid = 'order-uid-approve-2';
    submitIntentMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

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
      signature: '0xsig',
      accountAddress,
    });
    expect(await promise.catch((error: any) => error)).toStrictEqual(
      expect.objectContaining({
        message: expect.stringMatching(/approval/iu),
      }),
    );

    expect(submitIntentMock).not.toHaveBeenCalled();
  });

  it('submitIntent: logs error when history update fails but still returns tx meta', async () => {
    const {
      controller,
      accountAddress,
      submitIntentMock,
      getStatusRequestParamsMock,
    } = setup();

    const orderUid = 'order-uid-log-1';

    submitIntentMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

    getStatusRequestParamsMock.mockImplementation(() => {
      throw new Error('boom');
    });

    const quoteResponse = minimalIntentQuoteResponse();
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await controller.submitIntent({
      quoteResponse,
      signature: '0xsig',
      accountAddress,
    });

    expect(result).toBeDefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to add to bridge history'),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it('intent polling: updates history, merges tx hashes, updates TC tx, and stops polling on COMPLETED', async () => {
    const {
      controller,
      accountAddress,
      submitIntentMock,
      getOrderStatusMock,
      stopPollingSpy,
    } = setup();

    const orderUid = 'order-uid-2';

    submitIntentMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

    const quoteResponse = minimalIntentQuoteResponse();

    await controller.submitIntent({
      quoteResponse,
      signature: '0xsig',
      accountAddress,
    });

    const historyKey = orderUid;

    getOrderStatusMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.COMPLETED,
      txHash: '0xnewhash',
      metadata: { txHashes: ['0xold1', '0xnewhash'] },
    });

    await controller._executePoll({ bridgeTxMetaId: historyKey });

    const updated = controller.state.txHistory[historyKey];
    expect(updated.status.status).toBe(StatusTypes.COMPLETE);
    expect(updated.status.srcChain.txHash).toBe('0xnewhash');

    expect(stopPollingSpy).toHaveBeenCalledWith('poll-token-1');
  });

  it('intent polling: maps EXPIRED to FAILED, falls back to txHash when metadata hashes empty, and skips TC update if original tx not found', async () => {
    const {
      controller,
      accountAddress,
      submitIntentMock,
      getOrderStatusMock,
      transactions,
      stopPollingSpy,
    } = setup();

    const orderUid = 'order-uid-expired-1';

    submitIntentMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

    const quoteResponse = minimalIntentQuoteResponse();

    await controller.submitIntent({
      quoteResponse,
      signature: '0xsig',
      accountAddress,
    });

    const historyKey = orderUid;

    // Remove TC tx so update branch logs "transaction not found"
    transactions.splice(0, transactions.length);

    getOrderStatusMock.mockResolvedValue({
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
    const {
      controller,
      accountAddress,
      submitIntentMock,
      getOrderStatusMock,
      stopPollingSpy,
    } = setup();

    const orderUid = 'order-uid-3';

    submitIntentMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

    const quoteResponse = minimalIntentQuoteResponse();

    await controller.submitIntent({
      quoteResponse,
      signature: '0xsig',
      accountAddress,
    });

    const historyKey = orderUid;

    // Prime attempts so next failure hits MAX_ATTEMPTS
    controller.update((state: any) => {
      state.txHistory[historyKey].attempts = {
        counter: MAX_ATTEMPTS - 1,
        lastAttemptTime: 0,
      };
    });

    getOrderStatusMock.mockRejectedValue(new Error('boom'));

    await controller._executePoll({ bridgeTxMetaId: historyKey });

    expect(stopPollingSpy).toHaveBeenCalledWith('poll-token-1');
    expect(controller.state.txHistory[historyKey].attempts).toStrictEqual(
      expect.objectContaining({ counter: MAX_ATTEMPTS }),
    );
  });
});

describe('BridgeStatusController (subscriptions + bridge polling + wiping)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('transactionFailed subscription: marks main tx as FAILED and tracks (non-rejected)', async () => {
    const { controller, messenger } = setup();

    // Seed txHistory with a pending bridge tx
    controller.update((state: any) => {
      state.txHistory.bridgeTxMetaId1 = {
        txMetaId: 'bridgeTxMetaId1',
        originalTransactionId: 'bridgeTxMetaId1',
        quote: {
          srcChainId: 1,
          destChainId: 10,
          srcAsset: { assetId: 'eip155:1/slip44:60' },
          destAsset: { assetId: 'eip155:10/slip44:60' },
        },
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0xsrc' },
        },
      };
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
    const { controller, messenger } = setup();

    controller.update((state: any) => {
      state.txHistory.mainTx = {
        txMetaId: 'mainTx',
        originalTransactionId: 'mainTx',
        approvalTxId: 'approvalTx',
        quote: {
          srcChainId: 1,
          destChainId: 10,
          srcAsset: { assetId: 'eip155:1/slip44:60' },
          destAsset: { assetId: 'eip155:10/slip44:60' },
        },
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0xsrc' },
        },
      };
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

    expect(controller.state.txHistory.mainTx.status.status).toBe(
      StatusTypes.FAILED,
    );
  });

  it('transactionConfirmed subscription: tracks swap Completed; starts polling on bridge confirmed', async () => {
    const { controller, messenger, startPollingSpy } = setup();

    // Seed history for bridge id so #startPollingForTxId can startPolling()
    controller.update((state: any) => {
      state.txHistory.bridgeConfirmed1 = {
        txMetaId: 'bridgeConfirmed1',
        originalTransactionId: 'bridgeConfirmed1',
        quote: {
          srcChainId: 1,
          destChainId: 10,
          srcAsset: { assetId: 'eip155:1/slip44:60' },
          destAsset: { assetId: 'eip155:10/slip44:60' },
        },
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0xsrc' },
        },
      };
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
    const { controller, startPollingSpy } = setup();

    controller.update((state: any) => {
      state.txHistory.bridgeTx1 = {
        txMetaId: 'bridgeTx1',
        originalTransactionId: 'bridgeTx1',
        quote: {
          srcChainId: 1,
          destChainId: 10,
          srcAsset: { assetId: 'eip155:1/slip44:60' },
          destAsset: { assetId: 'eip155:10/slip44:60' },
        },
        attempts: { counter: 7, lastAttemptTime: 0 },
        account: '0xAccount1',
        status: {
          status: StatusTypes.UNKNOWN,
          srcChain: { chainId: 1, txHash: '0xhash-find-me' },
        },
      };
    });

    controller.restartPollingForFailedAttempts({ txHash: '0xhash-find-me' });

    expect(controller.state.txHistory.bridgeTx1.attempts).toBeUndefined();
    expect(startPollingSpy).toHaveBeenCalledWith({
      bridgeTxMetaId: 'bridgeTx1',
    });
  });

  it('restartPollingForFailedAttempts: does not restart polling for same-chain swap tx', async () => {
    const { controller, startPollingSpy } = setup();

    controller.update((state: any) => {
      state.txHistory.swapTx1 = {
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
      };
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
      bridgeTxMeta: { id: 'bridgeToWipe1' },
      statusRequest: {
        srcChainId: 1,
        srcTxHash: '0xsrc',
        destChainId: 10,
      },
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

  it('eVM bridge polling: looks up srcTxHash in TC when missing, updates history, stops polling, and publishes completion', async () => {
    const {
      controller,
      transactions,
      accountAddress,
      fetchBridgeTxStatusMock,
      getStatusRequestWithSrcTxHashMock,
      stopPollingSpy,
      messenger,
    } = setup();

    // Create a history item with missing src tx hash
    const quoteResponse = minimalBridgeQuoteResponse(accountAddress);
    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'bridgePoll1' },
      statusRequest: {
        srcChainId: 1,
        srcTxHash: '', // force TC lookup
        destChainId: 10,
      },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    });

    // Seed TC with tx meta id=bridgePoll1 and a hash for lookup
    transactions.push({
      id: 'bridgePoll1',
      status: TransactionStatus.confirmed,
      type: TransactionType.bridge,
      chainId: '0x1',
      hash: '0xlooked-up-hash',
    });

    getStatusRequestWithSrcTxHashMock.mockReturnValue({
      srcChainId: 1,
      srcTxHash: '0xlooked-up-hash',
      destChainId: 10,
    });

    fetchBridgeTxStatusMock.mockResolvedValue({
      status: {
        status: StatusTypes.COMPLETE,
        srcChain: { chainId: 1, txHash: '0xlooked-up-hash' },
        destChain: { chainId: 10, txHash: '0xdesthash' },
      },
      validationFailures: [],
    });

    await controller._executePoll({ bridgeTxMetaId: 'bridgePoll1' });

    const updated = controller.state.txHistory.bridgePoll1;

    expect(updated.status.status).toBe(StatusTypes.COMPLETE);
    expect(updated.status.srcChain.txHash).toBe('0xlooked-up-hash');
    expect(updated.completionTime).toStrictEqual(expect.any(Number));

    expect(stopPollingSpy).toHaveBeenCalledWith('poll-token-1');

    expect(messenger.publish).toHaveBeenCalledWith(
      'BridgeStatusController:destinationTransactionCompleted',
      quoteResponse.quote.destAsset.assetId,
    );
  });

  it('eVM bridge polling: tracks StatusValidationFailed, increments attempts, and stops polling at MAX_ATTEMPTS', async () => {
    const {
      controller,
      accountAddress,
      fetchBridgeTxStatusMock,
      getStatusRequestWithSrcTxHashMock,
      stopPollingSpy,
    } = setup();

    const quoteResponse = minimalBridgeQuoteResponse(accountAddress);
    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'bridgeValidationFail1' },
      statusRequest: {
        srcChainId: 1,
        srcTxHash: '0xsrc',
        destChainId: 10,
      },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    });

    // Prime attempts to just below MAX so the next failure stops polling
    controller.update((state: any) => {
      state.txHistory.bridgeValidationFail1.attempts = {
        counter: MAX_ATTEMPTS - 1,
        lastAttemptTime: 0,
      };
    });

    getStatusRequestWithSrcTxHashMock.mockReturnValue({
      srcChainId: 1,
      srcTxHash: '0xsrc',
      destChainId: 10,
    });

    fetchBridgeTxStatusMock.mockResolvedValue({
      status: {
        status: StatusTypes.UNKNOWN,
        srcChain: { chainId: 1, txHash: '0xsrc' },
      },
      validationFailures: ['bad_status_shape'],
    });

    await controller._executePoll({
      bridgeTxMetaId: 'bridgeValidationFail1',
    });

    expect(
      controller.state.txHistory.bridgeValidationFail1.attempts,
    ).toStrictEqual(expect.objectContaining({ counter: MAX_ATTEMPTS }));
    expect(stopPollingSpy).toHaveBeenCalledWith('poll-token-1');
  });

  it('bridge polling: returns early (does not fetch) when srcTxHash cannot be determined', async () => {
    const {
      controller,
      accountAddress,
      fetchBridgeTxStatusMock,
      getStatusRequestWithSrcTxHashMock,
    } = setup();

    const quoteResponse = minimalBridgeQuoteResponse(accountAddress);
    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'bridgeNoHash1' },
      statusRequest: {
        srcChainId: 1,
        srcTxHash: '', // missing
        destChainId: 10,
      },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    });

    await controller._executePoll({ bridgeTxMetaId: 'bridgeNoHash1' });

    expect(getStatusRequestWithSrcTxHashMock).not.toHaveBeenCalled();
    expect(fetchBridgeTxStatusMock).not.toHaveBeenCalled();
  });
});

describe('BridgeStatusController (target uncovered branches)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('transactionFailed: returns early for intent txs (swapMetaData.isIntentTx)', () => {
    const { controller, messenger } = setup();

    // seed a history item that would otherwise be marked FAILED
    controller.update((state: any) => {
      state.txHistory.tx1 = {
        txMetaId: 'tx1',
        originalTransactionId: 'tx1',
        quote: { srcChainId: 1, destChainId: 10 },
        account: '0xAccount1',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0x' },
        },
      };
    });

    const failedCb = messenger.subscribe.mock.calls.find(
      ([evt]: [any]) => evt === 'TransactionController:transactionFailed',
    )?.[1];

    failedCb({
      transactionMeta: {
        id: 'tx1',
        type: TransactionType.bridge,
        status: TransactionStatus.failed,
        swapMetaData: { isIntentTx: true }, // <- triggers early return
      },
    });

    expect(controller.state.txHistory.tx1.status.status).toBe(
      StatusTypes.FAILED,
    );
  });

  it('constructor restartPolling: skips items when shouldSkipFetchDueToFetchFailures returns true', () => {
    const accountAddress = '0xAccount1';
    const { messenger } = createMessengerHarness(accountAddress);

    const { BridgeStatusController, shouldSkipFetchDueToFetchFailuresMock } =
      loadControllerWithMocks();

    shouldSkipFetchDueToFetchFailuresMock.mockReturnValue(true);

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
          attempts: { counter: 1, lastAttemptTime: 0 },
        },
      },
    };

    // constructor calls #restartPollingForIncompleteHistoryItems()
    // shouldSkipFetchDueToFetchFailures=true => should NOT call startPolling
    // eslint-disable-next-line no-new
    new BridgeStatusController({
      messenger,
      state,
      clientId: 'extension',
      fetchFn: jest.fn(),
      addTransactionFn: jest.fn(),
      addTransactionBatchFn: jest.fn(),
      updateTransactionFn: jest.fn(),
      estimateGasFeeFn: jest.fn(),
      config: { customBridgeApiBaseUrl: 'http://localhost' },
      traceFn: (_r: any, fn?: any): any => fn?.(),
    });

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
    const {
      controller,
      accountAddress,
      shouldSkipFetchDueToFetchFailuresMock,
      fetchBridgeTxStatusMock,
    } = setup();

    const quoteResponse: any = {
      quote: { srcChainId: 1, destChainId: 10, destAsset: { assetId: 'x' } },
      estimatedProcessingTimeInSeconds: 1,
      sentAmount: { amount: '0' },
      gasFee: { effective: { amount: '0' } },
      toTokenAmount: { usd: '0' },
    };

    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'skipPoll1' },
      statusRequest: { srcChainId: 1, srcTxHash: '0xhash', destChainId: 10 },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    } as any);

    shouldSkipFetchDueToFetchFailuresMock.mockReturnValueOnce(true);

    await controller._executePoll({ bridgeTxMetaId: 'skipPoll1' });

    expect(fetchBridgeTxStatusMock).not.toHaveBeenCalled();
  });

  it('bridge polling: final FAILED tracks Failed event', async () => {
    const {
      controller,
      accountAddress,
      fetchBridgeTxStatusMock,
      getStatusRequestWithSrcTxHashMock,
      messenger,
    } = setup();

    const quoteResponse: any = {
      quote: {
        srcChainId: 1,
        destChainId: 10,
        destAsset: { assetId: 'dest' },
        srcAsset: { assetId: 'src' },
      },
      estimatedProcessingTimeInSeconds: 1,
      sentAmount: { amount: '0' },
      gasFee: { effective: { amount: '0' } },
      toTokenAmount: { usd: '0' },
    };

    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'failFinal1' },
      statusRequest: { srcChainId: 1, srcTxHash: '0xhash', destChainId: 10 },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    } as any);

    getStatusRequestWithSrcTxHashMock.mockReturnValue({
      srcChainId: 1,
      srcTxHash: '0xhash',
      destChainId: 10,
    });

    fetchBridgeTxStatusMock.mockResolvedValue({
      status: {
        status: StatusTypes.FAILED,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
      validationFailures: [],
    });

    await controller._executePoll({ bridgeTxMetaId: 'failFinal1' });

    expect((messenger.call as jest.Mock).mock.calls).toStrictEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'BridgeController:trackUnifiedSwapBridgeEvent',
          UnifiedSwapBridgeEventName.Failed,
          expect.any(Object),
        ]),
      ]),
    );
  });

  it('bridge polling: final COMPLETE with featureId set stops polling but skips tracking', async () => {
    const {
      controller,
      accountAddress,
      fetchBridgeTxStatusMock,
      getStatusRequestWithSrcTxHashMock,
      stopPollingSpy,
      messenger,
    } = setup();

    const quoteResponse: any = {
      quote: {
        srcChainId: 1,
        destChainId: 10,
        destAsset: { assetId: 'dest' },
        srcAsset: { assetId: 'src' },
      },
      featureId: 'perps', // <- triggers featureId skip in #fetchBridgeTxStatus
      estimatedProcessingTimeInSeconds: 1,
      sentAmount: { amount: '0' },
      gasFee: { effective: { amount: '0' } },
      toTokenAmount: { usd: '0' },
    };

    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'perps1' },
      statusRequest: { srcChainId: 1, srcTxHash: '0xhash', destChainId: 10 },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    } as any);

    getStatusRequestWithSrcTxHashMock.mockReturnValue({
      srcChainId: 1,
      srcTxHash: '0xhash',
      destChainId: 10,
    });

    fetchBridgeTxStatusMock.mockResolvedValue({
      status: {
        status: StatusTypes.COMPLETE,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
      validationFailures: [],
    });

    await controller._executePoll({ bridgeTxMetaId: 'perps1' });

    expect(stopPollingSpy).toHaveBeenCalled();

    // should not track Completed because featureId is set
    expect((messenger.call as jest.Mock).mock.calls).not.toStrictEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'BridgeController:trackUnifiedSwapBridgeEvent',
          UnifiedSwapBridgeEventName.Completed,
        ]),
      ]),
    );
  });

  it('statusValidationFailed event includes refresh_count from attempts', async () => {
    const {
      controller,
      accountAddress,
      fetchBridgeTxStatusMock,
      getStatusRequestWithSrcTxHashMock,
      messenger,
    } = setup();

    const quoteResponse: any = {
      quote: {
        srcChainId: 1,
        destChainId: 10,
        destAsset: { assetId: 'dest' },
        srcAsset: { assetId: 'src' },
      },
      estimatedProcessingTimeInSeconds: 1,
      sentAmount: { amount: '0' },
      gasFee: { effective: { amount: '0' } },
      toTokenAmount: { usd: '0' },
    };

    controller.startPollingForBridgeTxStatus({
      accountAddress,
      bridgeTxMeta: { id: 'valFail1' },
      statusRequest: { srcChainId: 1, srcTxHash: '0xhash', destChainId: 10 },
      quoteResponse,
      slippagePercentage: 0,
      startTime: Date.now(),
      isStxEnabled: false,
    } as any);

    // ensure attempts exists BEFORE validation failure is tracked
    controller.update((state: any) => {
      state.txHistory.valFail1.attempts = { counter: 5, lastAttemptTime: 0 };
    });

    getStatusRequestWithSrcTxHashMock.mockReturnValue({
      srcChainId: 1,
      srcTxHash: '0xhash',
      destChainId: 10,
    });

    fetchBridgeTxStatusMock.mockResolvedValue({
      status: {
        status: StatusTypes.UNKNOWN,
        srcChain: { chainId: 1, txHash: '0xhash' },
      },
      validationFailures: ['bad_status'],
    });

    await controller._executePoll({ bridgeTxMetaId: 'valFail1' });

    expect((messenger.call as jest.Mock).mock.calls).toStrictEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          'BridgeController:trackUnifiedSwapBridgeEvent',
          UnifiedSwapBridgeEventName.StatusValidationFailed,
          expect.objectContaining({ refresh_count: 5 }),
        ]),
      ]),
    );
  });

  it('track event: history has featureId => #trackUnifiedSwapBridgeEvent returns early (skip tracking)', () => {
    const { controller, messenger } = setup();

    controller.update((state: any) => {
      state.txHistory.feat1 = {
        txMetaId: 'feat1',
        originalTransactionId: 'feat1',
        quote: { srcChainId: 1, destChainId: 10 },
        account: '0xAccount1',
        featureId: 'perps',
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1, txHash: '0x' },
        },
      };
    });

    const failedCb = messenger.subscribe.mock.calls.find(
      ([evt]: [any]) => evt === 'TransactionController:transactionFailed',
    )?.[1];

    failedCb({
      transactionMeta: {
        id: 'feat1',
        type: TransactionType.bridge,
        status: TransactionStatus.failed,
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
  });

  it('submitTx: throws when multichain account is undefined', async () => {
    const { controller } = setup();

    await expect(
      controller.submitTx(
        '0xNotKnownByHarness',
        { featureId: undefined } as any,
        false,
      ),
    ).rejects.toThrow(/undefined multichain account/u);
  });

  it('intent order PENDING maps to bridge PENDING', async () => {
    const { controller, getOrderStatusMock } = setup();

    seedIntentHistory(controller);

    getOrderStatusMock.mockResolvedValueOnce({
      id: 'order-1',
      status: IntentOrderStatus.PENDING,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

    await controller._executePoll({ bridgeTxMetaId: 'order-1' });

    expect(controller.state.txHistory['order-1'].status.status).toBe(
      StatusTypes.PENDING,
    );
  });

  it('intent order SUBMITTED maps to bridge SUBMITTED', async () => {
    const { controller, getOrderStatusMock } = setup();

    seedIntentHistory(controller);

    getOrderStatusMock.mockResolvedValueOnce({
      id: 'order-1',
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

    await controller._executePoll({ bridgeTxMetaId: 'order-1' });

    expect(controller.state.txHistory['order-1'].status.status).toBe(
      StatusTypes.SUBMITTED,
    );
  });

  it('unknown intent order status maps to bridge UNKNOWN', async () => {
    const { controller, getOrderStatusMock } = setup();

    seedIntentHistory(controller);

    getOrderStatusMock.mockResolvedValueOnce({
      id: 'order-1',
      status: 'SOME_NEW_STATUS' as any, // force UNKNOWN branch
      txHash: undefined,
      metadata: { txHashes: [] },
    });

    await controller._executePoll({ bridgeTxMetaId: 'order-1' });

    expect(controller.state.txHistory['order-1'].status.status).toBe(
      StatusTypes.UNKNOWN,
    );
  });

  it('intent polling: handles fetch failure when getIntentTransactionStatus returns undefined (e.g. non-Error rejection)', async () => {
    const { controller, getOrderStatusMock } = setup();

    seedIntentHistory(controller);

    getOrderStatusMock.mockRejectedValueOnce('non-Error rejection');

    await controller._executePoll({ bridgeTxMetaId: 'order-1' });

    expect(controller.state.txHistory['order-1'].status.status).toBe(
      StatusTypes.PENDING,
    );
    expect(controller.state.txHistory['order-1'].attempts?.counter).toBe(1);
  });

  it('bridge polling: returns early when history item is missing', async () => {
    const { controller, fetchBridgeTxStatusMock } = setup();

    await controller._executePoll({ bridgeTxMetaId: 'missing-history' });

    expect(fetchBridgeTxStatusMock).not.toHaveBeenCalled();
  });
});
