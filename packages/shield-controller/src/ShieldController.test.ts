import { deriveStateFromMetadata } from '@metamask/base-controller';
import type { SignatureRequest } from '@metamask/signature-controller';
import {
  SignatureRequestStatus,
  type SignatureControllerState,
} from '@metamask/signature-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  type TransactionControllerState,
} from '@metamask/transaction-controller';

import { ShieldController } from './ShieldController';
import { createMockBackend, MOCK_COVERAGE_ID } from '../tests/mocks/backend';
import { createMockMessenger } from '../tests/mocks/messenger';
import {
  generateMockSignatureRequest,
  generateMockTxMeta,
  setupCoverageResultReceived,
} from '../tests/utils';

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
      expect(backend.checkCoverage).toHaveBeenCalledWith({ txMeta });
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
      const coverageResultReceived = setupCoverageResultReceived(baseMessenger);

      // Add transaction.
      baseMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [txMeta] } as TransactionControllerState,
        undefined as never,
      );
      expect(await coverageResultReceived).toBeUndefined();
      expect(backend.checkCoverage).toHaveBeenCalledWith({ txMeta });

      // Simulate transaction.
      const txMeta2 = { ...txMeta };
      txMeta2.simulationData = {
        tokenBalanceChanges: [],
      };
      const coverageResultReceived2 =
        setupCoverageResultReceived(baseMessenger);
      baseMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [txMeta2] } as TransactionControllerState,
        undefined as never,
      );
      expect(await coverageResultReceived2).toBeUndefined();
      expect(backend.checkCoverage).toHaveBeenCalledWith({
        coverageId: MOCK_COVERAGE_ID,
        txMeta: txMeta2,
      });
    });

    it('throws an error when the coverage ID has changed', async () => {
      const { controller, backend } = setup();
      backend.checkCoverage.mockResolvedValueOnce({
        coverageId: '0x00',
      });
      backend.checkCoverage.mockResolvedValueOnce({
        coverageId: '0x01',
      });
      const txMeta = generateMockTxMeta();
      await controller.checkCoverage(txMeta);
      await expect(controller.checkCoverage(txMeta)).rejects.toThrow(
        'Coverage ID has changed',
      );
    });
  });

  describe('checkSignatureCoverage', () => {
    it('should check signature coverage', async () => {
      const { baseMessenger, backend } = setup();
      const signatureRequest = generateMockSignatureRequest();
      const coverageResultReceived = new Promise<void>((resolve) => {
        baseMessenger.subscribe(
          'ShieldController:coverageResultReceived',
          (_coverageResult) => resolve(),
        );
      });
      baseMessenger.publish(
        'SignatureController:stateChange',
        {
          signatureRequests: { [signatureRequest.id]: signatureRequest },
        } as SignatureControllerState,
        undefined as never,
      );
      expect(await coverageResultReceived).toBeUndefined();
      expect(backend.checkSignatureCoverage).toHaveBeenCalledWith({
        signatureRequest,
      });
    });
  });

  it('should check coverage for multiple signature request', async () => {
    const { baseMessenger, backend } = setup();
    const signatureRequest1 = generateMockSignatureRequest();
    const coverageResultReceived1 = new Promise<void>((resolve) => {
      baseMessenger.subscribe(
        'ShieldController:coverageResultReceived',
        (_coverageResult) => resolve(),
      );
    });
    baseMessenger.publish(
      'SignatureController:stateChange',
      {
        signatureRequests: {
          [signatureRequest1.id]: signatureRequest1,
        },
      } as SignatureControllerState,
      undefined as never,
    );
    expect(await coverageResultReceived1).toBeUndefined();
    expect(backend.checkSignatureCoverage).toHaveBeenCalledWith({
      signatureRequest: signatureRequest1,
    });

    const signatureRequest2 = generateMockSignatureRequest();
    const coverageResultReceived2 = new Promise<void>((resolve) => {
      baseMessenger.subscribe(
        'ShieldController:coverageResultReceived',
        (_coverageResult) => resolve(),
      );
    });
    baseMessenger.publish(
      'SignatureController:stateChange',
      {
        signatureRequests: {
          [signatureRequest2.id]: signatureRequest2,
        },
      } as SignatureControllerState,
      undefined as never,
    );

    expect(await coverageResultReceived2).toBeUndefined();
    expect(backend.checkSignatureCoverage).toHaveBeenCalledWith({
      signatureRequest: signatureRequest2,
    });
  });

  describe('logSignature', () => {
    /**
     * Run a test that logs a signature.
     *
     * @param components - An object containing the messenger and base messenger.
     * @param options - An object containing optional parameters.
     * @param options.updateSignatureRequest - A function that updates the signature request.
     * @returns The signature request.
     */
    async function runTest(
      components: ReturnType<typeof setup>,
      options?: {
        updateSignatureRequest?: (signatureRequest: SignatureRequest) => void;
      },
    ) {
      const { messenger, baseMessenger } = components;

      // Create a promise that resolves when the state changes
      const stateUpdated = new Promise((resolve) =>
        messenger.subscribe('ShieldController:stateChange', resolve),
      );

      // Publish a signature request
      const signatureRequest = generateMockSignatureRequest();
      baseMessenger.publish(
        'SignatureController:stateChange',
        {
          signatureRequests: { [signatureRequest.id]: signatureRequest },
        } as SignatureControllerState,
        undefined as never,
      );

      // Wait for state to be updated
      await stateUpdated;

      // Update signature request
      const updatedSignatureRequest = { ...signatureRequest };
      updatedSignatureRequest.status = SignatureRequestStatus.Signed;
      updatedSignatureRequest.rawSig = '0x00';
      options?.updateSignatureRequest?.(updatedSignatureRequest);
      baseMessenger.publish(
        'SignatureController:stateChange',
        {
          signatureRequests: { [signatureRequest.id]: updatedSignatureRequest },
        } as SignatureControllerState,
        undefined as never,
      );

      return { signatureRequest, updatedSignatureRequest };
    }

    it('logs a signature', async () => {
      const components = setup();

      const { updatedSignatureRequest } = await runTest(components);

      // Check that backend was called
      expect(components.backend.logSignature).toHaveBeenCalledWith({
        signatureRequest: updatedSignatureRequest,
        signature: '0x00',
        status: 'shown',
      });
    });

    it('logs not_shown when coverageId is missing', async () => {
      const components = setup();

      components.backend.checkSignatureCoverage.mockResolvedValue({
        coverageId: undefined,
        status: 'unknown',
      });

      const { updatedSignatureRequest } = await runTest(components);

      // Check that backend was called
      expect(components.backend.logSignature).toHaveBeenCalledWith({
        signatureRequest: updatedSignatureRequest,
        signature: '0x00',
        status: 'not_shown',
      });
    });

    it('does not log when signature is missing', async () => {
      const components = setup();

      await runTest(components, {
        updateSignatureRequest: (signatureRequest) => {
          signatureRequest.rawSig = undefined;
        },
      });

      // Check that backend was not called
      expect(components.backend.logSignature).not.toHaveBeenCalled();
    });
  });

  describe('logTransaction', () => {
    /**
     * Runs a test that logs a transaction.
     *
     * @param components - An object containing the messenger and base messenger.
     * @param options - Options for the test.
     * @param options.updateTransaction - A function that updates the transaction.
     * @returns The transaction meta.
     */
    async function runTest(
      components: ReturnType<typeof setup>,
      options?: { updateTransaction: (txMeta: TransactionMeta) => void },
    ) {
      const { messenger, baseMessenger } = components;
      // Create a promise that resolves when the state changes
      const stateUpdated = new Promise((resolve) =>
        messenger.subscribe('ShieldController:stateChange', resolve),
      );

      // Publish a transaction
      const txMeta = generateMockTxMeta();
      baseMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [txMeta] } as TransactionControllerState,
        undefined as never,
      );

      // Wait for state to be updated
      await stateUpdated;

      // Update transaction
      const updatedTxMeta = { ...txMeta };
      updatedTxMeta.status = TransactionStatus.submitted;
      updatedTxMeta.hash = '0x00';
      options?.updateTransaction(updatedTxMeta);
      baseMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [updatedTxMeta] } as TransactionControllerState,
        undefined as never,
      );

      return { txMeta, updatedTxMeta };
    }

    it('logs a transaction', async () => {
      const components = setup();
      const { updatedTxMeta } = await runTest(components);

      // Check that backend was called
      expect(components.backend.logTransaction).toHaveBeenCalledWith({
        txMeta: updatedTxMeta,
        status: 'shown',
        transactionHash: '0x00',
      });
    });

    it('logs not_shown when coverageId is missing', async () => {
      const components = setup();

      components.backend.checkCoverage.mockResolvedValue({
        coverageId: undefined,
        status: 'unknown',
      });

      const { updatedTxMeta } = await runTest(components);

      // Check that backend was called
      expect(components.backend.logTransaction).toHaveBeenCalledWith({
        status: 'not_shown',
        transactionHash: '0x00',
        txMeta: updatedTxMeta,
      });
    });

    it('does not log when hash is missing', async () => {
      const components = setup();

      await runTest(components, {
        updateTransaction: (txMeta) => delete txMeta.hash,
      });

      // Check that backend was not called
      expect(components.backend.logTransaction).not.toHaveBeenCalled();
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { controller } = setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'anonymous',
        ),
      ).toMatchInlineSnapshot(`Object {}`);
    });

    it('includes expected state in state logs', async () => {
      const { controller } = setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "coverageResults": Object {},
          "orderedTransactionHistory": Array [],
        }
        `);
    });

    it('persists expected state', async () => {
      const { controller } = setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "coverageResults": Object {},
          "orderedTransactionHistory": Array [],
        }
        `);
    });

    it('exposes expected state to UI', async () => {
      const { controller } = setup();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
          Object {
            "coverageResults": Object {},
          }
        `);
    });
  });
});
