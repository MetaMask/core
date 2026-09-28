import type { TraceContext } from '@metamask/controller-utils';

import {
  buildLifecycleMocks,
  buildTransactionMeta,
  TRANSACTION_ID_MOCK,
} from '../../tests/LifecycleMocks.js';
import { updateFirstTimeInteraction } from '../utils/first-time-interaction.js';
import { startBackgroundUpdates } from './background.js';

jest.mock('../utils/first-time-interaction.js');

/**
 * Retrieve the first call arg to updateFirstTimeInteraction mock call.
 *
 * @returns The first argument of the first mock call, or undefined.
 */
function getFirstTimeInteractionArg():
  | Parameters<typeof updateFirstTimeInteraction>[0]
  | undefined {
  const { calls } = jest.mocked(updateFirstTimeInteraction).mock;
  return calls[0]?.[0];
}

describe('startBackgroundUpdates', () => {
  beforeEach(() => {
    jest.mocked(updateFirstTimeInteraction).mockResolvedValue(undefined);
  });

  describe('unapprovedTransactionAdded event', () => {
    it('always publishes the unapprovedTransactionAdded event', async () => {
      const { messengerPublish, request } = buildLifecycleMocks();

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:unapprovedTransactionAdded',
        request.transactionMeta,
      );
    });
  });

  describe('applyDelegationAddress', () => {
    it('writes the resolved delegation address to state when the promise resolves', async () => {
      const delegationAddress =
        '0xabcdef1234567890abcdef1234567890abcdef12' as `0x${string}`;
      const { getTransaction, request } = buildLifecycleMocks();
      request.delegationAddressPromise = Promise.resolve(delegationAddress);

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(getTransaction().delegationAddress).toBe(delegationAddress);
    });

    it('calls updateTransactionInternal with the correct transactionId and skip flags', async () => {
      const delegationAddress =
        '0xabcdef1234567890abcdef1234567890abcdef12' as `0x${string}`;
      const { request } = buildLifecycleMocks();
      request.delegationAddressPromise = Promise.resolve(delegationAddress);

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(
        request.dependencies.updateTransactionInternal,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: TRANSACTION_ID_MOCK,
          skipResimulateCheck: true,
          skipValidation: true,
        }),
        expect.any(Function),
      );
    });

    it('sets delegationAddress to undefined when the promise resolves with undefined', async () => {
      const { getTransaction, request } = buildLifecycleMocks();
      request.delegationAddressPromise = Promise.resolve(undefined);

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(getTransaction().delegationAddress).toBeUndefined();
    });

    it('silently ignores a rejected delegation address promise without throwing', async () => {
      const { messengerPublish, request } = buildLifecycleMocks();
      request.delegationAddressPromise = Promise.reject(
        new Error('delegation lookup failed'),
      );

      startBackgroundUpdates(request);
      // flush microtasks — rejection is caught by .catch(noop)
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The publish event still fires despite the delegation promise rejection
      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:unapprovedTransactionAdded',
        request.transactionMeta,
      );
    });
  });

  describe('requireApproval !== false (simulation & first-time interaction branch)', () => {
    it('calls updateSimulationData when requireApproval is true', async () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = true;

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(request.dependencies.updateSimulationData).toHaveBeenCalledWith(
        request.transactionMeta,
        expect.objectContaining({}),
      );
    });

    it('calls updateSimulationData when requireApproval is undefined (not set to false)', async () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = undefined;

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(request.dependencies.updateSimulationData).toHaveBeenCalled();
    });

    it('passes traceContext to updateSimulationData', async () => {
      const traceContext: TraceContext = {};
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = true;
      request.addTransactionRequest.options.traceContext = traceContext;

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(request.dependencies.updateSimulationData).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ traceContext }),
      );
    });

    it('calls updateFirstTimeInteraction with the current transactions from state', async () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = true;

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(updateFirstTimeInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionMeta: request.transactionMeta,
        }),
      );
      const callArg = getFirstTimeInteractionArg();
      expect(Array.isArray(callArg?.existingTransactions)).toBe(true);
    });

    it('uses a default isFirstTimeInteractionEnabled that returns true when not provided', async () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = true;
      request.constructorOptions.isFirstTimeInteractionEnabled = undefined;

      startBackgroundUpdates(request);
      await Promise.resolve();

      const callArg = getFirstTimeInteractionArg();
      expect(callArg?.isFirstTimeInteractionEnabled).toBeDefined();
      expect(callArg?.isFirstTimeInteractionEnabled()).toBe(true);
    });

    it('forwards the provided isFirstTimeInteractionEnabled function unchanged', async () => {
      const isFirstTimeInteractionEnabled = jest.fn().mockReturnValue(false);
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = true;
      request.constructorOptions.isFirstTimeInteractionEnabled =
        isFirstTimeInteractionEnabled;

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(updateFirstTimeInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ isFirstTimeInteractionEnabled }),
      );
    });

    // Note: when updateSimulationData rejects, background.ts re-throws in the
    // .catch() handler, which produces an unhandled rejection.  We cannot test
    // that path end-to-end without Jest treating the unhandled rejection as a
    // test failure.  The test below verifies only the synchronous portion:
    // the publish event is emitted regardless of later async outcomes.
    it('publishes the unapprovedTransactionAdded event synchronously before simulation resolves', () => {
      const { messengerPublish, request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = true;
      // updateSimulationData returns a promise that never settles in this test
      jest
        .mocked(request.dependencies.updateSimulationData)
        .mockReturnValue(new Promise(() => undefined));

      startBackgroundUpdates(request);

      // The publish is synchronous — visible immediately
      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:unapprovedTransactionAdded',
        request.transactionMeta,
      );
    });

    it('does not throw when updateFirstTimeInteraction rejects (silently swallowed)', async () => {
      const { messengerPublish, request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = true;
      jest
        .mocked(updateFirstTimeInteraction)
        .mockRejectedValue(new Error('first-time error'));

      startBackgroundUpdates(request);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Main publish still happened
      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:unapprovedTransactionAdded',
        request.transactionMeta,
      );
    });
  });

  describe('requireApproval === false (skip simulation & first-time interaction)', () => {
    it('does not call updateSimulationData when requireApproval is false', async () => {
      const { request } = buildLifecycleMocks();
      // fixture default: requireApproval is false

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(request.dependencies.updateSimulationData).not.toHaveBeenCalled();
    });

    it('does not call updateFirstTimeInteraction when requireApproval is false', async () => {
      const { request } = buildLifecycleMocks();

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(updateFirstTimeInteraction).not.toHaveBeenCalled();
    });
  });

  describe('isStateOnly branch', () => {
    it('does not call updateSimulationData when isStateOnly is true even if requireApproval is not false', async () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = true;
      request.addTransactionRequest.options.isStateOnly = true;

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(request.dependencies.updateSimulationData).not.toHaveBeenCalled();
    });

    it('does not call updateFirstTimeInteraction when isStateOnly is true', async () => {
      const { request } = buildLifecycleMocks();
      request.addTransactionRequest.options.requireApproval = true;
      request.addTransactionRequest.options.isStateOnly = true;

      startBackgroundUpdates(request);
      await Promise.resolve();

      expect(updateFirstTimeInteraction).not.toHaveBeenCalled();
    });
  });

  describe('getTransaction helper in first-time interaction', () => {
    it('provides a getTransaction helper that looks up from state by id', async () => {
      const existingMeta = buildTransactionMeta();
      const { request } = buildLifecycleMocks({
        transactionMeta: existingMeta,
      });
      request.addTransactionRequest.options.requireApproval = true;

      startBackgroundUpdates(request);
      await Promise.resolve();

      const callArg = getFirstTimeInteractionArg();
      expect(callArg?.getTransaction(TRANSACTION_ID_MOCK)).toMatchObject({
        id: TRANSACTION_ID_MOCK,
      });
    });
  });
});
