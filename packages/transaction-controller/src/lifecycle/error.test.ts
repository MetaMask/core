import { errorCodes } from '@metamask/rpc-errors';
import type { Json } from '@metamask/utils';

import {
  buildLifecycleMocks,
  buildTransactionMeta,
  ACTION_ID_MOCK,
  TRANSACTION_ID_MOCK,
} from '../../tests/LifecycleMocks.js';
import type { TransactionMeta } from '../types.js';
import { TransactionStatus } from '../types.js';
import { ErrorCode } from '../utils/validation.js';
import {
  handleApprovalError,
  handleTransactionError,
  rejectTransaction,
} from './error.js';
import { releaseTransactionExecution } from './state.js';

jest.mock('./state.js', () => ({
  releaseTransactionExecution: jest.fn(),
}));

// ---------------------------------------------------------------------------
// rejectTransaction
// ---------------------------------------------------------------------------

describe('rejectTransaction', () => {
  it('does nothing when the transaction is not found in state', () => {
    const { messengerPublish, request } = buildLifecycleMocks();

    rejectTransaction(request, 'unknown-id');

    expect(messengerPublish).not.toHaveBeenCalled();
  });

  it('publishes transactionFinished with rejected status', () => {
    const { messengerPublish, request } = buildLifecycleMocks();

    rejectTransaction(request, TRANSACTION_ID_MOCK);

    expect(messengerPublish).toHaveBeenCalledWith(
      'TransactionController:transactionFinished',
      expect.objectContaining({ status: TransactionStatus.rejected }),
    );
  });

  it('emits the finished internal event with the rejected metadata', () => {
    const listener = jest.fn();
    const { request } = buildLifecycleMocks();
    request.dependencies.internalEvents.on(
      `${TRANSACTION_ID_MOCK}:finished`,
      listener,
    );

    rejectTransaction(request, TRANSACTION_ID_MOCK);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ status: TransactionStatus.rejected }),
    );
  });

  it('publishes transactionRejected with actionId', () => {
    const { messengerPublish, request } = buildLifecycleMocks();

    rejectTransaction(request, TRANSACTION_ID_MOCK, ACTION_ID_MOCK);

    expect(messengerPublish).toHaveBeenCalledWith(
      'TransactionController:transactionRejected',
      expect.objectContaining({ actionId: ACTION_ID_MOCK }),
    );
  });

  it('publishes transactionRejected with undefined actionId when not provided', () => {
    const { messengerPublish, request } = buildLifecycleMocks();

    rejectTransaction(request, TRANSACTION_ID_MOCK);

    expect(messengerPublish).toHaveBeenCalledWith(
      'TransactionController:transactionRejected',
      expect.objectContaining({ actionId: undefined }),
    );
  });

  it('publishes transactionStatusUpdated with the rejected transactionMeta', () => {
    let rejectedMeta: TransactionMeta | undefined;
    const { messengerPublish, request } = buildLifecycleMocks();
    // Capture the rejected metadata via the internal event (emitted during rejection)
    request.dependencies.internalEvents.on(
      `${TRANSACTION_ID_MOCK}:finished`,
      (meta: TransactionMeta) => {
        rejectedMeta = meta;
      },
    );

    rejectTransaction(request, TRANSACTION_ID_MOCK);

    expect(rejectedMeta?.status).toBe(TransactionStatus.rejected);
    expect(messengerPublish).toHaveBeenCalledWith(
      'TransactionController:transactionStatusUpdated',
      expect.objectContaining({ transactionMeta: rejectedMeta }),
    );
  });

  it('calls deleteTransaction (updateState) to remove the transaction from state', () => {
    const { request } = buildLifecycleMocks();

    rejectTransaction(request, TRANSACTION_ID_MOCK);

    expect(request.dependencies.updateState).toHaveBeenCalled();
  });

  it('includes a non-empty error message when no error argument is provided', () => {
    let finishedMeta: TransactionMeta | undefined;
    const { request } = buildLifecycleMocks();
    request.dependencies.internalEvents.on(
      `${TRANSACTION_ID_MOCK}:finished`,
      (meta: TransactionMeta) => {
        finishedMeta = meta;
      },
    );

    rejectTransaction(request, TRANSACTION_ID_MOCK);

    expect(typeof finishedMeta?.error?.message).toBe('string');
  });

  it('uses the provided error message when given', () => {
    let finishedMeta: TransactionMeta | undefined;
    const customError = new Error('custom rejection reason');
    const { request } = buildLifecycleMocks();
    request.dependencies.internalEvents.on(
      `${TRANSACTION_ID_MOCK}:finished`,
      (meta: TransactionMeta) => {
        finishedMeta = meta;
      },
    );

    rejectTransaction(request, TRANSACTION_ID_MOCK, undefined, customError);

    expect(finishedMeta?.error?.message).toBe('custom rejection reason');
  });
});

// ---------------------------------------------------------------------------
// handleApprovalError
// ---------------------------------------------------------------------------

describe('handleApprovalError', () => {
  describe('transaction already completed', () => {
    it('does nothing when the transaction is in a completed state', () => {
      const transactionMeta = buildTransactionMeta({
        status: TransactionStatus.submitted,
      });
      const { request } = buildLifecycleMocks({ transactionMeta });

      const error = new Error('some error');
      handleApprovalError(request, error);

      expect(request.dependencies.failTransaction).not.toHaveBeenCalled();
    });
  });

  describe('non-rejection error', () => {
    it('calls failTransaction with the transactionMeta and error', () => {
      const { request } = buildLifecycleMocks();
      const error = new Error('unexpected failure');

      handleApprovalError(request, error);

      expect(request.dependencies.failTransaction).toHaveBeenCalledWith(
        request.transactionMeta,
        error,
        undefined, // actionId not set
      );
    });

    it('passes actionId from options to failTransaction', () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.actionId = ACTION_ID_MOCK;
      const error = new Error('unexpected failure');

      handleApprovalError(request, error);

      expect(request.dependencies.failTransaction).toHaveBeenCalledWith(
        request.transactionMeta,
        error,
        ACTION_ID_MOCK,
      );
    });

    it('does not throw for a non-rejection error', () => {
      const { request } = buildLifecycleMocks();
      const error = new Error('some error');

      expect(() => handleApprovalError(request, error)).not.toThrow();
    });
  });

  describe('userRejectedRequest error', () => {
    it('rejects and rethrows with a MetaMask-formatted message', () => {
      const { request } = buildLifecycleMocks();
      const error = Object.assign(new Error('user rejected'), {
        code: errorCodes.provider.userRejectedRequest,
      });

      expect(() => handleApprovalError(request, error)).toThrow(
        'MetaMask Tx Signature: User denied transaction signature.',
      );
    });

    it('publishes transactionRejected when the error is a userRejectedRequest', () => {
      const { messengerPublish, request } = buildLifecycleMocks();
      const error = Object.assign(new Error('user rejected'), {
        code: errorCodes.provider.userRejectedRequest,
      });

      try {
        handleApprovalError(request, error);
      } catch {
        // expected — the error is rethrown by handleApprovalError
      }

      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:transactionRejected',
        expect.anything(),
      );
    });

    it('preserves data on the rethrown providerError', () => {
      const { request } = buildLifecycleMocks();
      const extraData: Json = { extra: 'info' };
      const error = Object.assign(new Error('user rejected'), {
        code: errorCodes.provider.userRejectedRequest,
        data: extraData,
      });

      let caught: unknown;
      try {
        handleApprovalError(request, error);
      } catch (thrownError) {
        caught = thrownError;
      }

      const caughtWithData = caught as { data?: Json };
      expect(caughtWithData.data).toStrictEqual({ extra: 'info' });
    });
  });

  describe('RejectedUpgrade error', () => {
    it('rejects and rethrows the original error for RejectedUpgrade code', () => {
      const { request } = buildLifecycleMocks();
      const error = Object.assign(new Error('upgrade rejected'), {
        code: ErrorCode.RejectedUpgrade,
      });

      expect(() => handleApprovalError(request, error)).toThrow(
        'upgrade rejected',
      );
    });

    it('calls rejectTransaction (publishes events) for a RejectedUpgrade error', () => {
      const { messengerPublish, request } = buildLifecycleMocks();
      const error = Object.assign(new Error('upgrade rejected'), {
        code: ErrorCode.RejectedUpgrade,
      });

      try {
        handleApprovalError(request, error);
      } catch {
        // expected — the error is rethrown by handleApprovalError
      }

      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:transactionFinished',
        expect.objectContaining({ status: TransactionStatus.rejected }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// handleTransactionError
// ---------------------------------------------------------------------------

describe('handleTransactionError', () => {
  describe('no execution context, no onError handler', () => {
    it('rethrows the error when there is no lifecycle.execution and no onError', () => {
      const { request } = buildLifecycleMocks();
      // lifecycle is {} — no execution, no onError
      const error = new Error('fatal error');

      expect(() => handleTransactionError(request, error)).toThrow(
        'fatal error',
      );
    });
  });

  describe('no execution context, with onError handler', () => {
    it('calls onError instead of throwing when there is no lifecycle.execution', () => {
      const mocks = buildLifecycleMocksWithOnError();
      const error = new Error('handled error');

      handleTransactionError(mocks.request, error);

      expect(mocks.onError).toHaveBeenCalledWith(error);
    });

    it('does not rethrow when onError is provided', () => {
      const mocks = buildLifecycleMocksWithOnError();

      expect(() =>
        handleTransactionError(mocks.request, new Error('x')),
      ).not.toThrow();
    });
  });

  describe('with execution context: failTransaction succeeds', () => {
    it('calls failTransaction with the current transactionMeta and error', () => {
      const { request } = buildLifecycleMocks();
      request.lifecycle.execution = { networkClientId: 'mainnet' };
      const error = new Error('execution error');

      handleTransactionError(request, error);

      expect(request.dependencies.failTransaction).toHaveBeenCalledWith(
        request.transactionMeta,
        error,
      );
    });

    it('does not call releaseTransactionExecution when failTransaction succeeds', () => {
      const { request } = buildLifecycleMocks();
      request.lifecycle.execution = { networkClientId: 'mainnet' };

      handleTransactionError(request, new Error('exec error'));

      expect(releaseTransactionExecution).not.toHaveBeenCalled();
    });
  });

  describe('with execution context: failTransaction throws', () => {
    it('calls releaseTransactionExecution when failTransaction itself throws', () => {
      const { request } = buildLifecycleMocks();
      request.lifecycle.execution = { networkClientId: 'mainnet' };
      const secondaryError = new Error('fail-in-fail');
      jest
        .mocked(request.dependencies.failTransaction)
        .mockImplementation(() => {
          throw secondaryError;
        });

      handleTransactionError(request, new Error('original'));

      expect(releaseTransactionExecution).toHaveBeenCalledWith(
        request.lifecycle,
      );
    });

    it('calls onError with the failure from failTransaction when onError is set', () => {
      const mocks = buildLifecycleMocksWithOnError();
      mocks.request.lifecycle.execution = { networkClientId: 'mainnet' };
      const secondaryError = new Error('fail-in-fail');
      jest
        .mocked(mocks.request.dependencies.failTransaction)
        .mockImplementation(() => {
          throw secondaryError;
        });

      handleTransactionError(mocks.request, new Error('original'));

      expect(mocks.onError).toHaveBeenCalledWith(secondaryError);
    });

    it('does not throw when it is not set and failTransaction throws', () => {
      const { request } = buildLifecycleMocks();
      request.lifecycle.execution = { networkClientId: 'mainnet' };
      jest
        .mocked(request.dependencies.failTransaction)
        .mockImplementation(() => {
          throw new Error('fail-in-fail');
        });

      // Should not throw — onError is optional and guarded by ?.
      expect(() =>
        handleTransactionError(request, new Error('original')),
      ).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * Build lifecycle mocks with an `onError` handler already installed on the
 * lifecycle object so tests do not need to mutate the property directly (which
 * trips the prefer-spy-on lint rule).
 *
 * @returns The mocks with lifecycle.onError pre-set to a jest.fn().
 */
function buildLifecycleMocksWithOnError(): ReturnType<
  typeof buildLifecycleMocks
> & { onError: jest.Mock } {
  const mocks = buildLifecycleMocks();
  const onError = jest.fn();
  mocks.request.lifecycle = { ...mocks.request.lifecycle, onError };
  return { ...mocks, onError };
}
