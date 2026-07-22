/* eslint-disable no-new */

import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';
import { createDeferredPromise } from '@metamask/utils';

import { TransactionPayController } from '.';
import { updateFiatPayment } from './actions/update-fiat-payment';
import { updatePaymentToken } from './actions/update-payment-token';
import { PaymentOverride, TransactionPayStrategy } from './constants';
import { deriveFiatAssetForFiatPayment } from './strategy/fiat/utils';
import { getMessengerMock } from './tests/messenger-mock';
import type {
  PrepareTransactionAmountResult,
  TransactionPayControllerMessenger,
  TransactionPayControllerOptions,
  TransactionPayQuote,
  TransactionPaySourceAmount,
  TransactionPayTotals,
  UpdateTransactionDataCallback,
} from './types';
import { getStrategyOrder } from './utils/feature-flags';
import { abortQuotes, updateQuotes } from './utils/quotes';
import { updateSourceAmounts } from './utils/source-amounts';
import {
  getTransaction,
  subscribeAssetChanges,
  subscribeTransactionChanges,
} from './utils/transaction';

jest.mock('./actions/update-fiat-payment');
jest.mock('./actions/update-payment-token');
jest.mock('./strategy/fiat/utils');
jest.mock('./utils/source-amounts');
jest.mock('./utils/quotes');
jest.mock('./utils/transaction');
jest.mock('./utils/feature-flags');

const TRANSACTION_ID_MOCK = '123-456';
const TRANSACTION_META_MOCK = { id: TRANSACTION_ID_MOCK } as TransactionMeta;
const TOKEN_ADDRESS_MOCK = '0xabc' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
describe('TransactionPayController', () => {
  const updateFiatPaymentMock = jest.mocked(updateFiatPayment);
  const updatePaymentTokenMock = jest.mocked(updatePaymentToken);
  const deriveFiatAssetForFiatPaymentMock = jest.mocked(
    deriveFiatAssetForFiatPayment,
  );
  const getTransactionMock = jest.mocked(getTransaction);
  const updateSourceAmountsMock = jest.mocked(updateSourceAmounts);
  const abortQuotesMock = jest.mocked(abortQuotes);
  const updateQuotesMock = jest.mocked(updateQuotes);
  const subscribeTransactionChangesMock = jest.mocked(
    subscribeTransactionChanges,
  );
  const subscribeAssetChangesMock = jest.mocked(subscribeAssetChanges);
  const getStrategyOrderMock = jest.mocked(getStrategyOrder);
  let messenger: TransactionPayControllerMessenger;
  let updateTransactionCallbackMock: jest.Mock;
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
    updateTransactionCallbackMock = mocks.updateTransactionCallbackMock;
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
  });

  describe('updateAmount', () => {
    const transaction = {
      id: TRANSACTION_ID_MOCK,
      nestedTransactions: [
        { data: '0x1111' as Hex },
        { data: '0x2222' as Hex },
      ],
      txParams: { from: '0x1234567890123456789012345678901234567891' },
    } as TransactionMeta;
    const requiredAssets = [
      {
        address: '0x1234567890123456789012345678901234567892' as Hex,
        amount: '0x64' as Hex,
        standard: 'erc20',
      },
    ];
    const nestedTransactionUpdates = [
      { transactionIndex: 0, transactionData: '0xAAAA' as Hex },
      { transactionIndex: 1, transactionData: '0xBBBB' as Hex },
    ];

    function mockTransactionUpdateCallback(): TransactionMeta {
      const updatedTransaction = {
        ...transaction,
        nestedTransactions: transaction.nestedTransactions?.map(
          (nestedTransaction) => ({ ...nestedTransaction }),
        ),
        txParams: { ...transaction.txParams },
      };
      updateTransactionCallbackMock.mockImplementation(
        (_transactionId, callback) => {
          callback(updatedTransaction);
          return updatedTransaction;
        },
      );
      return updatedTransaction;
    }

    function getStateWithOldQuote(): TransactionPayControllerOptions['state'] {
      return {
        transactionData: {
          [TRANSACTION_ID_MOCK]: {
            fiatPayment: {},
            isLoading: false,
            quotes: [
              {
                strategy: TransactionPayStrategy.Relay,
              } as TransactionPayQuote<Json>,
            ],
            quotesLastUpdated: 123,
            tokens: [],
            totals: {} as TransactionPayTotals,
          },
        },
      };
    }

    function expectOldQuoteInvalidated(
      controller: TransactionPayController,
      isLoading: boolean,
    ): void {
      const transactionData =
        controller.state.transactionData[TRANSACTION_ID_MOCK];

      expect(transactionData.isLoading).toBe(isLoading);
      expect(transactionData.quotes).toBeUndefined();
      expect(transactionData.quotesLastUpdated).toBeUndefined();
      expect(transactionData.totals).toBeUndefined();
    }

    it('rejects an update for an unknown transaction', async () => {
      getTransactionMock.mockReturnValue(undefined);
      const controller = createController({
        prepareTransactionAmount: jest.fn(),
      });

      await expect(
        controller.updateAmount({
          transactionId: TRANSACTION_ID_MOCK,
          amountHuman: '1.23',
        }),
      ).rejects.toThrow(`Transaction not found: ${TRANSACTION_ID_MOCK}`);
    });

    it('rejects an update when amount preparation is not configured', async () => {
      getTransactionMock.mockReturnValue(transaction);
      const controller = createController();

      await expect(
        controller.updateAmount({
          transactionId: TRANSACTION_ID_MOCK,
          amountHuman: '1.23',
        }),
      ).rejects.toThrow('Transaction amount preparation is not configured');
    });

    it('rejects a non-applicable amount preparation', async () => {
      getTransactionMock.mockReturnValue(transaction);
      const controller = createController({
        prepareTransactionAmount: jest.fn().mockResolvedValue({
          kind: 'not-applicable',
        }),
      });
      updateQuotesMock.mockClear();

      await expect(
        controller.updateAmount({
          transactionId: TRANSACTION_ID_MOCK,
          amountHuman: '1.23',
        }),
      ).rejects.toThrow('Transaction amount preparation is not applicable');
      expect(updateTransactionCallbackMock).not.toHaveBeenCalled();
    });

    it('passes the exact human amount and commits the complete patch once', async () => {
      const prepareTransactionAmount = jest.fn().mockResolvedValue({
        kind: 'prepared',
        amountRaw: '123456',
        requiredAssets,
        nestedTransactionUpdates,
        requiredNestedTransactionIndexes: [0, 1],
      });
      getTransactionMock.mockReturnValue(transaction);
      const updatedTransaction = mockTransactionUpdateCallback();
      const controller = createController({ prepareTransactionAmount });
      controller.setTransactionConfig(TRANSACTION_ID_MOCK, () => undefined);
      updateQuotesMock.mockClear();

      expect(
        await controller.updateAmount({
          transactionId: TRANSACTION_ID_MOCK,
          amountHuman: '1.23456',
        }),
      ).toBe(true);

      expect(prepareTransactionAmount).toHaveBeenCalledWith({
        amountHuman: '1.23456',
        signal: expect.any(AbortSignal),
        transaction,
      });
      expect(abortQuotesMock).toHaveBeenCalledWith(TRANSACTION_ID_MOCK);
      expect(abortQuotesMock.mock.invocationCallOrder[0]).toBeLessThan(
        prepareTransactionAmount.mock.invocationCallOrder[0],
      );
      expect(updateTransactionCallbackMock).toHaveBeenCalledWith(
        TRANSACTION_ID_MOCK,
        expect.any(Function),
      );
      expect(updatedTransaction.requiredAssets).toStrictEqual(requiredAssets);
      expect(
        updatedTransaction.nestedTransactions?.map(({ data }) => data),
      ).toStrictEqual(['0xAAAA', '0xBBBB']);
      expect(updatedTransaction.txParams.data).toContain('aaaa');
      expect(updatedTransaction.txParams.data).toContain('bbbb');
      expect(updateQuotesMock).toHaveBeenCalledTimes(1);
      expect(updateQuotesMock.mock.calls[0][0]).not.toHaveProperty(
        'transactionPreparation',
      );
      expect(updateQuotesMock.mock.calls[0][0]).not.toHaveProperty(
        'transactionRevision',
      );
    });

    it('invalidates an old quote before the preparation callback and keeps it cleared when the callback fails', async () => {
      const callbackError = new Error('Amount callback failed');
      const controller = createController({
        prepareTransactionAmount: jest.fn().mockRejectedValue(callbackError),
        state: getStateWithOldQuote(),
      });
      getTransactionMock.mockReturnValue(transaction);

      const result = controller.updateAmount({
        transactionId: TRANSACTION_ID_MOCK,
        amountHuman: '1.25',
      });

      expectOldQuoteInvalidated(controller, true);
      await expect(result).rejects.toThrow(callbackError);
      expectOldQuoteInvalidated(controller, false);
      expect(updateTransactionCallbackMock).not.toHaveBeenCalled();
      expect(updateQuotesMock).not.toHaveBeenCalled();
    });

    it('keeps an old quote cleared when vendor quoting fails', async () => {
      const pipelineError = new Error('Quote pipeline failed');
      const controller = createController({
        prepareTransactionAmount: jest.fn().mockResolvedValue({
          kind: 'prepared',
          amountRaw: '1250000',
          requiredAssets,
          nestedTransactionUpdates,
          requiredNestedTransactionIndexes: [0, 1],
        }),
        state: getStateWithOldQuote(),
      });
      getTransactionMock.mockReturnValue(transaction);
      mockTransactionUpdateCallback();
      updateQuotesMock.mockRejectedValue(pipelineError);

      const result = controller.updateAmount({
        transactionId: TRANSACTION_ID_MOCK,
        amountHuman: '1.25',
      });

      expectOldQuoteInvalidated(controller, true);
      await expect(result).rejects.toThrow(pipelineError);
      expectOldQuoteInvalidated(controller, false);
    });

    it('does not let a superseded amount generation clear loading for the current generation', async () => {
      const firstPreparation =
        createDeferredPromise<PrepareTransactionAmountResult>();
      const secondPreparation =
        createDeferredPromise<PrepareTransactionAmountResult>();
      const prepareTransactionAmount = jest
        .fn()
        .mockReturnValueOnce(firstPreparation.promise)
        .mockReturnValueOnce(secondPreparation.promise);
      const controller = createController({
        prepareTransactionAmount,
        state: getStateWithOldQuote(),
      });
      getTransactionMock.mockReturnValue(transaction);
      mockTransactionUpdateCallback();

      const first = controller.updateAmount({
        transactionId: TRANSACTION_ID_MOCK,
        amountHuman: '1',
      });
      const second = controller.updateAmount({
        transactionId: TRANSACTION_ID_MOCK,
        amountHuman: '2',
      });

      firstPreparation.resolve({ kind: 'not-applicable' });
      expect(await first).toBe(false);
      expectOldQuoteInvalidated(controller, true);

      secondPreparation.resolve({
        kind: 'prepared',
        amountRaw: '2000000',
        requiredAssets,
        nestedTransactionUpdates,
        requiredNestedTransactionIndexes: [0, 1],
      });
      expect(await second).toBe(true);
      expectOldQuoteInvalidated(controller, false);
    });

    it('joins an identical in-flight intent', async () => {
      const preparation = createDeferredPromise<{
        kind: 'prepared';
        amountRaw: string;
        requiredAssets: typeof requiredAssets;
        nestedTransactionUpdates: typeof nestedTransactionUpdates;
        requiredNestedTransactionIndexes: number[];
      }>();
      const prepareTransactionAmount = jest
        .fn()
        .mockReturnValue(preparation.promise);
      getTransactionMock.mockReturnValue(transaction);
      mockTransactionUpdateCallback();
      const controller = createController({ prepareTransactionAmount });
      controller.setTransactionConfig(TRANSACTION_ID_MOCK, () => undefined);
      const request = {
        transactionId: TRANSACTION_ID_MOCK,
        amountHuman: '1.5',
      };

      const first = controller.updateAmount(request);
      const second = controller.updateAmount(request);

      expect(first).toBe(second);
      expect(prepareTransactionAmount).toHaveBeenCalledTimes(1);

      preparation.resolve({
        kind: 'prepared',
        amountRaw: '1500000',
        requiredAssets,
        nestedTransactionUpdates,
        requiredNestedTransactionIndexes: [0, 1],
      });
      expect(await first).toBe(true);
    });

    it('aborts a different in-flight intent', async () => {
      const firstPreparation = createDeferredPromise<{
        kind: 'not-applicable';
      }>();
      const signals: AbortSignal[] = [];
      const prepareTransactionAmount = jest
        .fn()
        .mockImplementationOnce(({ signal }: { signal: AbortSignal }) => {
          signals.push(signal);
          return firstPreparation.promise;
        })
        .mockResolvedValueOnce({
          kind: 'prepared',
          amountRaw: '2000000',
          requiredAssets,
          nestedTransactionUpdates,
          requiredNestedTransactionIndexes: [0, 1],
        });
      getTransactionMock.mockReturnValue(transaction);
      mockTransactionUpdateCallback();
      const controller = createController({ prepareTransactionAmount });
      controller.setTransactionConfig(TRANSACTION_ID_MOCK, () => undefined);

      const first = controller.updateAmount({
        transactionId: TRANSACTION_ID_MOCK,
        amountHuman: '1',
      });
      const second = controller.updateAmount({
        transactionId: TRANSACTION_ID_MOCK,
        amountHuman: '2',
      });

      expect(signals[0].aborted).toBe(true);
      firstPreparation.resolve({ kind: 'not-applicable' });
      expect(await first).toBe(false);
      expect(await second).toBe(true);
    });

    it('rejects an update if the current transaction has no nested transactions', async () => {
      const prepareTransactionAmount = jest.fn().mockResolvedValue({
        kind: 'prepared',
        amountRaw: '123',
        requiredAssets,
        nestedTransactionUpdates,
        requiredNestedTransactionIndexes: [0, 1],
      });
      getTransactionMock.mockReturnValue(transaction);
      updateTransactionCallbackMock.mockImplementation(
        (_transactionId, callback) => {
          const currentTransaction = {
            ...transaction,
            nestedTransactions: undefined,
            txParams: { ...transaction.txParams },
          };
          callback(currentTransaction);
          return currentTransaction;
        },
      );
      const controller = createController({
        prepareTransactionAmount,
        state: {
          transactionData: {
            [TRANSACTION_ID_MOCK]: {
              fiatPayment: {},
              isLoading: false,
              tokens: [],
            },
          },
        },
      });

      await expect(
        controller.updateAmount({
          transactionId: TRANSACTION_ID_MOCK,
          amountHuman: '1.23',
        }),
      ).rejects.toThrow('Nested transaction not found with index - 0');
      expect(updateQuotesMock).not.toHaveBeenCalled();
    });

    it('rejects a partial patch without committing the transaction', async () => {
      const controller = createController({
        prepareTransactionAmount: jest.fn().mockResolvedValue({
          kind: 'prepared',
          amountRaw: '123',
          requiredAssets,
          nestedTransactionUpdates: [nestedTransactionUpdates[0]],
          requiredNestedTransactionIndexes: [0, 1],
        }),
      });
      getTransactionMock.mockReturnValue(transaction);

      await expect(
        controller.updateAmount({
          transactionId: TRANSACTION_ID_MOCK,
          amountHuman: '1.23',
        }),
      ).rejects.toThrow('incomplete patch');
      expect(updateTransactionCallbackMock).not.toHaveBeenCalled();
    });

    it('suppresses the listener quote launch caused by its atomic publication', async () => {
      const prepareTransactionAmount = jest.fn().mockResolvedValue({
        kind: 'prepared',
        amountRaw: '123456',
        requiredAssets,
        nestedTransactionUpdates,
        requiredNestedTransactionIndexes: [0, 1],
      });
      getTransactionMock.mockReturnValue(transaction);
      const controller = createController({ prepareTransactionAmount });
      controller.setTransactionConfig(TRANSACTION_ID_MOCK, () => undefined);
      updateQuotesMock.mockClear();
      const listenerUpdateTransactionData =
        subscribeTransactionChangesMock.mock.calls[0][1];
      const updatedTransaction = mockTransactionUpdateCallback();
      updateTransactionCallbackMock.mockImplementationOnce(
        (transactionId, callback) => {
          listenerUpdateTransactionData(transactionId, (data) => {
            data.tokens = [{ address: TOKEN_ADDRESS_MOCK }] as never;
          });
          callback(updatedTransaction);
          return updatedTransaction;
        },
      );

      await controller.updateAmount({
        transactionId: TRANSACTION_ID_MOCK,
        amountHuman: '1.23456',
      });

      expect(updateQuotesMock).toHaveBeenCalledTimes(1);
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
