import {
  buildLifecycleMocks,
  buildTransactionMeta,
  NETWORK_CLIENT_ID_MOCK,
  TRANSACTION_HASH_MOCK,
  TRANSACTION_ID_MOCK,
} from '../../tests/LifecycleMocks.js';
import { TransactionStatus, TransactionType } from '../types.js';
import { rpcRequest } from '../utils/provider.js';
import { submitTransaction } from './submit.js';

jest.mock('../utils/provider.js');

/**
 * Return a lifecycle execution object pre-populated with the given networkClientId.
 *
 * @param networkClientId - The network client ID to set on the execution.
 * @param releaseNonce - Optional nonce-release callback.
 * @returns The execution object.
 */
function buildExecution(
  networkClientId = NETWORK_CLIENT_ID_MOCK,
  releaseNonce?: jest.Mock,
): {
  networkClientId: string;
  releaseNonce?: jest.Mock;
} {
  return { networkClientId, releaseNonce };
}

describe('submitTransaction', () => {
  beforeEach(() => {
    jest.mocked(rpcRequest).mockResolvedValue('0xabc');
  });

  // ---------------------------------------------------------------------------
  // State-only path
  // ---------------------------------------------------------------------------

  describe('state-only transaction', () => {
    it('marks the transaction as submitted in state', async () => {
      const { request, getTransaction } = buildLifecycleMocks({
        transactionMeta: buildTransactionMeta({ isStateOnly: true }),
      });

      await submitTransaction(request);

      expect(getTransaction().status).toBe(TransactionStatus.submitted);
    });

    it('sets submittedTime on the transaction', async () => {
      const before = Date.now();
      const { request, getTransaction } = buildLifecycleMocks({
        transactionMeta: buildTransactionMeta({ isStateOnly: true }),
      });

      await submitTransaction(request);

      expect(getTransaction().submittedTime).toBeGreaterThanOrEqual(before);
    });

    it('returns without publishing to the network', async () => {
      const { request, messengerPublish } = buildLifecycleMocks({
        transactionMeta: buildTransactionMeta({ isStateOnly: true }),
      });

      await submitTransaction(request);

      expect(messengerPublish).not.toHaveBeenCalledWith(
        'TransactionController:transactionSubmitted',
        expect.anything(),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Early exit: no execution set
  // ---------------------------------------------------------------------------

  describe('missing execution', () => {
    it('returns early when lifecycle.execution is not set', async () => {
      const { request, messengerPublish } = buildLifecycleMocks();
      // isStateOnly is false and lifecycle.execution is absent.
      request.lifecycle = {};

      await submitTransaction(request);

      expect(messengerPublish).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // beforePublish hook returning false
  // ---------------------------------------------------------------------------

  describe('beforePublish hook returns false', () => {
    it('publishes transactionPublishingSkipped event', async () => {
      const { request, messengerPublish, releaseNonce } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      jest
        .spyOn(request.constructorOptions.hooks, 'beforePublish')
        .mockResolvedValue(false);

      await submitTransaction(request);

      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:transactionPublishingSkipped',
        request.transactionMeta,
      );
    });

    it('does not publish the transaction to the network', async () => {
      const { request, releaseNonce } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      jest
        .spyOn(request.constructorOptions.hooks, 'beforePublish')
        .mockResolvedValue(false);

      await submitTransaction(request);

      expect(
        jest.mocked(request.dependencies.publishTransaction),
      ).not.toHaveBeenCalled();
    });

    it('calls resultCallbacks.success when beforePublish returns false', async () => {
      const { request, releaseNonce } = buildLifecycleMocks();
      const successCallback = jest.fn();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.lifecycle.resultCallbacks = {
        error: jest.fn(),
        success: successCallback,
      };
      request.transactionMeta.rawTx = '0xsigned';

      jest
        .spyOn(request.constructorOptions.hooks, 'beforePublish')
        .mockResolvedValue(false);

      await submitTransaction(request);

      expect(successCallback).toHaveBeenCalledTimes(1);
    });

    it('releases execution when beforePublish returns false', async () => {
      const releaseNonce = jest.fn();
      const { request } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      jest
        .spyOn(request.constructorOptions.hooks, 'beforePublish')
        .mockResolvedValue(false);

      await submitTransaction(request);

      // releaseTransactionExecution deletes lifecycle.execution.
      expect(request.lifecycle.execution).toBeUndefined();
    });

    it('uses a permissive beforePublish when hooks.beforePublish is not set', async () => {
      const { request, messengerPublish, releaseNonce } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';
      request.constructorOptions.hooks = {
        ...request.constructorOptions.hooks,
        beforePublish: undefined,
      };

      await submitTransaction(request);

      // Permissive hook returns true -> should NOT skip publishing.
      expect(messengerPublish).not.toHaveBeenCalledWith(
        'TransactionController:transactionPublishingSkipped',
        expect.anything(),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Guard: no rawTx and not externalSign
  // ---------------------------------------------------------------------------

  describe('missing rawTx guard', () => {
    it('returns early without publishing when rawTx is absent and not externalSign', async () => {
      const { request, messengerPublish, releaseNonce } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      // Ensure rawTx is absent.
      delete (request.transactionMeta as Record<string, unknown>).rawTx;
      request.transactionMeta.isExternalSign = false;

      await submitTransaction(request);

      expect(messengerPublish).not.toHaveBeenCalledWith(
        'TransactionController:transactionSubmitted',
        expect.anything(),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Normal publish path
  // ---------------------------------------------------------------------------

  describe('normal publish', () => {
    it('calls the constructor publish hook with the transaction meta and rawTx', async () => {
      const { request, releaseNonce } = buildLifecycleMocks();
      // hooks.publish is always set by the fixture; cast through jest.Mock to avoid
      // non-null assertion (no-non-null-assertion lint rule).
      const publishHook = jest.mocked(
        request.constructorOptions.hooks.publish as jest.Mock,
      );
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      await submitTransaction(request);

      expect(publishHook).toHaveBeenCalledWith(
        expect.objectContaining({ id: TRANSACTION_ID_MOCK }),
        '0xsigned',
      );
    });

    it('prefers the per-transaction publishHook option over the constructor hook', async () => {
      const { request, releaseNonce } = buildLifecycleMocks();
      const perTxHook = jest
        .fn()
        .mockResolvedValue({ transactionHash: '0xper-tx' });
      const constructorPublishHook = jest.mocked(
        request.constructorOptions.hooks.publish as jest.Mock,
      );
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';
      request.addTransactionRequest.options.publishHook = perTxHook;

      await submitTransaction(request);

      expect(perTxHook).toHaveBeenCalledTimes(1);
      expect(constructorPublishHook).not.toHaveBeenCalled();
    });

    it('falls back to publishTransaction when no publish hook is configured', async () => {
      const { request, releaseNonce } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';
      // Remove both hook options.
      request.constructorOptions.hooks = {};
      request.addTransactionRequest.options.publishHook = undefined;

      jest
        .mocked(request.dependencies.publishTransaction)
        .mockResolvedValue('0xfallback');

      // constructor publish hook returns undefined -> falls back to publishTransaction.
      await submitTransaction(request);

      expect(
        jest.mocked(request.dependencies.publishTransaction),
      ).toHaveBeenCalledWith(
        expect.objectContaining({ networkClientId: NETWORK_CLIENT_ID_MOCK }),
      );
    });

    it('publishes transactionSubmitted event with the submitted metadata', async () => {
      const { request, messengerPublish, releaseNonce } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      await submitTransaction(request);

      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:transactionSubmitted',
        expect.objectContaining({ transactionMeta: request.transactionMeta }),
      );
      // The submitted transactionMeta should have hash and submitted status.
      expect(request.transactionMeta.hash).toBe(TRANSACTION_HASH_MOCK);
      expect(request.transactionMeta.status).toBe(TransactionStatus.submitted);
    });

    it('publishes transactionFinished event with the submitted metadata', async () => {
      const { request, messengerPublish, releaseNonce } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      await submitTransaction(request);

      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:transactionFinished',
        expect.objectContaining({
          hash: TRANSACTION_HASH_MOCK,
          status: TransactionStatus.submitted,
        }),
      );
    });

    it('publishes transactionApproved event after submit', async () => {
      const { request, messengerPublish, releaseNonce } = buildLifecycleMocks();
      request.addTransactionRequest.options.actionId = 'action-123';
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      await submitTransaction(request);

      expect(messengerPublish).toHaveBeenCalledWith(
        'TransactionController:transactionApproved',
        expect.objectContaining({ actionId: 'action-123' }),
      );
    });

    it('writes hash and status to state via updateTransactionInternal', async () => {
      const { request, getTransaction, releaseNonce } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      await submitTransaction(request);

      const tx = getTransaction();
      expect(tx.hash).toBe(TRANSACTION_HASH_MOCK);
      expect(tx.status).toBe(TransactionStatus.submitted);
      expect(tx.submittedTime).toBeDefined();
    });

    it('releases the execution (deletes lifecycle.execution) after successful publish', async () => {
      const releaseNonce = jest.fn();
      const { request } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      await submitTransaction(request);

      expect(request.lifecycle.execution).toBeUndefined();
    });

    it('calls releaseNonce before publishing', async () => {
      const releaseNonce = jest.fn();
      const publishOrder: string[] = [];

      const { request } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      releaseNonce.mockImplementation(() => publishOrder.push('release'));
      jest
        .mocked(request.constructorOptions.hooks.publish as jest.Mock)
        .mockImplementation(async () => {
          publishOrder.push('publish');
          return { transactionHash: TRANSACTION_HASH_MOCK };
        });

      await submitTransaction(request);

      expect(publishOrder.indexOf('release')).toBeLessThan(
        publishOrder.indexOf('publish'),
      );
    });

    it('emits the finished internal event after publishing', async () => {
      const { request, releaseNonce } = buildLifecycleMocks();
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      request.transactionMeta.rawTx = '0xsigned';

      const finishedHandler = jest.fn();
      request.dependencies.internalEvents.on(
        `${TRANSACTION_ID_MOCK}:finished`,
        finishedHandler,
      );

      await submitTransaction(request);

      expect(finishedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ status: TransactionStatus.submitted }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // External sign path
  // ---------------------------------------------------------------------------

  describe('external sign', () => {
    it('passes 0x as signedTx when isExternalSign is true', async () => {
      const { request, releaseNonce } = buildLifecycleMocks({
        transactionMeta: buildTransactionMeta({ isExternalSign: true }),
      });
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );
      // rawTx should be ignored for external sign.
      request.transactionMeta.rawTx = '0xshould-be-ignored';

      const publishHook = jest.mocked(
        request.constructorOptions.hooks.publish as jest.Mock,
      );

      await submitTransaction(request);

      expect(publishHook).toHaveBeenCalledWith(expect.anything(), '0x');
    });
  });

  // ---------------------------------------------------------------------------
  // Swap pre-transaction balance
  // ---------------------------------------------------------------------------

  describe('swap pre-transaction balance', () => {
    it('fetches pre-transaction balance for swap transactions', async () => {
      const swapMeta = buildTransactionMeta({
        rawTx: '0xsigned',
        type: TransactionType.swap,
      });
      const { request, releaseNonce, getTransaction } = buildLifecycleMocks({
        transactionMeta: swapMeta,
      });
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );

      jest.mocked(rpcRequest).mockResolvedValue('0xbalance');

      await submitTransaction(request);

      expect(jest.mocked(rpcRequest)).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'eth_getBalance',
          networkClientId: NETWORK_CLIENT_ID_MOCK,
        }),
      );

      expect(getTransaction().preTxBalance).toBe('0xbalance');
    });

    it('does not fetch pre-transaction balance for non-swap transactions', async () => {
      const { request, releaseNonce } = buildLifecycleMocks({
        transactionMeta: buildTransactionMeta({
          rawTx: '0xsigned',
          type: TransactionType.simpleSend,
        }),
      });
      request.lifecycle.execution = buildExecution(
        NETWORK_CLIENT_ID_MOCK,
        releaseNonce,
      );

      await submitTransaction(request);

      expect(jest.mocked(rpcRequest)).not.toHaveBeenCalled();
    });
  });
});
