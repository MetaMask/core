/* eslint-disable @typescript-eslint/no-explicit-any */
import { TransactionStatus } from '@metamask/transaction-controller';

import {
  rekeyHistoryItemInState,
  waitForTxConfirmation,
} from './bridge-status-controller-helpers';
import type { BridgeStatusControllerState } from '../types';

const makeState = (
  overrides?: Partial<BridgeStatusControllerState>,
): BridgeStatusControllerState =>
  ({
    txHistory: {},
    ...overrides,
  }) as BridgeStatusControllerState;

describe('bridge-status-controller helpers', () => {
  it('rekeyHistoryItemInState returns false when history item missing', () => {
    const state = makeState();
    const result = rekeyHistoryItemInState(state, 'missing', {
      id: 'tx1',
      hash: '0xhash',
    });
    expect(result).toBe(false);
  });

  it('rekeyHistoryItemInState rekeys and preserves srcTxHash', () => {
    const state = makeState({
      txHistory: {
        action1: {
          txMetaId: undefined,
          actionId: 'action1',
          originalTransactionId: undefined,
          quote: { srcChainId: 1, destChainId: 10 } as any,
          status: {
            status: TransactionStatus.submitted,
            srcChain: { chainId: 1, txHash: '0xold' },
          } as any,
          account: '0xaccount',
          estimatedProcessingTimeInSeconds: 1,
          slippagePercentage: 0,
          hasApprovalTx: false,
        },
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

  it('waitForTxConfirmation resolves when confirmed', async () => {
    const messenger = {
      call: jest.fn(() => ({
        transactions: [
          { id: 'tx1', status: TransactionStatus.confirmed } as any,
        ],
      })),
    } as any;

    const promise = waitForTxConfirmation(messenger, 'tx1', {
      timeoutMs: 10,
      pollMs: 1,
    });
    expect(await promise).toStrictEqual(expect.objectContaining({ id: 'tx1' }));
  });

  it('waitForTxConfirmation throws when rejected', async () => {
    const messenger = {
      call: jest.fn(() => ({
        transactions: [
          { id: 'tx1', status: TransactionStatus.rejected } as any,
        ],
      })),
    } as any;

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

  it('waitForTxConfirmation times out when status never changes', async () => {
    jest.useFakeTimers();
    const messenger = {
      call: jest.fn(() => ({
        transactions: [
          { id: 'tx1', status: TransactionStatus.submitted } as any,
        ],
      })),
    } as any;
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
