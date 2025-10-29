import { deriveStateFromMetadata } from '@metamask/base-controller';
import type { SignatureRequest } from '@metamask/signature-controller';
import {
  SignatureRequestStatus,
  type SignatureControllerState,
} from '@metamask/signature-controller';
import type {
  PricingPaymentMethod,
  PricingResponse,
  ProductPricing,
  StartCryptoSubscriptionResponse,
  SubscriptionControllerState,
} from '@metamask/subscription-controller';
import {
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
  SUBSCRIPTION_STATUSES,
} from '@metamask/subscription-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
  type TransactionControllerState,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { ShieldController } from './ShieldController';
import type {
  DecodeTransactionDataHandler,
  NormalizeSignatureRequestFn,
} from './types';
import { TX_META_SIMULATION_DATA_MOCKS } from '../tests/data';
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
 * @param options.normalizeSignatureRequest - The function to normalize the signature request.
 * @param options.decodeTransactionDataHandler - The handler to decode transaction data.
 * @returns Objects that have been created for testing.
 */
function setup({
  coverageHistoryLimit,
  transactionHistoryLimit,
  normalizeSignatureRequest,
  decodeTransactionDataHandler = jest.fn(),
}: {
  coverageHistoryLimit?: number;
  transactionHistoryLimit?: number;
  normalizeSignatureRequest?: NormalizeSignatureRequestFn;
  decodeTransactionDataHandler?: jest.MockedFunction<DecodeTransactionDataHandler>;
} = {}) {
  const backend = createMockBackend();
  const { messenger, rootMessenger } = createMockMessenger();

  const controller = new ShieldController({
    backend,
    coverageHistoryLimit,
    transactionHistoryLimit,
    messenger,
    normalizeSignatureRequest,
    decodeTransactionDataHandler,
  });
  controller.start();
  return {
    controller,
    messenger,
    rootMessenger,
    backend,
    decodeTransactionDataHandler,
  };
}

describe('ShieldController', () => {
  describe('checkCoverage', () => {
    it('should trigger checkCoverage when a new transaction is added', async () => {
      const { rootMessenger, messenger, backend } = setup();
      const txMeta = generateMockTxMeta();
      const coverageResultReceived = setupCoverageResultReceived(messenger);
      rootMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [txMeta] } as TransactionControllerState,
        undefined as never,
      );
      expect(await coverageResultReceived).toBeUndefined();
      expect(backend.checkCoverage).toHaveBeenCalledWith({ txMeta });
    });

    it('should tolerate calling start and stop multiple times', async () => {
      const { backend, rootMessenger, messenger, controller } = setup();
      controller.stop();
      controller.stop();
      controller.start();
      controller.start();
      const txMeta = generateMockTxMeta();
      const coverageResultReceived = setupCoverageResultReceived(messenger);
      rootMessenger.publish(
        'TransactionController:stateChange',
        { transactions: [txMeta] } as TransactionControllerState,
        undefined as never,
      );
      expect(await coverageResultReceived).toBeUndefined();
      expect(backend.checkCoverage).toHaveBeenCalledWith({ txMeta });
    });

    it('should no longer trigger checkCoverage when controller is stopped', async () => {
      const { controller, rootMessenger, backend } = setup();
      controller.stop();
      const txMeta = generateMockTxMeta();
      const coverageResultReceived = new Promise<void>((resolve, reject) => {
        rootMessenger.subscribe(
          'ShieldController:coverageResultReceived',
          (_coverageResult) => resolve(),
        );
        setTimeout(
          () => reject(new Error('Coverage result not received')),
          100,
        );
      });
      rootMessenger.publish(
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
      const { rootMessenger, messenger, backend } = setup();
      const txMeta = generateMockTxMeta();
      const coverageResultReceived = setupCoverageResultReceived(messenger);

      // Add transaction.
      rootMessenger.publish(
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
      const coverageResultReceived2 = setupCoverageResultReceived(messenger);
      rootMessenger.publish(
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

    TX_META_SIMULATION_DATA_MOCKS.forEach(
      ({ description, previousSimulationData, newSimulationData }) => {
        it(`should check coverage when ${description}`, async () => {
          const { rootMessenger, messenger, backend } = setup();
          const previousTxMeta = {
            ...generateMockTxMeta(),
            simulationData: previousSimulationData,
          };
          const coverageResultReceived = setupCoverageResultReceived(messenger);

          // Add transaction.
          rootMessenger.publish(
            'TransactionController:stateChange',
            { transactions: [previousTxMeta] } as TransactionControllerState,
            undefined as never,
          );
          expect(await coverageResultReceived).toBeUndefined();
          expect(backend.checkCoverage).toHaveBeenCalledWith({
            txMeta: previousTxMeta,
          });

          // Simulate transaction.
          const txMeta2 = { ...previousTxMeta };
          txMeta2.simulationData = newSimulationData;
          const coverageResultReceived2 =
            setupCoverageResultReceived(messenger);
          rootMessenger.publish(
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
      },
    );

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
    const MOCK_SIGNATURE_REQUEST = generateMockSignatureRequest();

    it('should check signature coverage', async () => {
      const { rootMessenger, backend } = setup();
      const coverageResultReceived = new Promise<void>((resolve) => {
        rootMessenger.subscribe(
          'ShieldController:coverageResultReceived',
          (_coverageResult) => resolve(),
        );
      });
      rootMessenger.publish(
        'SignatureController:stateChange',
        {
          signatureRequests: {
            [MOCK_SIGNATURE_REQUEST.id]: MOCK_SIGNATURE_REQUEST,
          },
        } as SignatureControllerState,
        undefined as never,
      );
      expect(await coverageResultReceived).toBeUndefined();
      expect(backend.checkSignatureCoverage).toHaveBeenCalledWith({
        signatureRequest: MOCK_SIGNATURE_REQUEST,
      });
    });

    it('should normalize the signature request if a normalizeSignatureRequest function is provided', async () => {
      const MOCK_NORMALIZED_SIGNATURE_REQUEST = {
        ...MOCK_SIGNATURE_REQUEST,
        messageParams: {
          ...MOCK_SIGNATURE_REQUEST.messageParams,
          data: 'normalized data',
        },
      };
      const normalizeSignatureRequestMock = jest
        .fn()
        .mockImplementationOnce((_signatureRequest: SignatureRequest) => {
          return MOCK_NORMALIZED_SIGNATURE_REQUEST;
        });
      const { rootMessenger, backend } = setup({
        normalizeSignatureRequest: normalizeSignatureRequestMock,
      });
      const coverageResultReceived = new Promise<void>((resolve) => {
        rootMessenger.subscribe(
          'ShieldController:coverageResultReceived',
          (_coverageResult) => resolve(),
        );
      });
      rootMessenger.publish(
        'SignatureController:stateChange',
        {
          signatureRequests: {
            [MOCK_SIGNATURE_REQUEST.id]: MOCK_SIGNATURE_REQUEST,
          },
        } as SignatureControllerState,
        undefined as never,
      );

      expect(await coverageResultReceived).toBeUndefined();
      expect(backend.checkSignatureCoverage).toHaveBeenCalledWith({
        signatureRequest: MOCK_NORMALIZED_SIGNATURE_REQUEST,
      });
      expect(normalizeSignatureRequestMock).toHaveBeenCalledWith(
        MOCK_SIGNATURE_REQUEST,
      );
    });
  });

  it('should check coverage for multiple signature request', async () => {
    const { rootMessenger, backend } = setup();
    const signatureRequest1 = generateMockSignatureRequest();
    const coverageResultReceived1 = new Promise<void>((resolve) => {
      rootMessenger.subscribe(
        'ShieldController:coverageResultReceived',
        (_coverageResult) => resolve(),
      );
    });
    rootMessenger.publish(
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
      rootMessenger.subscribe(
        'ShieldController:coverageResultReceived',
        (_coverageResult) => resolve(),
      );
    });
    rootMessenger.publish(
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
      const { messenger, rootMessenger } = components;

      // Create a promise that resolves when the state changes
      const stateUpdated = new Promise((resolve) =>
        messenger.subscribe('ShieldController:stateChange', resolve),
      );

      // Publish a signature request
      const signatureRequest = generateMockSignatureRequest();
      rootMessenger.publish(
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
      rootMessenger.publish(
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
      const { messenger, rootMessenger } = components;
      // Create a promise that resolves when the state changes
      const stateUpdated = new Promise((resolve) =>
        messenger.subscribe('ShieldController:stateChange', resolve),
      );

      // Publish a transaction
      const txMeta = generateMockTxMeta();
      rootMessenger.publish(
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
      rootMessenger.publish(
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
          'includeInDebugSnapshot',
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

  const MOCK_PRODUCT_PRICE: ProductPricing = {
    name: PRODUCT_TYPES.SHIELD,
    prices: [
      {
        interval: RECURRING_INTERVALS.month,
        currency: 'usd',
        unitAmount: 900,
        unitDecimals: 2,
        trialPeriodDays: 0,
        minBillingCycles: 1,
      },
    ],
  };

  const MOCK_PRICING_PAYMENT_METHOD: PricingPaymentMethod = {
    type: PAYMENT_TYPES.byCrypto,
    chains: [
      {
        chainId: '0x1',
        paymentAddress: '0xspender',
        tokens: [
          {
            address: '0xtoken',
            symbol: 'USDT',
            decimals: 18,
            conversionRate: { usd: '1.0' },
          },
        ],
      },
    ],
  };

  const MOCK_PRICE_INFO_RESPONSE: PricingResponse = {
    products: [MOCK_PRODUCT_PRICE],
    paymentMethods: [MOCK_PRICING_PAYMENT_METHOD],
  };

  describe('#handleSubscriptionCryptoApproval', () => {
    it('should handle subscription crypto approval when shield subscription transaction is submitted', async () => {
      const { baseMessenger, decodeTransactionDataHandler } = setup();

      // Create a promise that resolves when startSubscriptionWithCrypto is called
      let startSubscriptionResolve: () => void;
      const startSubscriptionPromise = new Promise<void>((resolve) => {
        startSubscriptionResolve = resolve;
      });

      baseMessenger.registerActionHandler(
        'SubscriptionController:getState',
        () =>
          ({
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
          }) as SubscriptionControllerState,
      );

      baseMessenger.registerActionHandler(
        'SubscriptionController:startSubscriptionWithCrypto',
        () => {
          return Promise.resolve({
            subscriptionId: 'sub_123',
            status: SUBSCRIPTION_STATUSES.trialing,
          } as StartCryptoSubscriptionResponse);
        },
      );

      baseMessenger.registerActionHandler(
        'SubscriptionController:getSubscriptions',
        () => {
          startSubscriptionResolve();
          return Promise.resolve([]);
        },
      );

      baseMessenger.registerActionHandler(
        'SubscriptionController:getCryptoApproveTransactionParams',
        () => ({
          approveAmount: '90000',
          paymentAddress: '0xabc' as Hex,
          paymentTokenAddress: '0xdef' as Hex,
          chainId: '0x1' as Hex,
        }),
      );

      baseMessenger.registerActionHandler(
        'AccountsController:getSelectedAccount',
        // @ts-expect-error - Mocking the return type
        () => Promise.resolve({ address: '0xabc' }),
      );

      // Mock decode response
      decodeTransactionDataHandler.mockResolvedValue({
        data: [
          {
            name: 'approve',
            params: [
              {
                name: 'value',
                value: '90000',
                type: 'uint256',
              },
            ],
          },
        ],
      });

      // Create a shield subscription approval transaction
      const txMeta = {
        ...generateMockTxMeta(),
        type: TransactionType.shieldSubscriptionApprove,
        chainId: '0x1',
        rawTx: '0x123',
        txParams: {
          data: '0x456',
          to: '0xtoken',
        },
        status: TransactionStatus.submitted,
        hash: '0x123',
      };

      // Publish the transaction submitted event to trigger the handler
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as TransactionMeta,
      });

      // Wait for the subscription to be started
      await startSubscriptionPromise;

      // Verify that decodeTransactionDataHandler was called
      expect(decodeTransactionDataHandler).toHaveBeenCalledWith({
        transactionData: '0x456',
        contractAddress: '0xtoken',
        chainId: '0x1',
      });
    });

    it('should not handle subscription crypto approval when pricing is not found', async () => {
      const { baseMessenger, decodeTransactionDataHandler } = setup();

      baseMessenger.registerActionHandler(
        'SubscriptionController:getState',
        () =>
          ({
            pricing: undefined,
            trialedProducts: [],
            subscriptions: [],
          }) as SubscriptionControllerState,
      );

      // Create a non-shield subscription transaction
      const txMeta = {
        ...generateMockTxMeta(),
        type: TransactionType.shieldSubscriptionApprove,
        status: TransactionStatus.submitted,
        hash: '0x123',
        rawTx: '0x123',
      };

      // Publish the transaction state change
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as TransactionMeta,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Verify that decodeTransactionDataHandler was not called
      expect(decodeTransactionDataHandler).not.toHaveBeenCalled();
    });

    it('should not handle subscription crypto approval for non-shield subscription transactions', async () => {
      const { baseMessenger, decodeTransactionDataHandler } = setup();

      // Create a non-shield subscription transaction
      const txMeta = {
        ...generateMockTxMeta(),
        type: TransactionType.contractInteraction,
        status: TransactionStatus.submitted,
        hash: '0x123',
      };

      // Publish the transaction state change
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as TransactionMeta,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Verify that decodeTransactionDataHandler was not called
      expect(decodeTransactionDataHandler).not.toHaveBeenCalled();
    });

    it('should throw error when chainId is missing', async () => {
      const { baseMessenger, decodeTransactionDataHandler } = setup();

      // Create a transaction without chainId
      const txMeta = {
        ...generateMockTxMeta(),
        type: TransactionType.shieldSubscriptionApprove,
        chainId: undefined,
        rawTx: '0x123',
        txParams: {
          data: '0x456',
          to: '0x789',
        },
        status: TransactionStatus.submitted,
        hash: '0x123',
      };

      // Publish the transaction state change
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as unknown as TransactionMeta,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Verify that decodeTransactionDataHandler was not called due to early error
      expect(decodeTransactionDataHandler).not.toHaveBeenCalled();
    });

    it('should throw error when rawTx is missing', async () => {
      const { baseMessenger, decodeTransactionDataHandler } = setup();

      // Create a transaction without rawTx
      const txMeta = {
        ...generateMockTxMeta(),
        type: TransactionType.shieldSubscriptionApprove,
        chainId: '0x1',
        rawTx: undefined,
        txParams: {
          data: '0x456',
          to: '0x789',
        },
        status: TransactionStatus.submitted,
        hash: '0x123',
      };

      // Publish the transaction state change
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as TransactionMeta,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Verify that decodeTransactionDataHandler was not called due to early error
      expect(decodeTransactionDataHandler).not.toHaveBeenCalled();
    });

    it('should throw error when decodeResponse is undefined', async () => {
      const { baseMessenger, decodeTransactionDataHandler } = setup();

      baseMessenger.registerActionHandler(
        'SubscriptionController:getState',
        () =>
          ({
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
          }) as SubscriptionControllerState,
      );

      // Mock decode response to return undefined
      decodeTransactionDataHandler.mockResolvedValue(undefined);

      // Create a shield subscription approval transaction
      const txMeta = {
        ...generateMockTxMeta(),
        type: TransactionType.shieldSubscriptionApprove,
        chainId: '0x1',
        rawTx: '0x123',
        txParams: {
          data: '0x456',
          to: '0x789',
        },
        status: TransactionStatus.submitted,
        hash: '0x123',
      };

      // Publish the transaction state change
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as TransactionMeta,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Verify that decodeTransactionDataHandler was called
      expect(decodeTransactionDataHandler).toHaveBeenCalledWith({
        transactionData: '0x456',
        contractAddress: '0x789',
        chainId: '0x1',
      });
    });

    it('should throw error when approval amount is not found', async () => {
      const { baseMessenger, decodeTransactionDataHandler } = setup();

      baseMessenger.registerActionHandler(
        'SubscriptionController:getState',
        () =>
          ({
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
          }) as SubscriptionControllerState,
      );

      // Mock decode response without approval amount
      decodeTransactionDataHandler.mockResolvedValue({
        data: [
          {
            name: 'approve',
            params: [
              {
                name: 'spender',
                value: '0x123',
                type: 'address',
              },
            ],
          },
        ],
      });

      // Create a shield subscription approval transaction
      const txMeta = {
        ...generateMockTxMeta(),
        type: TransactionType.shieldSubscriptionApprove,
        chainId: '0x1',
        rawTx: '0x123',
        txParams: {
          data: '0x456',
          to: '0x789',
        },
        status: TransactionStatus.submitted,
        hash: '0x123',
      };

      // Publish the transaction state change
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as TransactionMeta,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Verify that decodeTransactionDataHandler was called
      expect(decodeTransactionDataHandler).toHaveBeenCalledWith({
        transactionData: '0x456',
        contractAddress: '0x789',
        chainId: '0x1',
      });
    });

    it('should throw error when selected token price is not found', async () => {
      const { baseMessenger, decodeTransactionDataHandler } = setup();

      baseMessenger.registerActionHandler(
        'SubscriptionController:getState',
        () =>
          ({
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
          }) as SubscriptionControllerState,
      );

      // Mock decode response with approval amount
      decodeTransactionDataHandler.mockResolvedValue({
        data: [
          {
            name: 'approve',
            params: [
              {
                name: 'value',
                value: '90000',
                type: 'uint256',
              },
            ],
          },
        ],
      });

      // Create a shield subscription approval transaction with token address that doesn't exist
      const txMeta = {
        ...generateMockTxMeta(),
        type: TransactionType.shieldSubscriptionApprove,
        chainId: '0x1',
        rawTx: '0x123',
        txParams: {
          data: '0x456',
          to: '0xnonexistent',
        },
        status: TransactionStatus.submitted,
        hash: '0x123',
      };

      // Publish the transaction submitted event to trigger the handler
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as TransactionMeta,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Verify that decodeTransactionDataHandler was called
      expect(decodeTransactionDataHandler).toHaveBeenCalled();
    });

    it('should throw error when product price is not found', async () => {
      const { baseMessenger, decodeTransactionDataHandler } = setup();

      const mockGetSubscriptionState = jest.fn().mockReturnValue({
        pricing: MOCK_PRICE_INFO_RESPONSE,
        trialedProducts: [],
        subscriptions: [],
      } as SubscriptionControllerState);

      baseMessenger.registerActionHandler(
        'SubscriptionController:getState',
        mockGetSubscriptionState,
      );

      baseMessenger.registerActionHandler(
        'SubscriptionController:getCryptoApproveTransactionParams',
        // Mock with a different approval amount that won't match any pricing plan
        () => ({
          approveAmount: '999999',
          paymentAddress: '0xabc' as Hex,
          paymentTokenAddress: '0xdef' as Hex,
          chainId: '0x1' as Hex,
        }),
      );

      // Mock decode response with approval amount that won't match
      decodeTransactionDataHandler.mockResolvedValue({
        data: [
          {
            name: 'approve',
            params: [
              {
                name: 'value',
                value: '90000',
                type: 'uint256',
              },
            ],
          },
        ],
      });

      // Create a shield subscription approval transaction
      const txMeta = {
        ...generateMockTxMeta(),
        type: TransactionType.shieldSubscriptionApprove,
        chainId: '0x1',
        rawTx: '0x123',
        txParams: {
          data: '0x456',
          to: '0xtoken',
        },
        status: TransactionStatus.submitted,
        hash: '0x123',
      };

      // Publish the transaction submitted event to trigger the handler
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as TransactionMeta,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 1));

      // Verify that decodeTransactionDataHandler was called
      expect(decodeTransactionDataHandler).toHaveBeenCalled();

      mockGetSubscriptionState.mockReturnValue({
        pricing: {
          ...MOCK_PRICE_INFO_RESPONSE,
          products: [],
        },
        trialedProducts: [],
        subscriptions: [],
      } as SubscriptionControllerState);

      // Publish the transaction submitted event to trigger the handler
      baseMessenger.publish('TransactionController:transactionSubmitted', {
        transactionMeta: txMeta as TransactionMeta,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 1));

      expect(decodeTransactionDataHandler).toHaveBeenCalled();
    });
  });
});
