import { CollectPublishHook } from './CollectPublishHook';
import type { TransactionMeta } from '..';
import { flushPromises } from '../../../../tests/helpers';

const SIGNED_TX_MOCK = '0x123';
const SIGNED_TX_2_MOCK = '0x456';
const TRANSACTION_HASH_MOCK = '0x789';
const TRANSACTION_HASH_2_MOCK = '0xabc';
const ERROR_MESSAGE_MOCK = 'Test error';

const TRANSACTION_META_MOCK = {
  id: '123-456',
} as TransactionMeta;

describe('CollectPublishHook', () => {
  describe('getHook', () => {
    it('returns function that resolves ready promise', async () => {
      const collectHook = new CollectPublishHook(2);
      const publishHook = collectHook.getHook();

      publishHook(TRANSACTION_META_MOCK, SIGNED_TX_MOCK).catch(() => {
        // Intentionally empty
      });

      publishHook(TRANSACTION_META_MOCK, SIGNED_TX_2_MOCK).catch(() => {
        // Intentionally empty
      });

      await flushPromises();

      const result = await collectHook.ready();

      expect(result.signedTransactions).toStrictEqual([
        SIGNED_TX_MOCK,
        SIGNED_TX_2_MOCK,
      ]);
    });
  });

  describe('success', () => {
    it('resolves all publish promises', async () => {
      const collectHook = new CollectPublishHook(2);
      const publishHook = collectHook.getHook();

      const publishPromise1 = publishHook(
        TRANSACTION_META_MOCK,
        SIGNED_TX_MOCK,
      );

      const publishPromise2 = publishHook(
        TRANSACTION_META_MOCK,
        SIGNED_TX_2_MOCK,
      );

      collectHook.success([TRANSACTION_HASH_MOCK, TRANSACTION_HASH_2_MOCK]);

      const result1 = await publishPromise1;
      const result2 = await publishPromise2;

      expect(result1.transactionHash).toBe(TRANSACTION_HASH_MOCK);
      expect(result2.transactionHash).toBe(TRANSACTION_HASH_2_MOCK);
    });

    it('throws if transaction hash count does not match hook call count', () => {
      const collectHook = new CollectPublishHook(2);
      const publishHook = collectHook.getHook();

      publishHook(TRANSACTION_META_MOCK, SIGNED_TX_MOCK).catch(() => {
        // Intentionally empty
      });

      publishHook(TRANSACTION_META_MOCK, SIGNED_TX_2_MOCK).catch(() => {
        // Intentionally empty
      });

      expect(() => {
        collectHook.success([TRANSACTION_HASH_MOCK]);
      }).toThrow('Transaction hash count mismatch');
    });
  });

  describe('error', () => {
    it('rejects all publish promises', async () => {
      const collectHook = new CollectPublishHook(2);
      const publishHook = collectHook.getHook();

      const publishPromise1 = publishHook(
        TRANSACTION_META_MOCK,
        SIGNED_TX_MOCK,
      );

      const publishPromise2 = publishHook(
        TRANSACTION_META_MOCK,
        SIGNED_TX_2_MOCK,
      );

      publishPromise1.catch(() => {
        // Intentionally empty
      });

      publishPromise2.catch(() => {
        // Intentionally empty
      });

      collectHook.error(new Error(ERROR_MESSAGE_MOCK));

      await expect(publishPromise1).rejects.toThrow(ERROR_MESSAGE_MOCK);
      await expect(publishPromise2).rejects.toThrow(ERROR_MESSAGE_MOCK);
    });
  });
});
