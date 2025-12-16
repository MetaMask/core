/* eslint-disable @typescript-eslint/no-explicit-any */

import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import { StatusTypes } from '@metamask/bridge-controller';
import { IntentOrderStatus } from './intent-order-status';

import { MAX_ATTEMPTS } from './constants';

type Tx = Pick<TransactionMeta, 'id' | 'status'> & {
  type?: TransactionType;
  chainId?: string;
  hash?: string;
  txReceipt?: any;
};

function minimalIntentQuoteResponse(
  accountAddress: string,
  overrides?: Partial<any>,
) {
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
}

function createMessengerHarness(accountAddress: string) {
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
}

function loadControllerWithMocks() {
  const submitIntentMock = jest.fn();
  const getOrderStatusMock = jest.fn();

  let BridgeStatusController: any;

  jest.resetModules();

  jest.isolateModules(() => {
    jest.doMock('./intent-api', () => ({
      IntentApiImpl: jest.fn().mockImplementation(() => ({
        submitIntent: submitIntentMock,
        getOrderStatus: getOrderStatusMock,
      })),
    }));

    jest.doMock('./utils/bridge-status', () => {
      const actual = jest.requireActual('./utils/bridge-status');
      return {
        ...actual,
        shouldSkipFetchDueToFetchFailures: jest.fn().mockReturnValue(false),
      };
    });

    jest.doMock('./utils/transaction', () => {
      const actual = jest.requireActual('./utils/transaction');
      return {
        ...actual,
        // IMPORTANT: controller calls generateActionId().toString()
        generateActionId: jest
          .fn()
          .mockReturnValue({ toString: () => 'action-id-1' }),

        handleApprovalDelay: jest.fn().mockResolvedValue(undefined),
        handleMobileHardwareWalletDelay: jest.fn().mockResolvedValue(undefined),

        // CRITICAL FIX:
        // submitIntent uses getStatusRequestParams(quoteResponse) inside the try/catch
        // If this throws, the intent:* history item is never added and tests fail.
        getStatusRequestParams: jest.fn().mockReturnValue({
          srcChainId: 1,
          // submitIntent will override srcTxHash after spreading
          srcTxHash: '',
        }),
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BridgeStatusController =
      require('./bridge-status-controller').BridgeStatusController;
  });

  return { BridgeStatusController, submitIntentMock, getOrderStatusMock };
}

function setup() {
  const accountAddress = '0xAccount1';
  const { messenger, transactions } = createMessengerHarness(accountAddress);

  const { BridgeStatusController, submitIntentMock, getOrderStatusMock } =
    loadControllerWithMocks();

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
        status: TransactionStatus.failed, // makes #waitForTxConfirmation throw quickly
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
    traceFn: (_req: any, fn?: any) => fn?.(),
  });

  const startPollingSpy = jest
    .spyOn(controller as any, 'startPolling')
    .mockReturnValue('poll-token-1');

  const stopPollingSpy = jest
    .spyOn(controller as any, 'stopPollingByPollingToken')
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
  };
}

describe('BridgeStatusController (intent swaps)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('submitIntent: creates TC tx, writes intent:* history item, starts polling, and continues if approval confirmation fails', async () => {
    const { controller, accountAddress, submitIntentMock, startPollingSpy } =
      setup();

    const orderUid = 'order-uid-1';

    submitIntentMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.SUBMITTED,
      txHash: undefined,
      metadata: { txHashes: [] },
    });

    const quoteResponse = minimalIntentQuoteResponse(accountAddress, {
      // Include approval to exercise “continue if approval confirmation fails”
      approval: {
        chainId: 1,
        from: accountAddress,
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        value: '0x0',
        gasLimit: 21000,
      },
    });

    const res = await controller.submitIntent({
      quoteResponse,
      signature: '0xsig',
      accountAddress,
    });

    const historyKey = `intent:${orderUid}`;

    expect(controller.state.txHistory[historyKey]).toBeDefined();
    expect(controller.state.txHistory[historyKey].originalTransactionId).toBe(
      res.id,
    );

    expect(startPollingSpy).toHaveBeenCalledWith({
      bridgeTxMetaId: historyKey,
    });
  });

  test('intent polling: updates history, merges tx hashes, updates TC tx, and stops polling on COMPLETED', async () => {
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

    const quoteResponse = minimalIntentQuoteResponse(accountAddress);

    await controller.submitIntent({
      quoteResponse,
      signature: '0xsig',
      accountAddress,
    });

    const historyKey = `intent:${orderUid}`;

    // Seed existing hashes via controller.update (state is frozen)
    (controller as any).update((s: any) => {
      s.txHistory[historyKey].srcTxHashes = ['0xold1'];
    });

    getOrderStatusMock.mockResolvedValue({
      id: orderUid,
      status: IntentOrderStatus.COMPLETED,
      txHash: '0xnewhash',
      metadata: { txHashes: ['0xold1', '0xnewhash'] },
    });

    await (controller as any)._executePoll({ bridgeTxMetaId: historyKey });

    const updated = controller.state.txHistory[historyKey];
    expect(updated.status.status).toBe(StatusTypes.COMPLETE);
    expect(updated.srcTxHashes).toEqual(
      expect.arrayContaining(['0xold1', '0xnewhash']),
    );

    expect(stopPollingSpy).toHaveBeenCalledWith('poll-token-1');
  });

  test('intent polling: stops polling when attempts reach MAX_ATTEMPTS', async () => {
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

    const quoteResponse = minimalIntentQuoteResponse(accountAddress);

    await controller.submitIntent({
      quoteResponse,
      signature: '0xsig',
      accountAddress,
    });

    const historyKey = `intent:${orderUid}`;

    // Prime attempts so next failure hits MAX_ATTEMPTS
    (controller as any).update((s: any) => {
      s.txHistory[historyKey].attempts = {
        counter: MAX_ATTEMPTS - 1,
        lastAttemptTime: 0,
      };
    });

    getOrderStatusMock.mockRejectedValue(new Error('boom'));

    await (controller as any)._executePoll({ bridgeTxMetaId: historyKey });

    expect(stopPollingSpy).toHaveBeenCalledWith('poll-token-1');
    expect(controller.state.txHistory[historyKey].attempts).toEqual(
      expect.objectContaining({ counter: MAX_ATTEMPTS }),
    );
  });
});
