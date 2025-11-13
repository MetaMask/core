import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { noop } from 'lodash';

import { TransactionPayController } from '.';
import { updatePaymentToken } from './actions/update-payment-token';
import { TransactionPayStrategy } from './constants';
import { getMessengerMock } from './tests/messenger-mock';
import type { TransactionPayControllerMessenger } from './types';
import { updateQuotes } from './utils/quotes';
import { pollTransactionChanges } from './utils/transaction';

jest.mock('./actions/update-payment-token');
jest.mock('./utils/quotes');
jest.mock('./utils/transaction');

const TRANSACTION_ID_MOCK = '123-456';
const TRANSACTION_META_MOCK = { id: TRANSACTION_ID_MOCK } as TransactionMeta;
const TOKEN_ADDRESS_MOCK = '0xabc' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;

describe('TransactionPayController', () => {
  const updatePaymentTokenMock = jest.mocked(updatePaymentToken);
  const updateQuotesMock = jest.mocked(updateQuotes);
  const pollTransactionChangesMock = jest.mocked(pollTransactionChanges);
  let messenger: TransactionPayControllerMessenger;

  /**
   * Create a TransactionPayController.
   *
   * @returns The created controller.
   */
  function createController() {
    return new TransactionPayController({
      getDelegationTransaction: jest.fn(),
      messenger,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    messenger = getMessengerMock({ skipRegister: true }).messenger;

    updateQuotesMock.mockResolvedValue(true);
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
        getStrategy: () => TransactionPayStrategy.Test,
        messenger,
      });

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Test);
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

      updateTransactionData(TRANSACTION_ID_MOCK, noop);

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toStrictEqual({
        isLoading: false,
        tokens: [],
      });
    });

    it('updates quotes', () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, noop);

      expect(updateQuotesMock).toHaveBeenCalledWith({
        messenger,
        transactionData: expect.any(Object),
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

      updateTransactionData(TRANSACTION_ID_MOCK, noop);

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toBeDefined();

      const removeTransactionDataCallback =
        pollTransactionChangesMock.mock.calls[0][2];

      removeTransactionDataCallback(TRANSACTION_ID_MOCK);

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toBeUndefined();
    });
  });
});
