import {
  ACTION_ID_MOCK,
  buildLifecycleMocks,
  buildTransactionMeta,
  TRANSACTION_ID_MOCK,
} from '../../tests/LifecycleMocks.js';
import { TransactionStatus } from '../types.js';
import { awaitApproval } from './approval.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRACE_CONTEXT_MOCK = { traceId: 'trace-1' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a lifecycle request with requireApproval disabled (the default fixture
 * setting) so that tests only opt-in to approval round-trips explicitly.
 *
 * @returns Handles returned by `buildLifecycleMocks`.
 */
function buildMocksNoApproval(): ReturnType<typeof buildLifecycleMocks> {
  return buildLifecycleMocks();
}

/**
 * Build a lifecycle request that will attempt a real approval round-trip via
 * the mock messenger.
 *
 * @returns Handles returned by `buildLifecycleMocks`.
 */
function buildMocksWithApproval(): ReturnType<typeof buildLifecycleMocks> {
  const mocks = buildLifecycleMocks();
  mocks.request.addTransactionRequest.options.requireApproval = true;
  return mocks;
}

// ---------------------------------------------------------------------------
// Tests – awaitApproval
// ---------------------------------------------------------------------------

describe('awaitApproval', () => {
  describe('isStateOnly transactions', () => {
    it('returns immediately without touching lifecycle state', async () => {
      const { request } = buildLifecycleMocks({
        transactionMeta: buildTransactionMeta({ isStateOnly: true }),
      });

      await awaitApproval(request);

      expect(request.lifecycle.finishedPromise).toBeUndefined();
      expect(request.lifecycle.onError).toBeUndefined();
    });
  });

  describe('when the transaction is already completed in state', () => {
    it('sets finishedPromise to a resolved promise with the completed meta', async () => {
      const completedMeta = buildTransactionMeta({
        status: TransactionStatus.submitted,
      });
      const { request } = buildLifecycleMocks({
        transactionMeta: completedMeta,
      });

      await awaitApproval(request);

      // finishedPromise should resolve with the completed metadata.
      expect(await request.lifecycle.finishedPromise).toMatchObject({
        id: TRANSACTION_ID_MOCK,
        status: TransactionStatus.submitted,
      });
    });

    it('returns early without setting onError', async () => {
      const completedMeta = buildTransactionMeta({
        status: TransactionStatus.confirmed,
      });
      const { request } = buildLifecycleMocks({
        transactionMeta: completedMeta,
      });

      await awaitApproval(request);

      expect(request.lifecycle.onError).toBeUndefined();
    });
  });

  describe('when the transaction is NOT in state yet (no meta)', () => {
    it('returns early without setting onError', async () => {
      const { request } = buildLifecycleMocks();
      // Override getState to return an empty transaction list so that
      // isTransactionCompleted returns { isCompleted: false, meta: undefined }.
      jest.mocked(request.dependencies.getState).mockReturnValue({
        batchTransactionCounts: {},
        lastFetchedBlockNumbers: {},
        methodData: {},
        submitHistory: [],
        transactionBatches: [],
        transactions: [],
      });

      await awaitApproval(request);

      expect(request.lifecycle.onError).toBeUndefined();
    });

    it('sets finishedPromise to a pending promise', async () => {
      const { request } = buildLifecycleMocks();
      jest.mocked(request.dependencies.getState).mockReturnValue({
        batchTransactionCounts: {},
        lastFetchedBlockNumbers: {},
        methodData: {},
        submitHistory: [],
        transactionBatches: [],
        transactions: [],
      });

      await awaitApproval(request);

      expect(request.lifecycle.finishedPromise).toBeInstanceOf(Promise);
    });
  });

  describe('requireApproval === false (default)', () => {
    it('sets onError without going through the approval messenger call', async () => {
      const { request, messengerCall } = buildMocksNoApproval();

      await awaitApproval(request);

      expect(request.lifecycle.onError).toBeInstanceOf(Function);
      expect(messengerCall).not.toHaveBeenCalled();
    });

    it('sets finishedPromise to a pending promise', async () => {
      const { request } = buildMocksNoApproval();

      await awaitApproval(request);

      expect(request.lifecycle.finishedPromise).toBeInstanceOf(Promise);
    });
  });

  describe('requireApproval === true – approval round-trip', () => {
    it('calls the approval messenger with the expected arguments', async () => {
      const { request, messengerCall, finishTransaction } =
        buildMocksWithApproval();

      messengerCall.mockResolvedValue({
        resultCallbacks: { error: jest.fn(), success: jest.fn() },
      });

      const approval = awaitApproval(request);
      finishTransaction();
      await approval;

      expect(messengerCall).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        expect.objectContaining({
          id: TRANSACTION_ID_MOCK,
          type: 'transaction',
          requestData: { txId: TRANSACTION_ID_MOCK },
          expectsResult: true,
        }),
        true,
      );
    });

    it('stores the resultCallbacks on lifecycle after approval', async () => {
      const resultCallbacks = { error: jest.fn(), success: jest.fn() };
      const { request, messengerCall, finishTransaction } =
        buildMocksWithApproval();

      messengerCall.mockResolvedValue({ resultCallbacks });

      const approval = awaitApproval(request);
      finishTransaction();
      await approval;

      expect(request.lifecycle.resultCallbacks).toBe(resultCallbacks);
    });

    it('uses the transaction origin as approval origin when present', async () => {
      const originMeta = buildTransactionMeta({ origin: 'https://dapp.io' });
      const { request, messengerCall, finishTransaction } = buildLifecycleMocks(
        { transactionMeta: originMeta },
      );
      request.addTransactionRequest.options.requireApproval = true;

      messengerCall.mockResolvedValue({
        resultCallbacks: { error: jest.fn(), success: jest.fn() },
      });

      const approval = awaitApproval(request);
      finishTransaction();
      await approval;

      expect(messengerCall).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        expect.objectContaining({ origin: 'https://dapp.io' }),
        true,
      );
    });

    it('falls back to ORIGIN_METAMASK when transaction has no origin', async () => {
      const { request, messengerCall, finishTransaction } =
        buildMocksWithApproval();

      messengerCall.mockResolvedValue({
        resultCallbacks: { error: jest.fn(), success: jest.fn() },
      });

      const approval = awaitApproval(request);
      finishTransaction();
      await approval;

      expect(messengerCall).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        expect.objectContaining({ origin: 'metamask' }),
        true,
      );
    });

    it('calls the trace function with the Await Approval name', async () => {
      const { request, messengerCall, finishTransaction } =
        buildMocksWithApproval();
      const traceSpy = jest.spyOn(request.constructorOptions, 'trace');

      messengerCall.mockResolvedValue({
        resultCallbacks: { error: jest.fn(), success: jest.fn() },
      });

      const approval = awaitApproval(request);
      finishTransaction();
      await approval;

      expect(traceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Await Approval' }),
        expect.any(Function),
      );
    });

    it('passes the traceContext option into the Await Approval trace', async () => {
      const { request, messengerCall, finishTransaction } =
        buildMocksWithApproval();
      request.addTransactionRequest.options.traceContext = TRACE_CONTEXT_MOCK;

      const traceSpy = jest.spyOn(request.constructorOptions, 'trace');

      messengerCall.mockResolvedValue({
        resultCallbacks: { error: jest.fn(), success: jest.fn() },
      });

      const approval = awaitApproval(request);
      finishTransaction();
      await approval;

      expect(traceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ parentContext: TRACE_CONTEXT_MOCK }),
        expect.any(Function),
      );
    });

    it('propagates messenger rejection to the caller', async () => {
      const { request, messengerCall, finishTransaction } =
        buildMocksWithApproval();
      const approvalError = new Error('User denied');

      messengerCall.mockRejectedValue(approvalError);

      const approval = awaitApproval(request);
      finishTransaction();

      expect(await approval.catch((caught: Error) => caught)).toBe(
        approvalError,
      );
    });
  });

  describe('applyApprovalData – approval value with txMeta', () => {
    it('calls updateTransaction with the txMeta returned by approval', async () => {
      const { request, messengerCall, finishTransaction } =
        buildMocksWithApproval();

      const approvedTxMeta = buildTransactionMeta({
        customNonceValue: '42',
      });

      messengerCall.mockResolvedValue({
        resultCallbacks: { error: jest.fn(), success: jest.fn() },
        value: { txMeta: approvedTxMeta },
      });

      const approval = awaitApproval(request);
      finishTransaction();
      await approval;

      expect(
        jest.mocked(request.dependencies.updateTransaction),
      ).toHaveBeenCalledWith(
        expect.objectContaining({ id: TRANSACTION_ID_MOCK }),
        'TransactionController#processApproval - Updated with approval data',
      );
    });

    it('does NOT call updateTransaction when approval value has no txMeta', async () => {
      const { request, messengerCall, finishTransaction } =
        buildMocksWithApproval();

      messengerCall.mockResolvedValue({
        resultCallbacks: { error: jest.fn(), success: jest.fn() },
        value: {},
      });

      const approval = awaitApproval(request);
      finishTransaction();
      await approval;

      expect(
        jest.mocked(request.dependencies.updateTransaction),
      ).not.toHaveBeenCalled();
    });

    it('does NOT call updateTransaction when approval value is undefined', async () => {
      const { request, messengerCall, finishTransaction } =
        buildMocksWithApproval();

      messengerCall.mockResolvedValue({
        resultCallbacks: { error: jest.fn(), success: jest.fn() },
        value: undefined,
      });

      const approval = awaitApproval(request);
      finishTransaction();
      await approval;

      expect(
        jest.mocked(request.dependencies.updateTransaction),
      ).not.toHaveBeenCalled();
    });
  });

  describe('finishedPromise – waitForTransactionFinished', () => {
    it('resolves the finishedPromise when the finished event is emitted', async () => {
      const { request, finishTransaction } = buildMocksNoApproval();

      await awaitApproval(request);

      const finishedMeta = buildTransactionMeta({
        status: TransactionStatus.submitted,
      });

      finishTransaction(finishedMeta);

      const resolvedMeta = await request.lifecycle.finishedPromise;

      expect(resolvedMeta).toMatchObject({
        status: TransactionStatus.submitted,
      });
    });
  });

  describe('onError callback – handleApprovalError integration', () => {
    it('sets onError which invokes handleApprovalError with the merged request', async () => {
      const { request, finishTransaction } = buildMocksNoApproval();

      await awaitApproval(request);
      finishTransaction();

      // onError is set; verify it is callable.
      expect(request.lifecycle.onError).toBeInstanceOf(Function);

      // Calling it with a non-reject error should delegate to failTransaction.
      const testError = new Error('Something went wrong');
      request.lifecycle.onError?.(testError);

      expect(
        jest.mocked(request.dependencies.failTransaction),
      ).toHaveBeenCalledWith(
        expect.objectContaining({ id: TRANSACTION_ID_MOCK }),
        testError,
        undefined,
      );
    });

    it('passes the actionId through onError when set on options', async () => {
      const { request, finishTransaction } = buildMocksNoApproval();
      request.addTransactionRequest.options.actionId = ACTION_ID_MOCK;

      await awaitApproval(request);
      finishTransaction();

      const testError = new Error('Fail with action');
      request.lifecycle.onError?.(testError);

      expect(
        jest.mocked(request.dependencies.failTransaction),
      ).toHaveBeenCalledWith(expect.anything(), testError, ACTION_ID_MOCK);
    });
  });
});
