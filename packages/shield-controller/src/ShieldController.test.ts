import type { TransactionControllerState } from '@metamask/transaction-controller';

import { ShieldController } from './ShieldController';
import { createMockBackend } from '../tests/mocks/backend';
import { createMockMessenger } from '../tests/mocks/messenger';
import { generateMockTxMeta } from '../tests/utils';

/**
 * Sets up a ShieldController for testing.
 *
 * @param options - The options for setup.
 * @param options.coverageHistoryLimit - The coverage history limit.
 * @param options.transactionHistoryLimit - The transaction history limit.
 * @returns Objects that have been created for testing.
 */
function setup({
  coverageHistoryLimit,
  transactionHistoryLimit,
}: {
  coverageHistoryLimit?: number;
  transactionHistoryLimit?: number;
} = {}) {
  const backend = createMockBackend();
  const { messenger, baseMessenger } = createMockMessenger();

  const controller = new ShieldController({
    backend,
    coverageHistoryLimit,
    transactionHistoryLimit,
    messenger,
  });
  controller.start();
  return {
    controller,
    messenger,
    baseMessenger,
    backend,
  };
}

describe('ShieldController', () => {
  describe('checkCoverage', () => {
    it('should trigger checkCoverage when a new transaction is added', async () => {
      const { baseMessenger, backend } = setup();
      const txMeta = generateMockTxMeta();
      const coverageResultReceived = new Promise<void>((resolve) => {
        baseMessenger.subscribe(
          'ShieldController:coverageResultReceived',
          (_coverageResult) => resolve(),
        );
      });
      baseMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [txMeta] } as TransactionControllerState,
        undefined as never,
      );
      expect(await coverageResultReceived).toBeUndefined();
      expect(backend.checkCoverage).toHaveBeenCalledWith(txMeta);
    });

    it('should no longer trigger checkCoverage when controller is stopped', async () => {
      const { controller, baseMessenger, backend } = setup();
      controller.stop();
      const txMeta = generateMockTxMeta();
      const coverageResultReceived = new Promise<void>((resolve, reject) => {
        baseMessenger.subscribe(
          'ShieldController:coverageResultReceived',
          (_coverageResult) => resolve(),
        );
        setTimeout(
          () => reject(new Error('Coverage result not received')),
          100,
        );
      });
      baseMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [txMeta] } as TransactionControllerState,
        undefined as never,
      );
      await expect(coverageResultReceived).rejects.toThrow(
        'Coverage result not received',
      );
      expect(backend.checkCoverage).not.toHaveBeenCalled();
    });

    it('should purge coverage history when the limit is exceeded', async () => {
      const { controller } = setup({
        coverageHistoryLimit: 1,
      });
      const txMeta = generateMockTxMeta();
      await controller.checkCoverage(txMeta);
      await controller.checkCoverage(txMeta);
      expect(controller.state.coverageResults).toHaveProperty(txMeta.id);
      expect(controller.state.coverageResults[txMeta.id].results).toHaveLength(
        1,
      );
    });

    it('should purge transaction history when the limit is exceeded', async () => {
      const { controller } = setup({
        transactionHistoryLimit: 1,
      });
      const txMeta1 = generateMockTxMeta();
      const txMeta2 = generateMockTxMeta();
      await controller.checkCoverage(txMeta1);
      await controller.checkCoverage(txMeta2);
      expect(controller.state.coverageResults).toHaveProperty(txMeta2.id);
      expect(controller.state.coverageResults[txMeta2.id].results).toHaveLength(
        1,
      );
    });

    it('should check coverage when a transaction is simulated', async () => {
      const { baseMessenger, backend } = setup();
      const txMeta = generateMockTxMeta();
      const coverageResultReceived = new Promise<void>((resolve) => {
        baseMessenger.subscribe(
          'ShieldController:coverageResultReceived',
          (_coverageResult) => resolve(),
        );
      });

      // Add transaction.
      baseMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [txMeta] } as TransactionControllerState,
        undefined as never,
      );
      expect(await coverageResultReceived).toBeUndefined();
      expect(backend.checkCoverage).toHaveBeenCalledWith(txMeta);

      // Simulate transaction.
      txMeta.simulationData = {
        tokenBalanceChanges: [],
      };
      baseMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [txMeta] } as TransactionControllerState,
        undefined as never,
      );
      expect(await coverageResultReceived).toBeUndefined();
      expect(backend.checkCoverage).toHaveBeenCalledWith(txMeta);
    });
  });
});
