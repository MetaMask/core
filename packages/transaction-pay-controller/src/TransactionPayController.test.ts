/* eslint-disable no-new */

import { deriveStateFromMetadata } from '@metamask/base-controller';
import type {
  MetamaskPaySolanaExecution,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { CaipAccountId, CaipAssetType, Hex } from '@metamask/utils';

import { updateFiatPayment } from './actions/update-fiat-payment.js';
import { updatePaymentToken } from './actions/update-payment-token.js';
import { PaymentOverride, TransactionPayStrategy } from './constants.js';
import { TransactionPayController } from './index.js';
import { deriveFiatAssetForFiatPayment } from './strategy/fiat/utils.js';
import {
  fetchRelaySolanaQuote,
  getRelayStatus,
  notifyRelayTransaction,
} from './strategy/relay/relay-api.js';
import type { RelaySolanaQuote } from './strategy/relay/types.js';
import { getMessengerMock } from './tests/messenger-mock.js';
import type {
  TransactionPayControllerMessenger,
  SolanaPayCallbacks,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
  TransactionPaySource,
  TransactionPaySourceAmount,
  UpdateTransactionDataCallback,
} from './types.js';
import {
  getRelayPollingInterval,
  getRelayPollingTimeout,
  getStrategyOrder,
  isSolanaPayEnabled,
} from './utils/feature-flags.js';
import { updateQuotes } from './utils/quotes.js';
import { updateSourceAmounts } from './utils/source-amounts.js';
import {
  getTransaction,
  subscribeAssetChanges,
  subscribeTransactionChanges,
  updateTransaction,
} from './utils/transaction.js';

jest.mock('./actions/update-fiat-payment');
jest.mock('./actions/update-payment-token');
jest.mock('./strategy/fiat/utils');
jest.mock('./strategy/relay/relay-api');
jest.mock('./utils/source-amounts');
jest.mock('./utils/quotes');
jest.mock('./utils/transaction');
jest.mock('./utils/feature-flags');

const TRANSACTION_ID_MOCK = '123-456';
const TRANSACTION_META_MOCK = { id: TRANSACTION_ID_MOCK } as TransactionMeta;
const TOKEN_ADDRESS_MOCK = '0xabc' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;
const SOLANA_ACCOUNT_ID =
  `${SOLANA_CHAIN_ID}:7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z` as CaipAccountId;
const SOLANA_ASSET_ID =
  `${SOLANA_CHAIN_ID}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as CaipAssetType;
const SOLANA_PAY_SOURCE_MOCK: TransactionPaySource = {
  sourceAccountId: SOLANA_ACCOUNT_ID,
  sourceAssetId: SOLANA_ASSET_ID,
};
const SOLANA_TRANSACTION_ID = 'solana-signature-123';
const SOLANA_PREFLIGHT_MOCK = {
  preparedTransaction: 'base64-transaction',
  preparationId: 'preparation-123',
  nativeBalanceRaw: '100000',
  networkFeeRaw: '5000',
  priorityFeeRaw: '1000',
  rentDebitRaw: '2000',
  rentExemptionRequirementRaw: '3000',
  sourceBalanceRaw: '2000000',
};
const SOLANA_QUOTE_MOCK: RelaySolanaQuote = {
  requestId: 'relay-request-123',
  details: {
    currencyIn: {
      amount: '1000000',
      amountFormatted: '1',
      amountUsd: '1',
      currency: { chainId: 792703809, decimals: 6 },
    },
    currencyOut: {
      amount: '999000',
      amountFormatted: '0.999',
      amountUsd: '0.999',
      currency: { chainId: 42161, decimals: 6 },
      minimumAmount: '995000',
    },
    timeEstimate: 15,
    totalImpact: { usd: '0.001' },
  },
  fees: { relayer: { amountUsd: '0.001' } },
  steps: [
    {
      id: 'deposit',
      kind: 'transaction',
      requestId: 'relay-request-123',
      items: [
        {
          check: { endpoint: '/status', method: 'GET' },
          data: {
            chainId: 792703809,
            instructions: [
              {
                programId: '11111111111111111111111111111111',
                keys: [],
                data: '00',
              },
            ],
          },
          status: 'incomplete',
        },
      ],
    },
  ],
};
describe('TransactionPayController', () => {
  const updateFiatPaymentMock = jest.mocked(updateFiatPayment);
  const updatePaymentTokenMock = jest.mocked(updatePaymentToken);
  const deriveFiatAssetForFiatPaymentMock = jest.mocked(
    deriveFiatAssetForFiatPayment,
  );
  const fetchRelaySolanaQuoteMock = jest.mocked(fetchRelaySolanaQuote);
  const getRelayStatusMock = jest.mocked(getRelayStatus);
  const notifyRelayTransactionMock = jest.mocked(notifyRelayTransaction);
  const getRelayPollingIntervalMock = jest.mocked(getRelayPollingInterval);
  const getRelayPollingTimeoutMock = jest.mocked(getRelayPollingTimeout);
  const getTransactionMock = jest.mocked(getTransaction);
  const updateTransactionMock = jest.mocked(updateTransaction);
  const updateSourceAmountsMock = jest.mocked(updateSourceAmounts);
  const updateQuotesMock = jest.mocked(updateQuotes);
  const subscribeTransactionChangesMock = jest.mocked(
    subscribeTransactionChanges,
  );
  const subscribeAssetChangesMock = jest.mocked(subscribeAssetChanges);
  const getStrategyOrderMock = jest.mocked(getStrategyOrder);
  const isSolanaPayEnabledMock = jest.mocked(isSolanaPayEnabled);
  let messenger: TransactionPayControllerMessenger;
  let confirmTransactionMock: jest.Mock;
  let failTransactionMock: jest.Mock;
  let getKeyringControllerStateMock: jest.Mock;
  let getTransactionControllerStateMock: jest.Mock;

  /**
   * Create a TransactionPayController.
   *
   * @param options - Controller options.
   * @returns The created controller.
   */
  function createController(
    options: Partial<TransactionPayControllerOptions> = {},
  ): TransactionPayController {
    return new TransactionPayController({
      ...options,
      getDelegationTransaction: options.getDelegationTransaction ?? jest.fn(),
      messenger,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    const mocks = getMessengerMock({ skipRegister: true });
    messenger = mocks.messenger;
    confirmTransactionMock = mocks.confirmTransactionMock;
    failTransactionMock = mocks.failTransactionMock;
    getKeyringControllerStateMock = mocks.getKeyringControllerStateMock;
    getTransactionControllerStateMock = mocks.getTransactionControllerStateMock;

    messenger.registerActionHandler(
      'TransactionController:confirmTransaction',
      confirmTransactionMock,
    );
    messenger.registerActionHandler(
      'TransactionController:failTransaction',
      failTransactionMock,
    );
    messenger.registerActionHandler(
      'TransactionController:getState',
      getTransactionControllerStateMock,
    );

    getKeyringControllerStateMock.mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          type: 'HD Key Tree',
          accounts: ['0x1234567890123456789012345678901234567891'],
          metadata: { id: 'hd-keyring', name: 'HD Key Tree' },
        },
      ],
    });

    getStrategyOrderMock.mockReturnValue([TransactionPayStrategy.Relay]);
    isSolanaPayEnabledMock.mockReturnValue(true);
    getRelayPollingIntervalMock.mockReturnValue(1);
    getRelayPollingTimeoutMock.mockReturnValue(100);
    updateQuotesMock.mockResolvedValue(true);
    fetchRelaySolanaQuoteMock.mockResolvedValue(SOLANA_QUOTE_MOCK);
    getRelayStatusMock.mockResolvedValue({
      destinationChainId: 42161,
      inTxHashes: [SOLANA_TRANSACTION_ID],
      originChainId: 792703809,
      status: 'pending',
      txHashes: [],
      updatedAt: 1,
    });
    notifyRelayTransactionMock.mockResolvedValue();
  });

  describe('constructor', () => {
    it('subscribes to rate changes for in-flight retry', () => {
      const controller = createController();

      expect(subscribeAssetChangesMock).toHaveBeenCalledWith(
        messenger,
        expect.any(Function),
        expect.any(Function),
      );

      const getControllerState = subscribeAssetChangesMock.mock.calls[0][1];
      expect(getControllerState()).toBe(controller.state);
    });

    it('keeps ordinary Pay selection state transient', () => {
      const controller = createController({
        state: {
          transactionData: {
            [TRANSACTION_ID_MOCK]: {
              isLoading: true,
              tokens: [],
            },
          },
        },
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toStrictEqual({});
    });
  });

  describe('setPaySource', () => {
    it('persists the source only on the target transaction record', () => {
      const controller = createController();

      controller.setPaySource({
        transactionId: TRANSACTION_ID_MOCK,
        source: SOLANA_PAY_SOURCE_MOCK,
      });

      expect(controller.state).toStrictEqual({ transactionData: {} });
      expect(updateTransactionMock).toHaveBeenCalledWith(
        {
          transactionId: TRANSACTION_ID_MOCK,
          messenger,
          note: 'Set transaction pay source',
        },
        expect.any(Function),
      );

      const updateTransactionCallback = updateTransactionMock.mock.calls[0][1];
      const transaction = {
        metamaskPay: {
          chainId: CHAIN_ID_MOCK,
          sourceHash: '0xabc' as Hex,
          tokenAddress: TOKEN_ADDRESS_MOCK,
        },
      } as TransactionMeta;

      updateTransactionCallback(transaction);

      expect(transaction.metamaskPay).toStrictEqual({
        chainId: CHAIN_ID_MOCK,
        source: SOLANA_PAY_SOURCE_MOCK,
        sourceHash: '0xabc',
        tokenAddress: TOKEN_ADDRESS_MOCK,
      });
    });

    it('does not project Solana identifiers into legacy EVM-only fields', () => {
      const controller = createController();

      controller.setPaySource({
        transactionId: TRANSACTION_ID_MOCK,
        source: SOLANA_PAY_SOURCE_MOCK,
      });

      const updateTransactionCallback = updateTransactionMock.mock.calls[0][1];
      const transaction = {} as TransactionMeta;

      updateTransactionCallback(transaction);

      expect(transaction.metamaskPay).toStrictEqual({
        source: SOLANA_PAY_SOURCE_MOCK,
      });
    });

    it('rejects source account and asset identifiers from different chains', () => {
      const controller = createController();

      expect(() =>
        controller.setPaySource({
          transactionId: TRANSACTION_ID_MOCK,
          source: {
            ...SOLANA_PAY_SOURCE_MOCK,
            sourceAssetId: 'eip155:1/slip44:60' as CaipAssetType,
          },
        }),
      ).toThrow('Pay source account and asset must use the same chain');

      expect(updateTransactionMock).not.toHaveBeenCalled();
    });

    it('validates source identifiers before updating the transaction', () => {
      const controller = createController();

      expect(() =>
        controller.setPaySource({
          transactionId: TRANSACTION_ID_MOCK,
          source: {
            ...SOLANA_PAY_SOURCE_MOCK,
            sourceAccountId: 'invalid' as CaipAccountId,
          },
        }),
      ).toThrow('Invalid CAIP account ID');

      expect(updateTransactionMock).not.toHaveBeenCalled();
    });

    it('is callable via messenger action handler', () => {
      createController();

      messenger.call('TransactionPayController:setPaySource', {
        transactionId: TRANSACTION_ID_MOCK,
        source: SOLANA_PAY_SOURCE_MOCK,
      });

      expect(updateTransactionMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Solana execution', () => {
    const TARGET_TOKEN = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Hex;

    function getSolanaCallbacks(
      overrides: Partial<SolanaPayCallbacks> = {},
    ): SolanaPayCallbacks {
      return {
        getPreflight: jest.fn().mockResolvedValue(SOLANA_PREFLIGHT_MOCK),
        getTransactionStatus: jest.fn().mockResolvedValue('pending'),
        signAndSendTransaction: jest.fn().mockResolvedValue({
          outcome: 'submitted',
          transactionId: SOLANA_TRANSACTION_ID,
        }),
        ...overrides,
      };
    }

    function getTransactionMeta(): TransactionMeta {
      return {
        id: TRANSACTION_ID_MOCK,
        metamaskPay: { source: SOLANA_PAY_SOURCE_MOCK },
        status: 'unapproved',
        txParams: {
          from: '0x1234567890123456789012345678901234567890',
        },
      } as TransactionMeta;
    }

    function getExecution(
      overrides: Partial<MetamaskPaySolanaExecution> = {},
    ): MetamaskPaySolanaExecution {
      return {
        atomicProductActionIncluded: false,
        atomicProductActionRequired: false,
        followUpStatus: 'not-required',
        notificationStatus: 'not-ready',
        phase: 'ready',
        relayStatus: 'not-observed',
        requestId: 'relay-request-123',
        requiresNonAtomicFollowUp: false,
        sourceAmountRaw: '1000000',
        sourceChainId: SOLANA_CHAIN_ID,
        sourceStatus: 'not-observed',
        sourceWalletAccountId: 'wallet-account-uuid',
        ...overrides,
      } as MetamaskPaySolanaExecution;
    }

    function getControllerState(): Partial<TransactionPayControllerState> {
      return {
        transactionData: {
          [TRANSACTION_ID_MOCK]: {
            isLoading: false,
            tokens: [
              {
                address: TARGET_TOKEN,
                allowUnderMinimum: false,
                amountFiat: '1',
                amountHuman: '1',
                amountRaw: '900000',
                amountUsd: '1',
                balanceFiat: '0',
                balanceHuman: '0',
                balanceRaw: '0',
                balanceUsd: '0',
                chainId: '0xa4b1' as Hex,
                decimals: 6,
                skipIfBalance: false,
                symbol: 'USDC',
              },
            ],
          },
        },
      };
    }

    function applyTransactionUpdates(transaction: TransactionMeta): void {
      getTransactionMock.mockReturnValue(transaction);
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [transaction],
      });
      updateTransactionMock.mockImplementation((_request, update) => {
        update(transaction);
      });
    }

    it('fails closed when admitting a new Solana execution while rollout is disabled', async () => {
      const transaction = getTransactionMeta();
      applyTransactionUpdates(transaction);
      isSolanaPayEnabledMock.mockReturnValue(false);
      const controller = createController({
        solana: getSolanaCallbacks(),
        state: getControllerState(),
      });

      await expect(
        controller.getSolanaPayQuote({
          sourceAmountRaw: '1000000',
          sourceWalletAccountId: 'wallet-account-uuid',
          transactionId: TRANSACTION_ID_MOCK,
        }),
      ).rejects.toThrow('Solana Pay is disabled');
      expect(fetchRelaySolanaQuoteMock).not.toHaveBeenCalled();
      expect(transaction.metamaskPay?.solanaExecution).toBeUndefined();
    });

    it('continues an admitted Solana execution after rollout is disabled', async () => {
      const transaction = getTransactionMeta();
      const signAndSendTransaction = jest.fn().mockResolvedValue({
        outcome: 'submitted',
        transactionId: SOLANA_TRANSACTION_ID,
      });
      applyTransactionUpdates(transaction);
      const controller = createController({
        solana: getSolanaCallbacks({ signAndSendTransaction }),
        state: getControllerState(),
      });
      await controller.getSolanaPayQuote({
        sourceAmountRaw: '1000000',
        sourceWalletAccountId: 'wallet-account-uuid',
        transactionId: TRANSACTION_ID_MOCK,
      });
      isSolanaPayEnabledMock.mockReturnValue(false);

      await controller.submitSolanaPay(TRANSACTION_ID_MOCK);

      expect(signAndSendTransaction).toHaveBeenCalledTimes(1);
      expect(transaction.metamaskPay?.solanaExecution?.phase).toBe('submitted');
    });

    it('exposes privacy-safe support diagnostics for the transaction-owned execution', () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: {
          ...SOLANA_PAY_SOURCE_MOCK,
          sourceAccountId:
            `${SOLANA_CHAIN_ID}:private-account` as CaipAccountId,
        },
        solanaExecution: getExecution({
          phase: 'submitted',
          relayFailureReason: 'raw provider reason',
          relayStatus: 'failure',
          sourceFailureReason: 'raw source reason',
          sourceStatus: 'confirmed',
          sourceTransactionId: 'private-signature',
          targetTransactionId: 'private-target-hash',
        }),
      };
      applyTransactionUpdates(transaction);
      createController();

      const diagnostic = messenger.call(
        'TransactionPayController:getSolanaPaySupportDiagnostics',
        TRANSACTION_ID_MOCK,
      );

      expect(diagnostic).toStrictEqual({
        errorCode: 'settlement_failed',
        followUpStatus: 'not-required',
        followUpTransactionIdPresent: false,
        notificationStatus: 'not-ready',
        outcome: 'relay-failed',
        phase: 'submitted',
        provider: 'relay',
        relayStatus: 'failure',
        requestIdPresent: true,
        sourceAssetClass: 'token',
        sourceStatus: 'confirmed',
        sourceTransactionIdPresent: true,
        targetTransactionIdPresent: true,
      });
      expect(JSON.stringify(diagnostic)).not.toContain('private');
      expect(JSON.stringify(diagnostic)).not.toContain('raw');
    });

    it('stores the first durable checkpoint only on transaction metadata', async () => {
      const transaction = getTransactionMeta();
      const solana = getSolanaCallbacks();
      applyTransactionUpdates(transaction);
      const controller = createController({
        solana,
        state: getControllerState(),
      });

      const quote = await controller.getSolanaPayQuote({
        sourceAmountRaw: '1000000',
        sourceWalletAccountId: 'wallet-account-uuid',
        transactionId: TRANSACTION_ID_MOCK,
      });

      expect(controller.state).not.toHaveProperty('payIntents');
      expect(transaction.metamaskPay?.solanaExecution).toMatchObject({
        phase: 'ready',
        requestId: 'relay-request-123',
        sourceAmountRaw: '1000000',
        sourceChainId: SOLANA_CHAIN_ID,
        sourceWalletAccountId: 'wallet-account-uuid',
      });
      expect(solana.getPreflight).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'wallet-account-uuid',
          caipAccountId: SOLANA_ACCOUNT_ID,
          scope: SOLANA_CHAIN_ID,
        }),
      );
      expect(quote.route.targetAmountMinimum).toBe('900000');
    });

    it.each([
      ['atomic-product', undefined, true, false],
      ['money-account', PaymentOverride.MoneyAccount, false, true],
    ] as const)(
      'derives %s execution policy at quote time',
      async (
        _name,
        paymentOverride,
        atomicProductActionIncluded,
        requiresFollowUp,
      ) => {
        const transaction = getTransactionMeta();
        transaction.type = 'predictDeposit';
        applyTransactionUpdates(transaction);
        const state = getControllerState();
        const transactionData = state.transactionData?.[TRANSACTION_ID_MOCK];
        if (!transactionData) {
          throw new Error('Missing test transaction data');
        }
        if (paymentOverride) {
          transactionData.atomic = false;
          transactionData.paymentOverride = paymentOverride;
        }
        const controller = createController({
          getDelegationTransaction: jest.fn().mockResolvedValue({
            data: '0x1234',
            to: '0x9876543210987654321098765432109876543210',
            value: '0x0',
          }),
          solana: getSolanaCallbacks(),
          state,
        });

        await controller.getSolanaPayQuote({
          sourceAmountRaw: '1000000',
          sourceWalletAccountId: 'wallet-account-uuid',
          transactionId: TRANSACTION_ID_MOCK,
        });

        expect(transaction.metamaskPay?.solanaExecution).toMatchObject({
          atomicProductActionIncluded,
          atomicProductActionRequired: !requiresFollowUp,
          requiresNonAtomicFollowUp: requiresFollowUp,
        });
      },
    );

    it('checkpoints before one source broadcast and never signs during observation', async () => {
      const transaction = getTransactionMeta();
      const signAndSendTransaction = jest.fn().mockImplementation(() => {
        expect(transaction.metamaskPay?.solanaExecution?.phase).toBe(
          'attempting',
        );
        return {
          outcome: 'submitted',
          transactionId: SOLANA_TRANSACTION_ID,
        };
      });
      applyTransactionUpdates(transaction);
      const controller = createController({
        solana: getSolanaCallbacks({ signAndSendTransaction }),
        state: getControllerState(),
      });
      await controller.getSolanaPayQuote({
        sourceAmountRaw: '1000000',
        sourceWalletAccountId: 'wallet-account-uuid',
        transactionId: TRANSACTION_ID_MOCK,
      });

      await controller.submitSolanaPay(TRANSACTION_ID_MOCK);
      await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(signAndSendTransaction).toHaveBeenCalledTimes(1);
      expect(transaction.metamaskPay?.solanaExecution).toMatchObject({
        phase: 'submitted',
        sourceTransactionId: SOLANA_TRANSACTION_ID,
      });
    });

    it.each([
      ['user-rejected', 'user-rejected'],
      ['not-submitted', 'not-submitted'],
      ['ambiguous', 'unknown'],
    ] as const)(
      'persists the discriminated %s source outcome as %s',
      async (outcome, phase) => {
        const transaction = getTransactionMeta();
        applyTransactionUpdates(transaction);
        const controller = createController({
          solana: getSolanaCallbacks({
            signAndSendTransaction: jest.fn().mockResolvedValue({ outcome }),
          }),
          state: getControllerState(),
        });
        await controller.getSolanaPayQuote({
          sourceAmountRaw: '1000000',
          sourceWalletAccountId: 'wallet-account-uuid',
          transactionId: TRANSACTION_ID_MOCK,
        });
        if (outcome === 'ambiguous') {
          getRelayStatusMock.mockResolvedValue({
            destinationChainId: 42161,
            inTxHashes: [],
            originChainId: 792703809,
            status: 'waiting',
            txHashes: [],
            updatedAt: 1,
          });
        }

        await controller.submitSolanaPay(TRANSACTION_ID_MOCK);

        expect(transaction.metamaskPay?.solanaExecution?.phase).toBe(phase);
      },
    );

    it('notifies Relay indexing without invoking source submission', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: {
          atomicProductActionIncluded: false,
          atomicProductActionRequired: false,
          followUpStatus: 'not-required',
          notificationStatus: 'failure',
          phase: 'submitted',
          relayStatus: 'pending',
          requestId: 'relay-request-123',
          requiresNonAtomicFollowUp: false,
          sourceAmountRaw: '1000000',
          sourceChainId: SOLANA_CHAIN_ID,
          sourceStatus: 'pending',
          sourceTransactionId: SOLANA_TRANSACTION_ID,
          sourceWalletAccountId: 'wallet-account-uuid',
        },
      };
      const signAndSendTransaction = jest.fn();
      applyTransactionUpdates(transaction);
      const controller = createController({
        solana: getSolanaCallbacks({ signAndSendTransaction }),
      });

      const status =
        await controller.notifyRelayOfSolanaTransaction(TRANSACTION_ID_MOCK);

      expect(notifyRelayTransactionMock).toHaveBeenCalledWith({
        chainId: '792703809',
        requestId: 'relay-request-123',
        txHash: SOLANA_TRANSACTION_ID,
      });
      expect(signAndSendTransaction).not.toHaveBeenCalled();
      expect(status.notificationStatus).toBe('success');
    });

    it('publishes and deduplicates privacy-safe Solana lifecycle transitions', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution({
          notificationStatus: 'success',
          phase: 'submitted',
          relayStatus: 'pending',
          sourceStatus: 'pending',
          sourceTransactionId: SOLANA_TRANSACTION_ID,
        }),
      };
      applyTransactionUpdates(transaction);
      const listener = jest.fn();
      messenger.subscribe(
        'TransactionPayController:solanaPayLifecycle',
        listener,
      );
      const controller = createController({
        solana: getSolanaCallbacks({
          getTransactionStatus: jest.fn().mockResolvedValue('confirmed'),
        }),
      });

      await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);
      await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        followUpStatus: 'not-required',
        followUpTransactionIdPresent: false,
        isRecovery: false,
        notificationStatus: 'success',
        outcome: 'submitted',
        phase: 'submitted',
        provider: 'relay',
        relayStatus: 'pending',
        requestIdPresent: true,
        sourceAssetClass: 'token',
        sourceStatus: 'confirmed',
        sourceTransactionIdPresent: true,
        targetTransactionIdPresent: false,
      });
      expect(JSON.stringify(listener.mock.calls)).not.toContain(
        SOLANA_TRANSACTION_ID,
      );
      expect(JSON.stringify(listener.mock.calls)).not.toContain(
        'relay-request-123',
      );
    });

    it('recovers by scanning transaction metadata without signing', async () => {
      const transaction = getTransactionMeta();
      transaction.status = 'submitted';
      transaction.isExternalPublish = true;
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: {
          atomicProductActionIncluded: true,
          atomicProductActionRequired: true,
          followUpStatus: 'not-required',
          notificationStatus: 'success',
          phase: 'unknown',
          relayStatus: 'pending',
          requestId: 'relay-request-123',
          requiresNonAtomicFollowUp: false,
          sourceAmountRaw: '1000000',
          sourceChainId: SOLANA_CHAIN_ID,
          sourceStatus: 'unknown',
          sourceWalletAccountId: 'wallet-account-uuid',
        },
      };
      const signAndSendTransaction = jest.fn();
      applyTransactionUpdates(transaction);
      getRelayStatusMock.mockResolvedValue({
        destinationChainId: 42161,
        inTxHashes: [SOLANA_TRANSACTION_ID],
        originChainId: 792703809,
        status: 'success',
        txHashes: ['0xtarget'],
        updatedAt: 1,
      });
      const lifecycleListener = jest.fn();
      messenger.subscribe(
        'TransactionPayController:solanaPayLifecycle',
        lifecycleListener,
      );
      const controller = createController({
        solana: getSolanaCallbacks({
          getTransactionStatus: jest.fn().mockResolvedValue('confirmed'),
          signAndSendTransaction,
        }),
      });
      isSolanaPayEnabledMock.mockReturnValue(false);

      const statuses = await controller.recoverSolanaPayStatus();

      expect(statuses[TRANSACTION_ID_MOCK].outcome).toBe('succeeded');
      expect(lifecycleListener).toHaveBeenLastCalledWith(
        expect.objectContaining({ isRecovery: true, outcome: 'succeeded' }),
      );
      expect(signAndSendTransaction).not.toHaveBeenCalled();
      expect(confirmTransactionMock).toHaveBeenCalledWith(TRANSACTION_ID_MOCK);
    });

    it('preserves a terminal Relay observation when status is unavailable', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution({
          phase: 'submitted',
          relayStatus: 'success',
          sourceStatus: 'pending',
          sourceTransactionId: SOLANA_TRANSACTION_ID,
        }),
      };
      applyTransactionUpdates(transaction);
      getRelayStatusMock.mockRejectedValue(new Error('Relay unavailable'));
      const controller = createController({ solana: getSolanaCallbacks() });

      const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(status.relayStatus).toBe('success');
    });

    it('keeps the Money Account destination follow-up separate from source submission', async () => {
      const transaction = getTransactionMeta();
      transaction.status = 'submitted';
      transaction.isExternalPublish = true;
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution({
          followUpStatus: 'not-started',
          notificationStatus: 'success',
          phase: 'submitted',
          relayStatus: 'success',
          requiresNonAtomicFollowUp: true,
          sourceStatus: 'confirmed',
          sourceTransactionId: SOLANA_TRANSACTION_ID,
        }),
      };
      const submitNonAtomicFollowUp = jest.fn().mockResolvedValue({
        outcome: 'submitted',
        transactionId: 'follow-up-123',
      });
      applyTransactionUpdates(transaction);
      getRelayStatusMock.mockResolvedValue({
        destinationChainId: 42161,
        inTxHashes: [SOLANA_TRANSACTION_ID],
        originChainId: 792703809,
        status: 'success',
        txHashes: ['0xtarget'],
        updatedAt: 1,
      });
      const controller = createController({
        solana: getSolanaCallbacks({
          getNonAtomicFollowUpStatus: jest.fn().mockResolvedValue('confirmed'),
          getTransactionStatus: jest.fn().mockResolvedValue('confirmed'),
          submitNonAtomicFollowUp,
        }),
      });

      const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(submitNonAtomicFollowUp).toHaveBeenCalledTimes(1);
      expect(status.followUpStatus).toBe('confirmed');
      expect(status.outcome).toBe('succeeded');
    });

    it.each([
      ['ambiguous', 'unknown'],
      ['not-submitted', 'failed'],
    ] as const)(
      'records Money Account follow-up outcome %s as %s',
      async (outcome, expectedStatus) => {
        const transaction = getTransactionMeta();
        transaction.metamaskPay = {
          source: SOLANA_PAY_SOURCE_MOCK,
          solanaExecution: getExecution({
            followUpStatus: 'not-started',
            phase: 'submitted',
            relayStatus: 'success',
            requiresNonAtomicFollowUp: true,
            sourceStatus: 'confirmed',
            sourceTransactionId: SOLANA_TRANSACTION_ID,
          }),
        };
        applyTransactionUpdates(transaction);
        getRelayStatusMock.mockResolvedValue({
          destinationChainId: 42161,
          inTxHashes: [SOLANA_TRANSACTION_ID],
          originChainId: 792703809,
          status: 'success',
          txHashes: [],
          updatedAt: 1,
        });
        const controller = createController({
          solana: getSolanaCallbacks({
            submitNonAtomicFollowUp: jest.fn().mockResolvedValue({ outcome }),
          }),
        });

        const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

        expect(status.followUpStatus).toBe(expectedStatus);
      },
    );

    it('records unavailable follow-up status as unknown', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution({
          followUpStatus: 'submitted',
          followUpTransactionId: 'follow-up-123',
          phase: 'submitted',
          relayStatus: 'success',
          requiresNonAtomicFollowUp: true,
          sourceStatus: 'confirmed',
          sourceTransactionId: SOLANA_TRANSACTION_ID,
        }),
      };
      applyTransactionUpdates(transaction);
      getRelayStatusMock.mockResolvedValue({
        destinationChainId: 42161,
        inTxHashes: [SOLANA_TRANSACTION_ID],
        originChainId: 792703809,
        status: 'success',
        txHashes: [],
        updatedAt: 1,
      });
      const controller = createController({
        solana: getSolanaCallbacks({
          getNonAtomicFollowUpStatus: jest
            .fn()
            .mockRejectedValue(new Error('Unavailable')),
        }),
      });

      const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(status.followUpStatus).toBe('unknown');
    });

    it('records unavailable Relay, source, notification, and follow-up observations', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution({
          followUpStatus: 'submitted',
          followUpTransactionId: 'follow-up-123',
          notificationStatus: 'failure',
          phase: 'submitted',
          relayStatus: 'pending',
          requiresNonAtomicFollowUp: true,
          sourceStatus: 'pending',
          sourceTransactionId: SOLANA_TRANSACTION_ID,
        }),
      };
      applyTransactionUpdates(transaction);
      getRelayStatusMock.mockRejectedValue(new Error('Relay unavailable'));
      notifyRelayTransactionMock.mockRejectedValue(
        new Error('Index unavailable'),
      );
      const controller = createController({
        solana: getSolanaCallbacks({
          getNonAtomicFollowUpStatus: jest
            .fn()
            .mockRejectedValue(new Error('Follow-up unavailable')),
          getTransactionStatus: jest
            .fn()
            .mockRejectedValue(new Error('Source unavailable')),
        }),
      });

      await controller.notifyRelayOfSolanaTransaction(TRANSACTION_ID_MOCK);
      const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(status.notificationStatus).toBe('failure');
      expect(status.relayStatus).toBe('unknown');
      expect(status.sourceStatus).toBe('unknown');
      expect(status.followUpStatus).toBe('submitted');
    });

    it.each([
      ['missing-transaction', 'Transaction not found'],
      ['missing-source', 'Solana Pay source missing'],
      ['invalid-source', 'Invalid Solana Pay source'],
      ['missing-execution', 'Solana execution missing'],
      ['chain-mismatch', 'Solana execution chain mismatch'],
    ])('rejects invalid persisted execution: %s', async (scenario, message) => {
      const transaction = getTransactionMeta();

      if (scenario === 'missing-transaction') {
        getTransactionMock.mockReturnValue(undefined);
      } else {
        if (scenario === 'missing-source') {
          transaction.metamaskPay = undefined;
        } else if (scenario === 'invalid-source') {
          transaction.metamaskPay = {
            source: {
              sourceAccountId: 'eip155:1:0x1234' as CaipAccountId,
              sourceAssetId: 'eip155:1/slip44:60' as CaipAssetType,
            },
          };
        } else if (scenario === 'chain-mismatch') {
          transaction.metamaskPay = {
            source: SOLANA_PAY_SOURCE_MOCK,
            solanaExecution: getExecution({ sourceChainId: 'solana:other' }),
          };
        }
        applyTransactionUpdates(transaction);
      }

      const controller = createController({ solana: getSolanaCallbacks() });

      await expect(
        controller.reconcileSolanaPay(TRANSACTION_ID_MOCK),
      ).rejects.toThrow(message);
    });

    it('rejects quote and submission precondition failures', async () => {
      const transaction = getTransactionMeta();
      applyTransactionUpdates(transaction);
      const controller = createController({
        solana: getSolanaCallbacks(),
        state: getControllerState(),
      });

      await expect(
        controller.submitSolanaPay(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('Solana execution missing');

      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution(),
      };
      await expect(
        controller.getSolanaPayQuote({
          sourceAmountRaw: '1000000',
          sourceWalletAccountId: 'wallet-account-uuid',
          transactionId: TRANSACTION_ID_MOCK,
        }),
      ).rejects.toThrow('Solana execution already exists');

      transaction.metamaskPay.solanaExecution = getExecution({
        phase: 'submitted',
        sourceTransactionId: SOLANA_TRANSACTION_ID,
      });
      expect(
        await controller.submitSolanaPay(TRANSACTION_ID_MOCK),
      ).toMatchObject({ phase: 'submitted' });
    });

    it('rejects notification without a submitted signature', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution(),
      };
      applyTransactionUpdates(transaction);
      const controller = createController({ solana: getSolanaCallbacks() });

      await expect(
        controller.notifyRelayOfSolanaTransaction(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('Missing Solana notification correlation');
    });

    it('rejects quote construction without transaction data', async () => {
      const transaction = getTransactionMeta();
      applyTransactionUpdates(transaction);
      const controller = createController({ solana: getSolanaCallbacks() });

      await expect(
        controller.getSolanaPayQuote({
          sourceAmountRaw: '1000000',
          sourceWalletAccountId: 'wallet-account-uuid',
          transactionId: TRANSACTION_ID_MOCK,
        }),
      ).rejects.toThrow('Transaction data missing');
    });

    it('rejects a mismatched exact-input provider source amount', async () => {
      const transaction = getTransactionMeta();
      applyTransactionUpdates(transaction);
      fetchRelaySolanaQuoteMock.mockResolvedValueOnce({
        ...SOLANA_QUOTE_MOCK,
        details: {
          ...SOLANA_QUOTE_MOCK.details,
          currencyIn: {
            ...SOLANA_QUOTE_MOCK.details.currencyIn,
            amount: '999999',
          },
        },
      });
      const controller = createController({
        solana: getSolanaCallbacks(),
        state: getControllerState(),
      });

      await expect(
        controller.getSolanaPayQuote({
          sourceAmountRaw: '1000000',
          sourceWalletAccountId: 'wallet-account-uuid',
          transactionId: TRANSACTION_ID_MOCK,
        }),
      ).rejects.toThrow('source amount mismatch');
    });

    it('rejects unaffordable source submission', async () => {
      const transaction = getTransactionMeta();
      applyTransactionUpdates(transaction);
      const controller = createController({
        solana: getSolanaCallbacks({
          getPreflight: jest.fn().mockResolvedValue({
            ...SOLANA_PREFLIGHT_MOCK,
            sourceBalanceRaw: '1',
          }),
        }),
        state: getControllerState(),
      });
      await controller.getSolanaPayQuote({
        sourceAmountRaw: '1000000',
        sourceWalletAccountId: 'wallet-account-uuid',
        transactionId: TRANSACTION_ID_MOCK,
      });

      await expect(
        controller.submitSolanaPay(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('not affordable');
    });

    it('rejects submission without its transient quote', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution(),
      };
      applyTransactionUpdates(transaction);
      const controller = createController({ solana: getSolanaCallbacks() });

      await expect(
        controller.submitSolanaPay(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('Missing Solana Pay quote');
    });

    it('rejects preflight without Solana callbacks', async () => {
      const transaction = getTransactionMeta();
      applyTransactionUpdates(transaction);
      const controller = createController({ state: getControllerState() });

      await expect(
        controller.getSolanaPayQuote({
          sourceAmountRaw: '1000000',
          sourceWalletAccountId: 'wallet-account-uuid',
          transactionId: TRANSACTION_ID_MOCK,
        }),
      ).rejects.toThrow('Solana callbacks missing');
    });

    it.each([
      ['source-failed', 'failed', 'pending', 'not-required'],
      ['relay-failed', 'confirmed', 'failure', 'not-required'],
      ['refunded', 'confirmed', 'refund', 'not-required'],
      ['follow-up-failed', 'confirmed', 'success', 'failed'],
    ] as const)(
      'fails an externally published parent for %s',
      async (outcome, sourceStatus, relayStatus, followUpStatus) => {
        const transaction = getTransactionMeta();
        transaction.status = 'submitted';
        transaction.isExternalPublish = true;
        transaction.metamaskPay = {
          source: SOLANA_PAY_SOURCE_MOCK,
          solanaExecution: getExecution({
            followUpStatus,
            phase: 'submitted',
            relayStatus,
            sourceStatus,
            sourceTransactionId: SOLANA_TRANSACTION_ID,
          }),
        };
        applyTransactionUpdates(transaction);
        const errorCodeByOutcome = {
          'follow-up-failed': 'follow_up_failed',
          refunded: 'settlement_refunded',
          'relay-failed': 'settlement_failed',
          'source-failed': 'source_transaction_failed',
        } as const;
        const relayStatusByOutcome = {
          'follow-up-failed': 'success',
          refunded: 'refund',
          'relay-failed': 'failure',
          'source-failed': 'pending',
        } as const;
        getRelayStatusMock.mockResolvedValue({
          destinationChainId: 42161,
          inTxHashes: [SOLANA_TRANSACTION_ID],
          originChainId: 792703809,
          status: relayStatusByOutcome[outcome],
          txHashes: [],
          updatedAt: 1,
        });
        const controller = createController({
          solana: getSolanaCallbacks({
            getTransactionStatus: jest.fn().mockResolvedValue(sourceStatus),
          }),
        });

        await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

        expect(failTransactionMock).toHaveBeenCalledWith(
          TRANSACTION_ID_MOCK,
          expect.objectContaining({ code: errorCodeByOutcome[outcome] }),
        );
      },
    );

    it.each([false, true])(
      'does not finalize a non-terminal parent with external publication %s',
      async (isExternalPublish) => {
        const transaction = getTransactionMeta();
        transaction.status = 'submitted';
        transaction.isExternalPublish = isExternalPublish;
        transaction.metamaskPay = {
          source: SOLANA_PAY_SOURCE_MOCK,
          solanaExecution: getExecution({
            phase: 'submitted',
            relayStatus: 'pending',
            sourceStatus: 'pending',
            sourceTransactionId: SOLANA_TRANSACTION_ID,
          }),
        };
        applyTransactionUpdates(transaction);
        const controller = createController({ solana: getSolanaCallbacks() });

        const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

        expect(status.outcome).toBe('submitted');
        expect(confirmTransactionMock).not.toHaveBeenCalled();
        expect(failTransactionMock).not.toHaveBeenCalled();
      },
    );

    it('returns the latest pending status when recovery reaches its timeout', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution({
          phase: 'submitted',
          relayStatus: 'pending',
          sourceStatus: 'pending',
          sourceTransactionId: SOLANA_TRANSACTION_ID,
        }),
      };
      applyTransactionUpdates(transaction);
      getRelayPollingTimeoutMock.mockReturnValue(1);
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [transaction],
      });
      const controller = createController({ solana: getSolanaCallbacks() });

      const statuses = await controller.recoverSolanaPayStatus();

      expect(statuses[TRANSACTION_ID_MOCK].outcome).toBe('submitted');
    });

    it('requires the Money Account follow-up submission callback', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution({
          followUpStatus: 'not-started',
          phase: 'submitted',
          relayStatus: 'success',
          requiresNonAtomicFollowUp: true,
          sourceStatus: 'confirmed',
          sourceTransactionId: SOLANA_TRANSACTION_ID,
        }),
      };
      applyTransactionUpdates(transaction);
      getRelayStatusMock.mockResolvedValue({
        destinationChainId: 42161,
        inTxHashes: [SOLANA_TRANSACTION_ID],
        originChainId: 792703809,
        status: 'success',
        txHashes: [],
        updatedAt: 1,
      });
      const controller = createController({ solana: getSolanaCallbacks() });
      await expect(
        controller.reconcileSolanaPay(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('follow-up callback missing');
    });

    it('requires the Money Account follow-up status callback', async () => {
      const transaction = getTransactionMeta();
      transaction.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution({
          followUpStatus: 'submitted',
          followUpTransactionId: 'follow-up-123',
          phase: 'submitted',
          relayStatus: 'success',
          requiresNonAtomicFollowUp: true,
          sourceStatus: 'confirmed',
          sourceTransactionId: SOLANA_TRANSACTION_ID,
        }),
      };
      applyTransactionUpdates(transaction);
      getRelayStatusMock.mockResolvedValue({
        destinationChainId: 42161,
        inTxHashes: [SOLANA_TRANSACTION_ID],
        originChainId: 792703809,
        status: 'success',
        txHashes: [],
        updatedAt: 1,
      });
      const controller = createController({ solana: getSolanaCallbacks() });

      await expect(
        controller.reconcileSolanaPay(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('follow-up status callback missing');
    });

    it('skips records without execution and records already terminal', async () => {
      const withoutExecution = getTransactionMeta();
      const terminal = getTransactionMeta();
      terminal.id = 'terminal';
      terminal.metamaskPay = {
        source: SOLANA_PAY_SOURCE_MOCK,
        solanaExecution: getExecution({ phase: 'user-rejected' }),
      };
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [withoutExecution, terminal],
      });
      const controller = createController({ solana: getSolanaCallbacks() });

      expect(await controller.recoverSolanaPayStatus()).toStrictEqual({});
    });
  });

  describe('updatePaymentToken', () => {
    it('calls util', () => {
      createController().updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      expect(updatePaymentTokenMock).toHaveBeenCalledWith(
        {
          transactionId: TRANSACTION_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
          chainId: CHAIN_ID_MOCK,
        },
        {
          messenger,
          updateTransactionData: expect.any(Function),
        },
      );
    });
  });

  describe('updateFiatPayment', () => {
    it('calls util', () => {
      const callback = jest.fn();

      createController().updateFiatPayment({
        transactionId: TRANSACTION_ID_MOCK,
        callback,
      });

      expect(updateFiatPaymentMock).toHaveBeenCalledWith(
        {
          transactionId: TRANSACTION_ID_MOCK,
          callback,
        },
        {
          messenger,
          updateTransactionData: expect.any(Function),
        },
      );
    });

    it('is callable via messenger action handler', () => {
      const callback = jest.fn();

      createController();

      messenger.call('TransactionPayController:updateFiatPayment', {
        transactionId: TRANSACTION_ID_MOCK,
        callback,
      });

      expect(updateFiatPaymentMock).toHaveBeenCalledWith(
        {
          transactionId: TRANSACTION_ID_MOCK,
          callback,
        },
        {
          messenger,
          updateTransactionData: expect.any(Function),
        },
      );
    });
  });

  describe('setTransactionConfig', () => {
    it('updates isMaxAmount in state', () => {
      const controller = createController();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isMaxAmount = true;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].isMaxAmount,
      ).toBe(true);
    });

    it('updates isPostQuote in state', () => {
      const controller = createController();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isPostQuote = true;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].isPostQuote,
      ).toBe(true);
    });

    it('updates isHyperliquidSource in state', () => {
      const controller = createController();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isHyperliquidSource = true;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]
          .isHyperliquidSource,
      ).toBe(true);
    });

    it('updates paymentOverride in state', () => {
      const controller = createController();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.paymentOverride = PaymentOverride.MoneyAccount;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentOverride,
      ).toBe(PaymentOverride.MoneyAccount);
    });

    it('triggers source amounts and quotes update when only isPostQuote changes', () => {
      const controller = createController();

      // First call creates the entry with defaults
      controller.setTransactionConfig(TRANSACTION_ID_MOCK, () => {
        // no-op, just initializes
      });

      updateSourceAmountsMock.mockClear();
      updateQuotesMock.mockClear();

      // Second call only changes isPostQuote
      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isPostQuote = true;
      });

      expect(updateSourceAmountsMock).toHaveBeenCalledTimes(1);
      expect(updateQuotesMock).toHaveBeenCalledTimes(1);
    });

    it('triggers source amounts and quotes update when accountOverride changes', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, () => {
        // no-op, just initializes
      });

      updateSourceAmountsMock.mockClear();
      updateQuotesMock.mockClear();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(updateSourceAmountsMock).toHaveBeenCalledTimes(1);
      expect(updateQuotesMock).toHaveBeenCalledTimes(1);
    });

    it('updates refundTo in state', () => {
      const controller = createController();
      const refundTo = '0xdeadbeef00000000000000000000000000000001' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.refundTo = refundTo;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].refundTo,
      ).toBe(refundTo);
    });

    it('clears refundTo when set to undefined', () => {
      const controller = createController();
      const refundTo = '0xdeadbeef00000000000000000000000000000001' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.refundTo = refundTo;
      });

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.refundTo = undefined;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].refundTo,
      ).toBeUndefined();
    });

    it('updates accountOverride in state', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].accountOverride,
      ).toBe(accountOverride);
    });

    it('clears paymentToken when accountOverride changes', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeUndefined();
    });

    it('does not clear paymentToken when accountOverride is unchanged', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();
    });

    it('does not clear paymentToken when accountOverride changes if isPostQuote is true', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isPostQuote = true;
      });

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();
    });

    it('updates multiple config properties at once', () => {
      const controller = createController();
      const refundTo = '0xdeadbeef00000000000000000000000000000001' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isMaxAmount = true;
        config.isPostQuote = true;
        config.refundTo = refundTo;
      });

      const transactionData =
        controller.state.transactionData[TRANSACTION_ID_MOCK];
      expect(transactionData.isMaxAmount).toBe(true);
      expect(transactionData.isPostQuote).toBe(true);
      expect(transactionData.refundTo).toBe(refundTo);
    });
  });

  describe('getDelegationTransaction', () => {
    it('delegates to the callback', async () => {
      const resultMock = { data: '0x1', to: '0x2', value: '0x3' };
      const getDelegationTransactionMock = jest
        .fn()
        .mockResolvedValue(resultMock);

      new TransactionPayController({
        getDelegationTransaction: getDelegationTransactionMock,
        messenger,
      });

      const result = await messenger.call(
        'TransactionPayController:getDelegationTransaction',
        { transaction: TRANSACTION_META_MOCK },
      );

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: TRANSACTION_META_MOCK,
      });
      expect(result).toBe(resultMock);
    });
  });

  describe('getPaymentOverrideData', () => {
    it('delegates to the callback', async () => {
      const resultMock = {
        calls: [{ to: '0xdef' as const, data: '0xabc' as const }],
      };
      const getPaymentOverrideDataMock = jest
        .fn()
        .mockResolvedValue(resultMock);

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getPaymentOverrideData: getPaymentOverrideDataMock,
        messenger,
      });

      const requestMock = {
        amount: '1.5',
        transaction: TRANSACTION_META_MOCK,
        transactionData: { isLoading: false, tokens: [] },
      };

      const result = await messenger.call(
        'TransactionPayController:getPaymentOverrideData',
        requestMock,
      );

      expect(getPaymentOverrideDataMock).toHaveBeenCalledWith(requestMock);
      expect(result).toStrictEqual(resultMock);
    });

    it('returns empty array when no callback is configured', async () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      const result = await messenger.call(
        'TransactionPayController:getPaymentOverrideData',
        {
          amount: '1.5',
          transaction: TRANSACTION_META_MOCK,
          transactionData: { isLoading: false, tokens: [] },
        },
      );

      expect(result).toStrictEqual({ calls: [] });
    });
  });

  describe('getAmountData', () => {
    it('delegates to the callback', async () => {
      const resultMock = {
        updates: [{ nestedTransactionIndex: 0, data: '0xabc' as const }],
      };
      const getAmountDataMock = jest.fn().mockResolvedValue(resultMock);

      new TransactionPayController({
        getAmountData: getAmountDataMock,
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      const requestMock = {
        amount: '5000000',
        transaction: TRANSACTION_META_MOCK,
      };

      const result = await messenger.call(
        'TransactionPayController:getAmountData',
        requestMock,
      );

      expect(getAmountDataMock).toHaveBeenCalledWith(requestMock);
      expect(result).toStrictEqual(resultMock);
    });

    it('returns empty updates when no callback is configured', async () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      const result = await messenger.call(
        'TransactionPayController:getAmountData',
        {
          amount: '5000000',
          transaction: TRANSACTION_META_MOCK,
        },
      );

      expect(result).toStrictEqual({ updates: [] });
    });
  });

  describe('getFiatOptions', () => {
    it('returns configured fiat options', () => {
      const fiatOptions = {
        testFundingSource: '0x1111111111111111111111111111111111111111' as Hex,
        testAmountOverride: '0.1',
      };

      createController({ fiatOptions });

      const result = messenger.call('TransactionPayController:getFiatOptions');

      expect(result).toBe(fiatOptions);
    });

    it('returns undefined when no fiat options are configured', () => {
      createController();

      const result = messenger.call('TransactionPayController:getFiatOptions');

      expect(result).toBeUndefined();
    });
  });

  describe('polymarket callbacks', () => {
    const EOA_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
    const DEPOSIT_WALLET_MOCK =
      '0x2222222222222222222222222222222222222222' as Hex;
    const SOURCE_HASH_MOCK: Hex = `0x${'aa'.repeat(32)}`;

    it('delegates polymarketGetDepositWalletAddress to the callback', async () => {
      const getDepositWalletAddressMock = jest
        .fn()
        .mockResolvedValue(DEPOSIT_WALLET_MOCK);

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
        polymarket: {
          getDepositWalletAddress: getDepositWalletAddressMock,
          submitDepositWalletBatch: jest.fn(),
        },
      });

      const result = await messenger.call(
        'TransactionPayController:polymarketGetDepositWalletAddress',
        { eoa: EOA_MOCK },
      );

      expect(getDepositWalletAddressMock).toHaveBeenCalledWith({
        eoa: EOA_MOCK,
      });
      expect(result).toBe(DEPOSIT_WALLET_MOCK);
    });

    it('delegates polymarketSubmitDepositWalletBatch to the callback', async () => {
      const submitDepositWalletBatchMock = jest
        .fn()
        .mockResolvedValue({ sourceHash: SOURCE_HASH_MOCK });

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
        polymarket: {
          getDepositWalletAddress: jest.fn(),
          submitDepositWalletBatch: submitDepositWalletBatchMock,
        },
      });

      const params = {
        eoa: EOA_MOCK,
        depositWallet: DEPOSIT_WALLET_MOCK,
        calls: [],
      };
      const result = await messenger.call(
        'TransactionPayController:polymarketSubmitDepositWalletBatch',
        params,
      );

      expect(submitDepositWalletBatchMock).toHaveBeenCalledWith(params);
      expect(result).toStrictEqual({ sourceHash: SOURCE_HASH_MOCK });
    });

    it('throws if polymarketGetDepositWalletAddress is invoked without callbacks supplied', () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      expect(() =>
        messenger.call(
          'TransactionPayController:polymarketGetDepositWalletAddress',
          { eoa: EOA_MOCK },
        ),
      ).toThrow('Polymarket callbacks missing');
    });

    it('throws if polymarketSubmitDepositWalletBatch is invoked without callbacks supplied', () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      expect(() =>
        messenger.call(
          'TransactionPayController:polymarketSubmitDepositWalletBatch',
          { eoa: EOA_MOCK, depositWallet: DEPOSIT_WALLET_MOCK, calls: [] },
        ),
      ).toThrow('Polymarket callbacks missing');
    });
  });

  describe('getStrategy Action', () => {
    it('returns relay if no callback', async () => {
      createController();

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Relay);
    });

    it('returns callback value if provided', async () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getStrategy: (): TransactionPayStrategy =>
          TransactionPayStrategy.Across,
        messenger,
      });

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);
    });

    it('does not query feature flag strategy order when getStrategies callback returns values', async () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getStrategies: (): TransactionPayStrategy[] => [
          TransactionPayStrategy.Across,
        ],
        messenger,
      });

      getStrategyOrderMock.mockClear();

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);

      expect(getStrategyOrderMock).not.toHaveBeenCalled();
    });

    it('returns relay if getStrategies callback returns empty', async () => {
      getStrategyOrderMock.mockReturnValue([TransactionPayStrategy.Across]);

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getStrategies: (): TransactionPayStrategy[] => [],
        messenger,
      });

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);
    });

    it('falls back to feature flag if getStrategies callback returns invalid first value', async () => {
      getStrategyOrderMock.mockReturnValue([TransactionPayStrategy.Across]);

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getStrategies: (): TransactionPayStrategy[] =>
          [undefined] as unknown as TransactionPayStrategy[],
        messenger,
      });

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);
    });

    it('returns default strategy order when no callbacks and no strategy order feature flag', async () => {
      getStrategyOrderMock.mockReturnValue([TransactionPayStrategy.Relay]);

      createController();

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Relay);
    });

    it('returns strategy from feature flag when no callbacks are provided', async () => {
      getStrategyOrderMock.mockReturnValue([
        TransactionPayStrategy.Across,
        TransactionPayStrategy.Relay,
      ]);

      createController();

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);
    });

    it('passes payment token route args into feature flag fallback', async () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
      });

      const transactionMeta = {
        id: TRANSACTION_ID_MOCK,
        type: 'perpsDeposit',
      } as TransactionMeta;

      messenger.call('TransactionPayController:getStrategy', transactionMeta);

      expect(getStrategyOrderMock).toHaveBeenCalledWith(
        messenger,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
        'perpsDeposit',
        undefined,
      );
    });

    it('passes fiat payment method ID into getStrategyOrder', async () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
        data.fiatPayment = { selectedPaymentMethodId: 'card-123' };
      });

      const transactionMeta = {
        id: TRANSACTION_ID_MOCK,
        type: 'perpsDeposit',
      } as TransactionMeta;

      messenger.call('TransactionPayController:getStrategy', transactionMeta);

      expect(getStrategyOrderMock).toHaveBeenCalledWith(
        messenger,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
        'perpsDeposit',
        'card-123',
      );
    });
  });

  describe('transaction data update', () => {
    it('updates state', () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.sourceAmounts = [
          { sourceAmountHuman: '1.23' } as TransactionPaySourceAmount,
        ];
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toStrictEqual({
        fiatPayment: {},
        isLoading: false,
        sourceAmounts: [{ sourceAmountHuman: '1.23' }],
        tokens: [],
      });
    });

    it('updates source amounts and quotes', () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.sourceAmounts = [
          { sourceAmountHuman: '1.23' } as TransactionPaySourceAmount,
        ];
      });

      expect(updateSourceAmountsMock).toHaveBeenCalledWith(
        TRANSACTION_ID_MOCK,
        expect.objectContaining({
          sourceAmounts: [{ sourceAmountHuman: '1.23' }],
        }),
        messenger,
        undefined,
      );

      expect(updateQuotesMock).toHaveBeenCalledWith({
        getStrategies: expect.any(Function),
        messenger,
        transactionData: expect.objectContaining({
          sourceAmounts: [{ sourceAmountHuman: '1.23' }],
        }),
        transactionId: TRANSACTION_ID_MOCK,
        updateTransactionData: expect.any(Function),
      });
    });

    it('forwards getBalance callback to updateSourceAmounts', () => {
      const getBalance = jest.fn().mockReturnValue({ balanceRaw: '9900000' });
      const controller = createController({ getBalance });

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.isMaxAmount = true;
      });

      expect(updateSourceAmountsMock).toHaveBeenCalledWith(
        TRANSACTION_ID_MOCK,
        expect.any(Object),
        messenger,
        getBalance,
      );
    });
  });

  describe('transaction data removal', () => {
    it('removes state', async () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.sourceAmounts = [
          { sourceAmountHuman: '1.23' } as TransactionPaySourceAmount,
        ];
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toBeDefined();

      const removeTransactionDataCallback =
        subscribeTransactionChangesMock.mock.calls[0][2];

      removeTransactionDataCallback(TRANSACTION_ID_MOCK);

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toBeUndefined();
    });

    it('removes only controller-owned transient data', () => {
      const controller = createController();
      controller.setPaySource({
        transactionId: TRANSACTION_ID_MOCK,
        source: SOLANA_PAY_SOURCE_MOCK,
      });

      const transaction = {} as TransactionMeta;
      updateTransactionMock.mock.calls[0][1](transaction);

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });
      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];
      updateTransactionData(TRANSACTION_ID_MOCK, () => undefined);

      const removeTransactionDataCallback =
        subscribeTransactionChangesMock.mock.calls[0][2];
      removeTransactionDataCallback(TRANSACTION_ID_MOCK);

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toBeUndefined();
      expect(transaction.metamaskPay?.source).toStrictEqual(
        SOLANA_PAY_SOURCE_MOCK,
      );
    });
  });

  describe('fiat token selection', () => {
    const FIAT_ASSET_MOCK = {
      address: '0x0000000000000000000000000000000000001010' as Hex,
      chainId: '0x89' as Hex,
    };

    function getControllerAndUpdateTransactionData(): {
      controller: TransactionPayController;
      updateTransactionData: UpdateTransactionDataCallback;
    } {
      const controller = createController();
      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });
      return {
        controller,
        updateTransactionData:
          updatePaymentTokenMock.mock.calls[0][1].updateTransactionData,
      };
    }

    it('does not set caipAssetId when only fiat amount changes', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { amountFiat: '100' };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });

    it('does not set caipAssetId when payment method changes (set by quote functions instead)', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { selectedPaymentMethodId: 'card-123' };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });

    it('triggers quote update when fiat payment changes', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);

      const { updateTransactionData } = getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { amountFiat: '100' };
      });

      expect(updateQuotesMock).toHaveBeenCalledTimes(1);
    });

    it('does not set caipAssetId when transaction is not found', () => {
      getTransactionMock.mockReturnValue(undefined);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { selectedPaymentMethodId: 'card-123' };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });

    it('does not set caipAssetId when fiat asset cannot be derived', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(undefined as never);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { selectedPaymentMethodId: 'card-123' };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });

    it('does not set caipAssetId when fiat payment does not change', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.sourceAmounts = [
          { sourceAmountHuman: '1.23' } as TransactionPaySourceAmount,
        ];
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });
  });
});
