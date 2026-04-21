import { StatusTypes } from '@metamask/bridge-controller';
import type { Quote } from '@metamask/bridge-controller';

import type {
  BridgeStatusControllerState,
  BridgeHistoryItem,
  StatusResponse,
} from '../types';
import { getHistoryKey, rekeyHistoryItemInState } from './history';

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
});
