/* eslint-disable no-new */

import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { TransactionPayController } from '.';
import { updatePaymentToken } from './actions/update-payment-token';
import { TransactionPayStrategy } from './constants';
import { getMessengerMock } from './tests/messenger-mock';
import type {
  TransactionPayControllerMessenger,
  TransactionPaySourceAmount,
} from './types';
import { updateQuotes } from './utils/quotes';
import { updateSourceAmounts } from './utils/source-amounts';
import { pollTransactionChanges } from './utils/transaction';

jest.mock('./actions/update-payment-token');
jest.mock('./utils/source-amounts');
jest.mock('./utils/quotes');
jest.mock('./utils/transaction');

const TRANSACTION_ID_MOCK = '123-456';
const TRANSACTION_META_MOCK = { id: TRANSACTION_ID_MOCK } as TransactionMeta;
const TOKEN_ADDRESS_MOCK = '0xabc' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;

describe('TransactionPayController', () => {
  const updatePaymentTokenMock = jest.mocked(updatePaymentToken);
  const updateSourceAmountsMock = jest.mocked(updateSourceAmounts);
  const updateQuotesMock = jest.mocked(updateQuotes);
  const pollTransactionChangesMock = jest.mocked(pollTransactionChanges);
  let messenger: TransactionPayControllerMessenger;

  /**
   * Create a TransactionPayController.
   *
   * @returns The created controller.
   */
  function createController(): TransactionPayController {
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

  describe('setIsMaxAmount', () => {
    it('updates state', () => {
      const controller = createController();

      controller.setIsMaxAmount(TRANSACTION_ID_MOCK, true);

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].isMaxAmount,
      ).toBe(true);
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
        getStrategy: (): TransactionPayStrategy => TransactionPayStrategy.Test,
        messenger,
      });

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Test);
    });

    it('returns relay if getStrategies callback returns empty', async () => {
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
      ).toBe(TransactionPayStrategy.Relay);
    });
  });

  describe('getStrategies Action', () => {
    it('returns relay by default', async () => {
      createController();

      expect(
        messenger.call(
          'TransactionPayController:getStrategies',
          TRANSACTION_META_MOCK,
        ),
      ).toStrictEqual([
        TransactionPayStrategy.Relay,
        TransactionPayStrategy.Across,
      ]);
    });

    it('returns callback list if provided', async () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getStrategies: (): TransactionPayStrategy[] => [
          TransactionPayStrategy.Test,
        ],
        messenger,
      });

      expect(
        messenger.call(
          'TransactionPayController:getStrategies',
          TRANSACTION_META_MOCK,
        ),
      ).toStrictEqual([TransactionPayStrategy.Test]);
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
        pollTransactionChangesMock.mock.calls[0][2];

      removeTransactionDataCallback(TRANSACTION_ID_MOCK);

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toBeUndefined();
    });
  });
});
