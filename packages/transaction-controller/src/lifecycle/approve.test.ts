import {
  buildLifecycleMocks,
  buildTransactionMeta,
  CHAIN_ID_MOCK,
  FROM_MOCK,
  NETWORK_CLIENT_ID_MOCK,
  NONCE_MOCK,
  TO_MOCK,
  TRANSACTION_ID_MOCK,
} from '../../tests/LifecycleMocks.js';
import type { LifecycleMocks } from '../../tests/LifecycleMocks.js';
import { TransactionEnvelopeType, TransactionStatus } from '../types.js';
import { approveTransaction } from './approve.js';
import { isTransactionApproving, startTransactionApproval } from './state.js';

jest.mock('./state.js', () => ({
  isTransactionApproving: jest.fn().mockReturnValue(false),
  startTransactionApproval: jest.fn().mockReturnValue(jest.fn()),
}));

describe('approveTransaction', () => {
  beforeEach(() => {
    jest.mocked(isTransactionApproving).mockReturnValue(false);
    jest.mocked(startTransactionApproval).mockReturnValue(jest.fn());
  });

  describe('early-exit: no onError handler', () => {
    it('returns immediately when lifecycle.onError is not set', async () => {
      const { request } = buildLifecycleMocks();
      // onError intentionally absent (lifecycle is {})

      await approveTransaction(request);

      expect(isTransactionApproving).not.toHaveBeenCalled();
      expect(request.dependencies.getNonceLock).not.toHaveBeenCalled();
    });
  });

  describe('early-exit: transaction already completed', () => {
    it('returns immediately when the transaction is in a completed state', async () => {
      const transactionMeta = buildTransactionMeta({
        status: TransactionStatus.submitted,
      });
      const mocks = buildLifecycleMocksWithOnError({ transactionMeta });

      await approveTransaction(mocks.request);

      expect(mocks.request.dependencies.getNonceLock).not.toHaveBeenCalled();
    });
  });

  describe('early-exit: approval already in progress', () => {
    it('skips approval and removes execution context when another invocation is approving', async () => {
      const mocks = buildLifecycleMocksWithOnError();
      jest.mocked(isTransactionApproving).mockReturnValue(true);

      await approveTransaction(mocks.request);

      expect(mocks.request.dependencies.getNonceLock).not.toHaveBeenCalled();
      expect(mocks.request.lifecycle.execution).toBeUndefined();
    });
  });

  describe('throws: missing chainId', () => {
    it('throws when the transaction has no chainId', async () => {
      const transactionMeta = buildTransactionMeta({ chainId: '' as never });
      const mocks = buildLifecycleMocksWithOnError({ transactionMeta });

      await expect(approveTransaction(mocks.request)).rejects.toThrow(
        'No chainId defined.',
      );
    });
  });

  describe('happy path: sets approved status and publishes event', () => {
    it('transitions status to approved and publishes transactionStatusUpdated', async () => {
      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      expect(mocks.getTransaction().status).toBe(TransactionStatus.approved);

      expect(mocks.messengerPublish).toHaveBeenCalledWith(
        'TransactionController:transactionStatusUpdated',
        expect.objectContaining({
          transactionMeta: mocks.request.transactionMeta,
        }),
      );
    });

    it('acquires the nonce lock via getNonceLock and stores a releaseNonce function on lifecycle', async () => {
      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      expect(mocks.request.dependencies.getNonceLock).toHaveBeenCalledWith(
        FROM_MOCK,
        NETWORK_CLIENT_ID_MOCK,
      );
      // getNextNonce binds releaseLock to the lock object, producing a new
      // function reference, so we check type rather than identity.
      expect(mocks.request.lifecycle.execution?.releaseNonce).toStrictEqual(
        expect.any(Function),
      );
    });

    it('writes the nonce from the nonce lock as a hex value', async () => {
      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      // NONCE_MOCK is 1, toHex(1) === '0x1'
      expect(mocks.getTransaction().txParams.nonce).toBe(
        `0x${NONCE_MOCK.toString(16)}`,
      );
    });

    it('copies gas to gasLimit on the approved transaction', async () => {
      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      const meta = mocks.getTransaction();
      expect(meta.txParams.gasLimit).toBe(meta.txParams.gas);
    });

    it('copies chainId onto txParams', async () => {
      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      expect(mocks.getTransaction().txParams.chainId).toBe(CHAIN_ID_MOCK);
    });

    it('records networkClientId on lifecycle.execution', async () => {
      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      expect(mocks.request.lifecycle.execution?.networkClientId).toBe(
        NETWORK_CLIENT_ID_MOCK,
      );
    });

    it('stores the releaseApproval callback returned by startTransactionApproval', async () => {
      const releaseApproval = jest.fn();
      jest.mocked(startTransactionApproval).mockReturnValue(releaseApproval);

      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      expect(mocks.request.lifecycle.execution?.releaseApproval).toBe(
        releaseApproval,
      );
    });

    it('calls startTransactionApproval with the correct transactionId', async () => {
      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      expect(startTransactionApproval).toHaveBeenCalledWith(
        mocks.request.dependencies,
        TRANSACTION_ID_MOCK,
      );
    });

    it('updates request.transactionMeta to the approved version', async () => {
      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      expect(mocks.request.transactionMeta.status).toBe(
        TransactionStatus.approved,
      );
    });
  });

  describe('EIP-1559 envelope type', () => {
    it('sets envelope type to feeMarket when EIP-1559 fields are present and type is absent', async () => {
      const transactionMeta = buildTransactionMeta({
        txParams: {
          from: FROM_MOCK,
          gas: '0x5208',
          maxFeePerGas: '0x1',
          maxPriorityFeePerGas: '0x1',
          to: TO_MOCK,
          value: '0x0',
        },
      });

      const mocks = buildLifecycleMocksWithOnError({ transactionMeta });

      await approveTransaction(mocks.request);

      expect(mocks.getTransaction().txParams.type).toBe(
        TransactionEnvelopeType.feeMarket,
      );
    });

    it('does not overwrite an explicit envelope type', async () => {
      const transactionMeta = buildTransactionMeta({
        txParams: {
          from: FROM_MOCK,
          gas: '0x5208',
          maxFeePerGas: '0x1',
          maxPriorityFeePerGas: '0x1',
          to: TO_MOCK,
          type: TransactionEnvelopeType.legacy,
          value: '0x0',
        },
      });

      const mocks = buildLifecycleMocksWithOnError({ transactionMeta });

      await approveTransaction(mocks.request);

      expect(mocks.getTransaction().txParams.type).toBe(
        TransactionEnvelopeType.legacy,
      );
    });

    it('does not set envelope type for legacy transactions without EIP-1559 fields', async () => {
      const mocks = buildLifecycleMocksWithOnError();

      await approveTransaction(mocks.request);

      // Default fixture has gasPrice but no maxFeePerGas → not EIP-1559
      expect(mocks.getTransaction().txParams.type).toBeUndefined();
    });
  });

  describe('nonce skipping', () => {
    it('does not call getNonceLock when a custom nonce is set', async () => {
      const transactionMeta = buildTransactionMeta({
        customNonceValue: '5',
      });
      const mocks = buildLifecycleMocksWithOnError({ transactionMeta });

      await approveTransaction(mocks.request);

      expect(mocks.request.dependencies.getNonceLock).not.toHaveBeenCalled();
    });

    it('does not call getNonceLock when an existing nonce is present on txParams', async () => {
      const transactionMeta = buildTransactionMeta({
        txParams: {
          from: FROM_MOCK,
          gas: '0x5208',
          gasPrice: '0x1',
          nonce: '0x3',
          to: TO_MOCK,
          value: '0x0',
        },
      });
      const mocks = buildLifecycleMocksWithOnError({ transactionMeta });

      await approveTransaction(mocks.request);

      expect(mocks.request.dependencies.getNonceLock).not.toHaveBeenCalled();
    });
  });
});

/**
 * Build lifecycle mocks with an `onError` handler already installed on the
 * lifecycle object so tests do not need to mutate the property directly (which
 * trips the prefer-spy-on lint rule).
 *
 * @param options - Options forwarded to `buildLifecycleMocks`.
 * @param options.transactionMeta - Optional transaction metadata override.
 * @returns The mocks with lifecycle.onError pre-set to a jest.fn().
 */
function buildLifecycleMocksWithOnError(
  options: Parameters<typeof buildLifecycleMocks>[0] = {},
): LifecycleMocks & { onError: jest.Mock } {
  const mocks = buildLifecycleMocks(options);
  const onError = jest.fn();
  mocks.request.lifecycle = { ...mocks.request.lifecycle, onError };
  return { ...mocks, onError };
}
