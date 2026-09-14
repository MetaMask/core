/* eslint-disable no-new */

import { deriveStateFromMetadata } from '@metamask/base-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
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
  TransactionPayControllerOptions,
  TransactionPaySource,
  TransactionPaySourceAmount,
  UpdateTransactionDataCallback,
} from './types.js';
import { getStrategyOrder } from './utils/feature-flags.js';
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
const SOLANA_CHAIN_ID =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId;
const SOLANA_ACCOUNT_ID =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z' as CaipAccountId;
const SOLANA_ASSET_ID =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as CaipAssetType;
const SOLANA_TRANSACTION_ID =
  '5KtPn3tE7mWcMgvBvXhXxF9xQmP9xNj7wT6oYxj3BbJpfK2p5yhx2S1QnW8gQwJm7U3F5v9hQmXk8b2mJ7dP4c';
const SOLANA_PAY_INTENT_MOCK: TransactionPayIntent = {
  version: 1,
  sourceAccountId: SOLANA_ACCOUNT_ID,
  sourceAssetId: SOLANA_ASSET_ID,
  sourceChainId: SOLANA_CHAIN_ID,
  requestId: 'relay-request-123',
  sourceTransactionId: SOLANA_TRANSACTION_ID,
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
          check: {
            endpoint:
              'https://api.relay.link/intents/status/v3?requestId=relay-request-123',
            method: 'GET',
          },
          data: {
            chainId: 792703809,
            instructions: [
              {
                programId: '11111111111111111111111111111111',
                keys: [
                  {
                    pubkey: '7Ec4QeG8wF3RnTjHDrTuYP8hVV7WYuPFyM4hZUodkG6Z',
                    isSigner: true,
                    isWritable: true,
                  },
                ],
                data: '02000000',
              },
            ],
            addressLookupTableAddresses: [
              'HZaWndaNWHFDd9Dhk5PQcJmR4aLQv3Y5nVf2gQmMEz2x',
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
  const getTransactionMock = jest.mocked(getTransaction);
  const updateTransactionMock = jest.mocked(updateTransaction);
  const updateSourceAmountsMock = jest.mocked(updateSourceAmounts);
  const updateQuotesMock = jest.mocked(updateQuotes);
  const subscribeTransactionChangesMock = jest.mocked(
    subscribeTransactionChanges,
  );
  const subscribeAssetChangesMock = jest.mocked(subscribeAssetChanges);
  const getStrategyOrderMock = jest.mocked(getStrategyOrder);
  let messenger: TransactionPayControllerMessenger;
  let getKeyringControllerStateMock: jest.Mock;

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
      getDelegationTransaction: jest.fn(),
      messenger,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    const mocks = getMessengerMock({ skipRegister: true });
    messenger = mocks.messenger;
    getKeyringControllerStateMock = mocks.getKeyringControllerStateMock;

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
    updateQuotesMock.mockResolvedValue(true);
    fetchRelaySolanaQuoteMock.mockResolvedValue(SOLANA_QUOTE_MOCK);
    notifyRelayTransactionMock.mockResolvedValue();
    getRelayStatusMock.mockResolvedValue({
      destinationChainId: 42161,
      inTxHashes: [SOLANA_TRANSACTION_ID],
      originChainId: 792703809,
      status: 'pending',
      txHashes: [],
      updatedAt: 1,
    });
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

  describe('Solana Pay', () => {
    const GET_QUOTE_REQUEST = {
      amount: '1000000',
      destinationChainId: '0xa4b1' as Hex,
      destinationCurrency: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Hex,
      recipient: '0x1234567890123456789012345678901234567890' as Hex,
      transactionId: TRANSACTION_ID_MOCK,
    };

    function getUnquotedIntent(): TransactionPayIntent {
      return {
        version: 1,
        sourceAccountId: SOLANA_ACCOUNT_ID,
        sourceAssetId: SOLANA_ASSET_ID,
        sourceChainId: SOLANA_CHAIN_ID,
      };
    }

    it('rejects quote requests without a persisted Solana intent', async () => {
      const controller = createController();

      await expect(
        controller.getSolanaPayQuote(GET_QUOTE_REQUEST),
      ).rejects.toThrow('Solana Pay intent missing');
    });

    it('fetches a production Relay quote and persists its request checkpoint', async () => {
      const controller = createController({
        state: {
          payIntents: { [TRANSACTION_ID_MOCK]: getUnquotedIntent() },
        },
      });

      const quote = await controller.getSolanaPayQuote(GET_QUOTE_REQUEST);

      expect(fetchRelaySolanaQuoteMock).toHaveBeenCalledWith(
        messenger,
        expect.objectContaining({
          originChainId: 792703809,
          originCurrency: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          tradeType: 'EXACT_INPUT',
        }),
      );
      expect(quote).toBe(SOLANA_QUOTE_MOCK);
      expect(controller.state.payIntents[TRANSACTION_ID_MOCK]).toMatchObject({
        requestId: 'relay-request-123',
        execution: {
          providerNotificationStatus: 'not-started',
          relayStatus: 'not-started',
          sourceStatus: 'not-started',
        },
      });
      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].solanaPayQuote,
      ).toBe(SOLANA_QUOTE_MOCK);
    });

    it('rejects submission when the transient quote is unavailable', async () => {
      const controller = createController({
        solana: {
          getTransactionStatus: jest.fn(),
          signAndSendTransaction: jest.fn(),
        },
        state: {
          payIntents: {
            [TRANSACTION_ID_MOCK]: {
              ...getUnquotedIntent(),
              requestId: 'relay-request-123',
              execution: {
                providerNotificationStatus: 'not-started',
                relayStatus: 'not-started',
                sourceStatus: 'not-started',
              },
            },
          },
        },
      });

      await expect(
        controller.submitSolanaPay(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('Missing Solana Pay quote');
    });

    it('rejects submission when Solana callbacks are not configured', async () => {
      const controller = createController({
        state: {
          payIntents: { [TRANSACTION_ID_MOCK]: getUnquotedIntent() },
        },
      });
      await controller.getSolanaPayQuote(GET_QUOTE_REQUEST);

      await expect(
        controller.submitSolanaPay(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('Solana callbacks missing');
    });

    it('invokes the sign-and-send callback once and never resubmits', async () => {
      const signAndSendTransaction = jest.fn().mockResolvedValue({
        transactionId: SOLANA_TRANSACTION_ID,
      });
      const getTransactionStatus = jest.fn().mockResolvedValue('pending');
      const controller = createController({
        solana: { getTransactionStatus, signAndSendTransaction },
        state: {
          payIntents: { [TRANSACTION_ID_MOCK]: getUnquotedIntent() },
        },
      });
      await controller.getSolanaPayQuote(GET_QUOTE_REQUEST);

      await controller.submitSolanaPay(TRANSACTION_ID_MOCK);
      await controller.submitSolanaPay(TRANSACTION_ID_MOCK);

      expect(signAndSendTransaction).toHaveBeenCalledTimes(1);
      expect(signAndSendTransaction).toHaveBeenCalledWith({
        accountId: SOLANA_ACCOUNT_ID,
        requestId: 'relay-request-123',
        scope: SOLANA_CHAIN_ID,
        transaction: SOLANA_QUOTE_MOCK.steps[0].items[0].data,
      });
      expect(
        controller.state.payIntents[TRANSACTION_ID_MOCK].sourceTransactionId,
      ).toBe(SOLANA_TRANSACTION_ID);
    });

    it('persists an ambiguous callback rejection and never resubmits', async () => {
      const signAndSendTransaction = jest
        .fn()
        .mockRejectedValue(new Error('Snap callback lost'));
      const controller = createController({
        solana: {
          getTransactionStatus: jest.fn(),
          signAndSendTransaction,
        },
        state: {
          payIntents: { [TRANSACTION_ID_MOCK]: getUnquotedIntent() },
        },
      });
      getRelayStatusMock.mockResolvedValue({
        destinationChainId: 42161,
        inTxHashes: [],
        originChainId: 792703809,
        status: 'waiting',
        txHashes: [],
        updatedAt: 1,
      });
      await controller.getSolanaPayQuote(GET_QUOTE_REQUEST);

      const firstStatus = await controller.submitSolanaPay(TRANSACTION_ID_MOCK);
      const recoveredStatus =
        await controller.submitSolanaPay(TRANSACTION_ID_MOCK);

      expect(firstStatus.sourceStatus).toBe('unknown');
      expect(recoveredStatus.sourceStatus).toBe('unknown');
      expect(signAndSendTransaction).toHaveBeenCalledTimes(1);
      await expect(
        controller.getSolanaPayQuote(GET_QUOTE_REQUEST),
      ).rejects.toThrow('Solana source attempt already started');
      expect(fetchRelaySolanaQuoteMock).toHaveBeenCalledTimes(1);
    });

    it('rejects notification retry without stable request and source correlation', async () => {
      const controller = createController({
        state: {
          payIntents: { [TRANSACTION_ID_MOCK]: getUnquotedIntent() },
        },
      });

      await expect(
        controller.retrySolanaPayNotification(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('Missing Solana notification correlation');
    });

    it('retries provider notification without resubmitting', async () => {
      const signAndSendTransaction = jest.fn().mockResolvedValue({
        transactionId: SOLANA_TRANSACTION_ID,
      });
      const controller = createController({
        solana: {
          getTransactionStatus: jest.fn().mockResolvedValue('pending'),
          signAndSendTransaction,
        },
        state: {
          payIntents: { [TRANSACTION_ID_MOCK]: getUnquotedIntent() },
        },
      });
      notifyRelayTransactionMock.mockRejectedValueOnce(
        new Error('index unavailable'),
      );
      await controller.getSolanaPayQuote(GET_QUOTE_REQUEST);

      const submissionStatus =
        await controller.submitSolanaPay(TRANSACTION_ID_MOCK);
      const notificationStatus =
        await controller.retrySolanaPayNotification(TRANSACTION_ID_MOCK);

      expect(submissionStatus.providerNotificationStatus).toBe('failed');
      expect(notificationStatus.providerNotificationStatus).toBe('succeeded');
      expect(notifyRelayTransactionMock).toHaveBeenCalledTimes(2);
      expect(signAndSendTransaction).toHaveBeenCalledTimes(1);
    });

    it('marks unavailable source and Relay observations as unknown', async () => {
      const controller = createController({
        solana: {
          getTransactionStatus: jest
            .fn()
            .mockRejectedValue(new Error('RPC unavailable')),
          signAndSendTransaction: jest.fn(),
        },
        state: {
          payIntents: {
            [TRANSACTION_ID_MOCK]: {
              ...SOLANA_PAY_INTENT_MOCK,
              execution: {
                providerNotificationStatus: 'succeeded',
                relayStatus: 'pending',
                sourceStatus: 'submitted',
              },
            },
          },
        },
      });
      getRelayStatusMock.mockRejectedValue(new Error('Relay unavailable'));

      const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(status.relayStatus).toBe('unknown');
      expect(status.sourceStatus).toBe('unknown');
    });

    it('does not erase a terminal Relay observation when status is unavailable', async () => {
      const controller = createController({
        solana: {
          getTransactionStatus: jest.fn().mockResolvedValue('pending'),
          signAndSendTransaction: jest.fn(),
        },
        state: {
          payIntents: {
            [TRANSACTION_ID_MOCK]: {
              ...SOLANA_PAY_INTENT_MOCK,
              execution: {
                providerNotificationStatus: 'succeeded',
                relayStatus: 'success',
                sourceStatus: 'pending',
              },
            },
          },
        },
      });
      getRelayStatusMock.mockRejectedValue(new Error('Relay unavailable'));

      const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(status.relayStatus).toBe('success');
      expect(status.sourceStatus).toBe('pending');
    });

    it('rejects reconciliation without Relay correlation', async () => {
      const controller = createController({
        state: {
          payIntents: { [TRANSACTION_ID_MOCK]: getUnquotedIntent() },
        },
      });

      await expect(
        controller.reconcileSolanaPay(TRANSACTION_ID_MOCK),
      ).rejects.toThrow('Missing Relay request ID');
    });

    it('recovers a callback-lost source signature and reconciles both status axes', async () => {
      const signAndSendTransaction = jest.fn();
      const controller = createController({
        solana: {
          getTransactionStatus: jest.fn().mockResolvedValue('confirmed'),
          signAndSendTransaction,
        },
        state: {
          payIntents: {
            [TRANSACTION_ID_MOCK]: {
              ...getUnquotedIntent(),
              requestId: 'relay-request-123',
              execution: {
                providerNotificationStatus: 'not-started',
                relayStatus: 'pending',
                sourceStatus: 'attempting',
              },
            },
          },
        },
      });
      getRelayStatusMock.mockResolvedValue({
        destinationChainId: 42161,
        inTxHashes: [SOLANA_TRANSACTION_ID],
        originChainId: 792703809,
        status: 'success',
        txHashes: ['0xtarget'],
        updatedAt: 1,
      });

      const statuses = await controller.recoverSolanaPay();

      expect(statuses[TRANSACTION_ID_MOCK]).toMatchObject({
        relayStatus: 'success',
        sourceStatus: 'confirmed',
        sourceTransactionId: SOLANA_TRANSACTION_ID,
        targetTransactionId: '0xtarget',
      });
      expect(signAndSendTransaction).not.toHaveBeenCalled();

      const completionCall = updateTransactionMock.mock.calls.find(
        ([request]) => request.note === 'Complete Solana pay intent',
      );
      const transaction = {} as TransactionMeta;
      completionCall?.[1](transaction);
      expect(transaction.isIntentComplete).toBe(true);
    });

    it('skips intents that cannot or no longer need recovery', async () => {
      const controller = createController({
        state: {
          payIntents: {
            'non-solana': {
              ...getUnquotedIntent(),
              sourceChainId: 'eip155:1' as CaipChainId,
            },
            'missing-request': getUnquotedIntent(),
            terminal: {
              ...SOLANA_PAY_INTENT_MOCK,
              execution: {
                providerNotificationStatus: 'succeeded',
                relayStatus: 'refund',
                sourceStatus: 'confirmed',
              },
            },
          },
        },
      });

      expect(await controller.recoverSolanaPay()).toStrictEqual({});
      expect(getRelayStatusMock).not.toHaveBeenCalled();
    });

    it('preserves source failure separately from pending Relay settlement', async () => {
      const controller = createController({
        solana: {
          getTransactionStatus: jest.fn().mockResolvedValue('failed'),
          signAndSendTransaction: jest.fn(),
        },
        state: {
          payIntents: {
            [TRANSACTION_ID_MOCK]: {
              ...SOLANA_PAY_INTENT_MOCK,
              execution: {
                providerNotificationStatus: 'succeeded',
                relayStatus: 'pending',
                sourceStatus: 'submitted',
              },
            },
          },
        },
      });

      const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(status.sourceStatus).toBe('failed');
      expect(status.relayStatus).toBe('pending');
    });

    it('preserves Relay failure separately from confirmed source submission', async () => {
      const controller = createController({
        solana: {
          getTransactionStatus: jest.fn().mockResolvedValue('confirmed'),
          signAndSendTransaction: jest.fn(),
        },
        state: {
          payIntents: {
            [TRANSACTION_ID_MOCK]: {
              ...SOLANA_PAY_INTENT_MOCK,
              execution: {
                providerNotificationStatus: 'succeeded',
                relayStatus: 'pending',
                sourceStatus: 'submitted',
              },
            },
          },
        },
      });
      getRelayStatusMock.mockResolvedValue({
        destinationChainId: 42161,
        failReason: 'DESTINATION_TX_FAILED',
        inTxHashes: [SOLANA_TRANSACTION_ID],
        originChainId: 792703809,
        status: 'failure',
        txHashes: [],
        updatedAt: 1,
      });

      const status = await controller.reconcileSolanaPay(TRANSACTION_ID_MOCK);

      expect(status.sourceStatus).toBe('confirmed');
      expect(status.relayStatus).toBe('failure');
      expect(status.failureReason).toBe('DESTINATION_TX_FAILED');
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
