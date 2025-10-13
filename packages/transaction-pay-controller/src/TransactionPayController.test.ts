import { Messenger } from '@metamask/base-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '.';
import { TransactionPayController } from '.';
import { updatePaymentToken } from './actions/update-payment-token';
import { TransactionPayStrategy } from './constants';
import type { SourceAmountValues } from './types';
import { updateQuotes } from './utils/quotes';
import { updateSourceAmounts } from './utils/source-amounts';

jest.mock('./actions/update-payment-token');
jest.mock('./utils/source-amounts');
jest.mock('./utils/quotes');

const TRANSACTION_ID_MOCK = '123-456';
const TRANSACTION_META_MOCK = { id: TRANSACTION_ID_MOCK } as TransactionMeta;
const TOKEN_ADDRESS_MOCK = '0xabc' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;

describe('TransactionPayController', () => {
  const updatePaymentTokenMock = jest.mocked(updatePaymentToken);
  const updateSourceAmountsMock = jest.mocked(updateSourceAmounts);
  const updateQuotesMock = jest.mocked(updateQuotes);
  let messenger: TransactionPayControllerMessenger;

  /**
   * Create a TransactionPayController.
   *
   * @returns The created controller.
   */
  function createController() {
    return new TransactionPayController({
      messenger,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    messenger = new Messenger() as unknown as TransactionPayControllerMessenger;

    updateQuotesMock.mockResolvedValue();
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
    it('returns bridge if no callback', async () => {
      createController();

      expect(
        await messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Bridge);
    });

    it('returns callback value if provided', async () => {
      new TransactionPayController({
        getStrategy: async () => TransactionPayStrategy.Test,
        messenger,
      });

      expect(
        await messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Test);
    });
  });

  describe('updateTransactionData', () => {
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
          { sourceAmountHuman: '1.23' } as SourceAmountValues,
        ];
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toStrictEqual({
        isLoading: true,
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
          { sourceAmountHuman: '1.23' } as SourceAmountValues,
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
});
