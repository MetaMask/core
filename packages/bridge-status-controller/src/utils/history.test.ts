import {
  BatchSellTransactionType,
  StatusTypes,
} from '@metamask/bridge-controller';
import type { Quote } from '@metamask/bridge-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import type {
  BridgeStatusControllerState,
  BridgeHistoryItem,
  StartPollingForBridgeTxStatusArgs,
  StatusResponse,
} from '../types.js';
import { Operation } from '../types.js';
import {
  getHistoryKey,
  getHistoryOverridesFromTxMeta,
  getInitialHistoryItem,
  getMatchingHistoryEntryForApprovalTxMeta,
  getMatchingHistoryEntryForTxMeta,
  lockHistoryItem,
  rekeyHistoryItemInState,
} from './history.js';

describe('History Utils', () => {
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
      const result = rekeyHistoryItemInState(state, 'missing', 'tx1', {
        txMetaId: 'tx1',
        status: {
          srcChain: {
            txHash: '0xhash',
          },
        },
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

      const result = rekeyHistoryItemInState(state, 'action1', 'tx1', {
        status: {
          srcChain: {
            txHash: '0xnew',
          },
        },
        txMetaId: 'tx1',
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

      const result = rekeyHistoryItemInState(state, 'action1', 'tx1', {
        txMetaId: 'tx1',
      });

      expect(result).toBe(true);
      expect(state.txHistory.tx1.status.srcChain.txHash).toBe('0xold');
    });

    it('keeps COMPLETE when rekeying with an unmapped TransactionStatus', () => {
      const state = makeState({
        txHistory: {
          action1: {
            txMetaId: undefined,
            actionId: 'action1',
            originalTransactionId: undefined,
            quote: { srcChainId: 1, destChainId: 10 } as Quote,
            status: {
              status: StatusTypes.COMPLETE,
              srcChain: { chainId: 1, txHash: '0xold' },
            } as StatusResponse,
            account: '0xaccount',
            estimatedProcessingTimeInSeconds: 1,
            slippagePercentage: 0,
            hasApprovalTx: false,
          } as BridgeHistoryItem,
        },
      });

      const result = rekeyHistoryItemInState(
        state,
        'action1',
        'tx1',
        getHistoryOverridesFromTxMeta(false, 1, {
          id: 'tx1',
          status: TransactionStatus.unapproved,
        }),
      );

      expect(result).toBe(true);
      expect(state.txHistory.tx1.status.status).toBe(StatusTypes.COMPLETE);
    });

    it('keeps FAILED when rekeying with an unmapped TransactionStatus', () => {
      const state = makeState({
        txHistory: {
          action1: {
            txMetaId: undefined,
            actionId: 'action1',
            originalTransactionId: undefined,
            quote: { srcChainId: 1, destChainId: 10 } as Quote,
            status: {
              status: StatusTypes.FAILED,
              srcChain: { chainId: 1, txHash: '0xold' },
            } as StatusResponse,
            account: '0xaccount',
            estimatedProcessingTimeInSeconds: 1,
            slippagePercentage: 0,
            hasApprovalTx: false,
          } as BridgeHistoryItem,
        },
      });

      const result = rekeyHistoryItemInState(
        state,
        'action1',
        'tx1',
        getHistoryOverridesFromTxMeta(false, 1, {
          id: 'tx1',
          status: TransactionStatus.signed,
        }),
      );

      expect(result).toBe(true);
      expect(state.txHistory.tx1.status.status).toBe(StatusTypes.FAILED);
    });

    it('merges next and depositTxMeta overrides', () => {
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
            },
            account: '0xaccount',
            estimatedProcessingTimeInSeconds: 1,
            slippagePercentage: 0,
            hasApprovalTx: false,
            depositTxMeta: { batchId: '0xoldBatch' },
            startTime: 1,
          },
        },
      });

      const result = rekeyHistoryItemInState(state, 'action1', 'tx1', {
        txMetaId: 'tx1',
        batchId: '0xnewBatch',
        orderId: 'order-uid-1',
        next: [],
        depositTxMeta: { id: 'deposit-1' },
      });

      expect(result).toBe(true);
      expect(state.txHistory.tx1.next).toStrictEqual([]);
      expect(state.txHistory.tx1.batchId).toBe('0xnewBatch');
      expect(state.txHistory.tx1.orderId).toBe('order-uid-1');
      expect(state.txHistory.tx1.depositTxMeta).toStrictEqual({
        batchId: '0xoldBatch',
        id: 'deposit-1',
      });
    });
  });

  describe('lockHistoryItem', () => {
    const depositAction = {
      operation: Operation.DEPOSIT,
      partialQuote: {
        estimatedProcessingTimeInSeconds: 15,
        trade: 'depositTrade',
      },
    };
    const swapAction = {
      operation: Operation.SWAP,
      partialQuote: { estimatedProcessingTimeInSeconds: 15, trade: 'swap' },
    };
    const makeState = (
      overrides?: Partial<BridgeHistoryItem>,
    ): BridgeStatusControllerState => ({
      quoteUpdateStatusStore: {},
      txHistory: {
        tx1: {
          quote: { srcChainId: 1, destChainId: 10 } as Quote,
          status: {
            status: StatusTypes.PENDING,
            srcChain: { chainId: 1 },
          },
          account: '0xaccount',
          estimatedProcessingTimeInSeconds: 1,
          slippagePercentage: 0,
          hasApprovalTx: false,
          startTime: 1,
          next: [depositAction, swapAction],
          ...overrides,
        },
      },
    });

    it('throws when dest token is unexpected', () => {
      expect(() =>
        lockHistoryItem(
          makeState({
            status: {
              status: StatusTypes.PENDING,
              srcChain: { chainId: 1 },
              isExpectedToken: false,
            },
          }),
          'tx1',
        ),
      ).toThrow(
        'Incorrect token received from bridge tx, skipping next action: tx1',
      );
    });

    it('throws when deposit already started', () => {
      expect(() =>
        lockHistoryItem(
          makeState({ depositTxMeta: { batchId: '0xbatch' } }),
          'tx1',
        ),
      ).toThrow('Deposit has already started, skipping');
    });

    it('throws when next is missing', () => {
      expect(() =>
        lockHistoryItem(makeState({ next: undefined }), 'tx1'),
      ).toThrow('Deposit has already started, skipping');
    });

    it('throws swap already started when next is missing after swap lock', () => {
      expect(() =>
        lockHistoryItem(
          makeState({ next: undefined, batchId: '0xswapBatch' }),
          'tx1',
        ),
      ).toThrow('Swap has already started, skipping');
    });

    it('locks a deposit, writes batchId, returns remaining next', () => {
      const state = makeState();
      const result = lockHistoryItem(state, 'tx1');

      expect(result.operation).toBe(Operation.DEPOSIT);
      expect(result.next).toStrictEqual([swapAction]);
      expect(result.quoteResponse).toStrictEqual({
        quote: state.txHistory.tx1.quote,
        ...depositAction.partialQuote,
      });
      expect(state.txHistory.tx1.depositTxMeta).toStrictEqual({
        batchId: result.batchId,
      });
    });

    it('locks a swap without writing depositTxMeta', () => {
      const state = makeState({ next: [swapAction] });
      const result = lockHistoryItem(state, 'tx1');

      expect(result.operation).toBe(Operation.SWAP);
      expect(result.next).toStrictEqual([]);
      expect(result.quoteResponse).toStrictEqual({
        quote: state.txHistory.tx1.quote,
        ...swapAction.partialQuote,
      });
      expect(state.txHistory.tx1.depositTxMeta).toBeUndefined();
    });
  });

  describe('getHistoryOverridesFromTxMeta', () => {
    it('maps known TransactionStatus values', () => {
      expect(
        getHistoryOverridesFromTxMeta(false, 1, {
          status: TransactionStatus.submitted,
        }).status.status,
      ).toBe(StatusTypes.PENDING);
      expect(
        getHistoryOverridesFromTxMeta(false, 1, {
          status: TransactionStatus.confirmed,
        }).status.status,
      ).toBe(StatusTypes.COMPLETE);
      expect(
        getHistoryOverridesFromTxMeta(false, 1, {
          status: TransactionStatus.failed,
        }).status.status,
      ).toBe(StatusTypes.FAILED);
    });

    it('omits status.status for TransactionStatus values not in the map', () => {
      for (const status of [
        TransactionStatus.unapproved,
        TransactionStatus.approved,
        TransactionStatus.signed,
        TransactionStatus.dropped,
        TransactionStatus.rejected,
        TransactionStatus.cancelled,
      ]) {
        expect(
          getHistoryOverridesFromTxMeta(false, 1, { status }).status.status,
        ).toBeUndefined();
      }
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
        'Cannot add tx to history: either actionId, bridgeTxMeta.id, or syntheticTransactionId must be provided',
      );
    });
  });

  describe('getInitialHistoryItem', () => {
    const baseArgs = {
      bridgeTxMeta: { id: 'tx1', hash: '0xhash' },
      quoteResponse: {
        ...{
          quote: { srcChainId: 1, destChainId: 10 },
          estimatedProcessingTimeInSeconds: 60,
        },
        ...{
          sentAmount: { amount: '1', usd: '2' },
          gasFee: { effective: { amount: '0.001', usd: '3' } },
          toTokenAmount: { amount: '1', usd: '4' },
        },
      },
      startTime: 1,
      slippagePercentage: 0,
      accountAddress: '0xaccount',
      isStxEnabled: false,
    } as unknown as StartPollingForBridgeTxStatusArgs;

    it('defaults isStxEnabled when omitted', () => {
      const { isStxEnabled: _ignored, ...argsWithoutStx } = baseArgs;
      const txHistoryItem = getInitialHistoryItem(argsWithoutStx);
      expect(txHistoryItem.isStxEnabled).toBe(false);
    });

    it('omits tokenSecurityTypeDestination when not provided', () => {
      const txHistoryItem = getInitialHistoryItem(baseArgs);
      expect(
        Object.prototype.hasOwnProperty.call(
          txHistoryItem,
          'tokenSecurityTypeDestination',
        ),
      ).toBe(false);
    });

    it('persists a non-null tokenSecurityTypeDestination', () => {
      const txHistoryItem = getInitialHistoryItem({
        ...baseArgs,
        tokenSecurityTypeDestination: 'Malicious',
      });
      expect(txHistoryItem.tokenSecurityTypeDestination).toBe('Malicious');
    });

    it('persists a null tokenSecurityTypeDestination', () => {
      const txHistoryItem = getInitialHistoryItem({
        ...baseArgs,
        tokenSecurityTypeDestination: null,
      });
      expect(txHistoryItem.tokenSecurityTypeDestination).toBeNull();
    });

    it('persists customSlippage when provided', () => {
      const txHistoryItem = getInitialHistoryItem({
        ...baseArgs,
        customSlippage: true,
      });
      expect(txHistoryItem.customSlippage).toBe(true);
    });

    it('persists inputPrimaryDenomination when provided', () => {
      const txHistoryItem = getInitialHistoryItem({
        ...baseArgs,
        inputPrimaryDenomination: 'fiat_value',
      });
      expect(txHistoryItem.inputPrimaryDenomination).toBe('fiat_value');
    });

    it('persists orderId when provided', () => {
      const txHistoryItem = getInitialHistoryItem({
        ...baseArgs,
        orderId: 'order-uid-1',
      });
      expect(txHistoryItem.orderId).toBe('order-uid-1');
    });

    it('defaults status to PENDING when txMeta status is unmapped', () => {
      const txHistoryItem = getInitialHistoryItem({
        ...baseArgs,
        bridgeTxMeta: {
          id: 'tx1',
          hash: '0xhash',
          status: TransactionStatus.unapproved,
        },
      });
      expect(txHistoryItem.status.status).toBe(StatusTypes.PENDING);
    });
  });

  describe('getMatchingHistoryEntryForTxMeta', () => {
    const batchId = '0xbatch1';
    const firstTradeData = '0xaaa';
    const siblingData = '0xbbb';

    const stxParent = {
      txMetaId: undefined,
      batchId,
      batchSellData: {
        transactions: [
          { type: BatchSellTransactionType.TRADE, data: firstTradeData },
          { type: BatchSellTransactionType.TRADE, data: siblingData },
        ],
      },
      quote: { srcChainId: 1, destChainId: 10 },
      status: {
        status: StatusTypes.PENDING,
        srcChain: { chainId: 1 },
      },
      account: '0xaccount',
      estimatedProcessingTimeInSeconds: 1,
      slippagePercentage: 0,
      hasApprovalTx: false,
      startTime: 1,
    } as unknown as BridgeHistoryItem;

    const makeTxMeta = (
      overrides: Partial<TransactionMeta> & {
        txParams?: TransactionMeta['txParams'];
      },
    ): TransactionMeta => ({
      id: 'tx-1',
      batchId,
      status: TransactionStatus.failed,
      type: TransactionType.swap,
      chainId: '0xa',
      time: 1,
      networkClientId: 'n',
      txParams: { from: '0xfrom', data: firstTradeData },
      ...overrides,
    });

    it('does not match STX pre-submit parent by batchId for the first trade', () => {
      const match = getMatchingHistoryEntryForTxMeta(
        { [batchId]: stxParent },
        makeTxMeta({ id: 'first' }),
      );
      expect(match).toMatchInlineSnapshot(`undefined`);
    });

    it('does not match STX pre-submit parent by batchId for a sibling trade', () => {
      const match = getMatchingHistoryEntryForTxMeta(
        { [batchId]: stxParent },
        makeTxMeta({
          id: 'sibling',
          txParams: { from: '0xfrom', data: siblingData },
        }),
      );
      expect(match).toBeUndefined();
    });

    it('matches STX history by txMeta.id after rekey', () => {
      const match = getMatchingHistoryEntryForTxMeta(
        {
          tx1: { ...stxParent, txMetaId: 'tx1' },
        },
        makeTxMeta({
          id: 'tx1',
          txParams: { from: '0xfrom', data: siblingData },
        }),
      );
      expect(match?.[0]).toBe('tx1');
    });

    it('does not match pre-submit history as the trade when the tx is an approval sharing actionId', () => {
      const actionId = 'pre-submit-action-id';
      const historyItem = {
        txMetaId: undefined,
        actionId,
        quote: { srcChainId: 1, destChainId: 10 },
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1 },
        },
        account: '0xaccount',
        estimatedProcessingTimeInSeconds: 1,
        slippagePercentage: 0,
        hasApprovalTx: true,
        startTime: 1,
      } as unknown as BridgeHistoryItem;

      const approvalTx = makeTxMeta({
        id: 'approval-tx-id',
        actionId,
        hash: '0xapproval',
        type: TransactionType.swapApproval,
        batchId: undefined,
      });

      expect(
        getMatchingHistoryEntryForTxMeta(
          { [actionId]: historyItem },
          approvalTx,
        ),
      ).toBeUndefined();
      expect(
        getMatchingHistoryEntryForApprovalTxMeta(
          { [actionId]: historyItem },
          approvalTx,
        )?.[0],
      ).toBe(actionId);
    });

    it('still matches pre-submit history as the trade when the tx shares actionId', () => {
      const actionId = 'pre-submit-action-id';
      const historyItem = {
        txMetaId: undefined,
        actionId,
        quote: { srcChainId: 1, destChainId: 10 },
        status: {
          status: StatusTypes.PENDING,
          srcChain: { chainId: 1 },
        },
        account: '0xaccount',
        estimatedProcessingTimeInSeconds: 1,
        slippagePercentage: 0,
        hasApprovalTx: false,
        startTime: 1,
      } as unknown as BridgeHistoryItem;

      const match = getMatchingHistoryEntryForTxMeta(
        { [actionId]: historyItem },
        makeTxMeta({
          id: 'trade-tx-id',
          actionId,
          type: TransactionType.swap,
          batchId: undefined,
        }),
      );

      expect(match?.[0]).toBe(actionId);
    });

    it('matches 7702 batch-sell parent by batchId', () => {
      const match = getMatchingHistoryEntryForTxMeta(
        { [batchId]: stxParent },
        makeTxMeta({
          id: '7702-batch',
          type: TransactionType.batch,
          txParams: { from: '0xfrom', data: '0xother' },
        }),
      );
      expect(match?.[0]).toBe(batchId);
    });
  });
});
