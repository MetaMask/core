import type { TraceContext } from '@metamask/controller-utils';

import { updateFirstTimeInteraction } from './first-time-interaction';
import { decodeTransactionData } from './transaction-type';
import { validateParamTo } from './validation';
import { getAccountAddressRelationship } from '../api/accounts-api';
import type { TransactionMeta } from '../types';
import { TransactionStatus, TransactionType } from '../types';

jest.mock('./transaction-type');
jest.mock('./validation');
jest.mock('../api/accounts-api');

const mockDecodeTransactionData = jest.mocked(decodeTransactionData);
const mockValidateParamTo = jest.mocked(validateParamTo);
const mockGetAccountAddressRelationship = jest.mocked(
  getAccountAddressRelationship,
);

describe('updateFirstTimeInteraction', () => {
  const mockTransactionMeta = {
    id: 'tx-id-1',
    chainId: '0x1',
    status: TransactionStatus.unapproved,
    time: 1234567890,
    txParams: {
      from: '0xfrom',
      to: '0xto',
      value: '0x0',
    },
    type: TransactionType.simpleSend,
  } as unknown as TransactionMeta;

  const mockTraceContext: TraceContext = { name: 'test-trace' };
  const mockIsFirstTimeInteractionEnabled = jest.fn();
  const mockTrace = jest.fn();
  const mockGetTransaction = jest.fn();
  const mockUpdateTransactionInternal = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockTrace.mockImplementation(
      async (_traceRequest: unknown, callback: () => unknown) => {
        return await callback();
      },
    );
    mockValidateParamTo.mockImplementation(() => undefined);
    mockGetTransaction.mockReturnValue(mockTransactionMeta);
  });

  describe('when first time interaction is disabled', () => {
    it('returns early without processing', async () => {
      mockIsFirstTimeInteractionEnabled.mockReturnValue(false);

      await updateFirstTimeInteraction({
        existingTransactions: [],
        getTransaction: mockGetTransaction,
        isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
        traceContext: mockTraceContext,
        trace: mockTrace,
        transactionMeta: mockTransactionMeta,
        updateTransaction: mockUpdateTransactionInternal,
      });

      expect(mockIsFirstTimeInteractionEnabled).toHaveBeenCalledTimes(1);
      expect(mockDecodeTransactionData).not.toHaveBeenCalled();
      expect(mockGetAccountAddressRelationship).not.toHaveBeenCalled();
      expect(mockUpdateTransactionInternal).not.toHaveBeenCalled();
    });
  });

  describe('when first time interaction is enabled', () => {
    beforeEach(() => {
      mockIsFirstTimeInteractionEnabled.mockReturnValue(true);
    });

    describe('recipient determination', () => {
      it('uses `to` field when no data is present', async () => {
        const transactionMetaNoData = {
          ...mockTransactionMeta,
          txParams: { ...mockTransactionMeta.txParams, data: undefined },
        };

        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: transactionMetaNoData,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockDecodeTransactionData).not.toHaveBeenCalled();
        expect(mockValidateParamTo).toHaveBeenCalledWith('0xto');
        expect(mockGetAccountAddressRelationship).toHaveBeenCalledWith({
          chainId: 1,
          to: '0xto',
          from: '0xfrom',
        });
      });

      it('uses `to` field when transaction data does not match known methods', async () => {
        const transactionMetaWithData = {
          ...mockTransactionMeta,
          txParams: { ...mockTransactionMeta.txParams, data: '0xabcdef' },
          type: TransactionType.tokenMethodTransfer,
        };

        mockDecodeTransactionData.mockReturnValue({
          name: 'unknownMethod',
          args: {},
        } as unknown as ReturnType<typeof decodeTransactionData>);
        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: transactionMetaWithData,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockDecodeTransactionData).toHaveBeenCalledWith('0xabcdef');
        expect(mockValidateParamTo).toHaveBeenCalledWith('0xto');
        expect(mockGetAccountAddressRelationship).toHaveBeenCalledWith({
          chainId: 1,
          to: '0xto',
          from: '0xfrom',
        });
      });

      it('extracts recipient from transfer method data, explicitly using _to', async () => {
        const transactionMetaWithData = {
          ...mockTransactionMeta,
          txParams: { ...mockTransactionMeta.txParams, data: '0xabcdef' },
          type: TransactionType.tokenMethodTransfer,
        };

        mockDecodeTransactionData.mockReturnValue({
          name: 'transfer',
          args: { _to: '0xrecipient' },
        } as unknown as ReturnType<typeof decodeTransactionData>);
        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: transactionMetaWithData,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockValidateParamTo).toHaveBeenCalledWith('0xrecipient');
        expect(mockGetAccountAddressRelationship).toHaveBeenCalledWith({
          chainId: 1,
          to: '0xrecipient',
          from: '0xfrom',
        });
      });

      it('extracts recipient from transferFrom method data, explicitly using to', async () => {
        const transactionMetaWithData = {
          ...mockTransactionMeta,
          txParams: { ...mockTransactionMeta.txParams, data: '0xabcdef' },
          type: TransactionType.tokenMethodTransferFrom,
        };

        mockDecodeTransactionData.mockReturnValue({
          name: 'transferFrom',
          args: { to: '0xrecipient' },
        } as unknown as ReturnType<typeof decodeTransactionData>);
        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: transactionMetaWithData,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockValidateParamTo).toHaveBeenCalledWith('0xrecipient');
        expect(mockGetAccountAddressRelationship).toHaveBeenCalledWith({
          chainId: 1,
          to: '0xrecipient',
          from: '0xfrom',
        });
      });
    });

    describe('existing transaction check', () => {
      it('returns early if existing transaction with same from/to/chainId exists', async () => {
        const existingTransaction: TransactionMeta = {
          ...mockTransactionMeta,
          id: 'different-id',
        };

        await updateFirstTimeInteraction({
          existingTransactions: [existingTransaction],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockGetAccountAddressRelationship).not.toHaveBeenCalled();
        expect(mockUpdateTransactionInternal).not.toHaveBeenCalled();
      });

      it('proceeds if existing transaction has different chainId', async () => {
        const existingTransaction: TransactionMeta = {
          ...mockTransactionMeta,
          id: 'different-id',
          chainId: '0x2',
        };

        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [existingTransaction],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockGetAccountAddressRelationship).toHaveBeenCalled();
        expect(mockUpdateTransactionInternal).toHaveBeenCalled();
      });

      it('proceeds if existing transaction has different from address', async () => {
        const existingTransaction: TransactionMeta = {
          ...mockTransactionMeta,
          id: 'different-id',
          txParams: { ...mockTransactionMeta.txParams, from: '0xdifferent' },
        };

        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [existingTransaction],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockGetAccountAddressRelationship).toHaveBeenCalled();
        expect(mockUpdateTransactionInternal).toHaveBeenCalled();
      });

      it('proceeds if existing transaction has different to address', async () => {
        const existingTransaction: TransactionMeta = {
          ...mockTransactionMeta,
          id: 'different-id',
          txParams: { ...mockTransactionMeta.txParams, to: '0xdifferent' },
        };

        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [existingTransaction],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockGetAccountAddressRelationship).toHaveBeenCalled();
        expect(mockUpdateTransactionInternal).toHaveBeenCalled();
      });

      it('proceeds if existing transaction has same id', async () => {
        const existingTransaction: TransactionMeta = {
          ...mockTransactionMeta,
          id: mockTransactionMeta.id, // same id
        };

        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [existingTransaction],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockGetAccountAddressRelationship).toHaveBeenCalled();
        expect(mockUpdateTransactionInternal).toHaveBeenCalled();
      });
    });

    describe('API integration', () => {
      it('calls trace with correct parameters', async () => {
        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          traceContext: mockTraceContext,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockTrace).toHaveBeenCalledWith(
          {
            name: 'Account Address Relationship',
            parentContext: mockTraceContext,
          },
          expect.any(Function),
        );
      });

      it('handles API response with count = 0 (first time interaction)', async () => {
        mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

        await updateFirstTimeInteraction({
          existingTransactions: [],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockUpdateTransactionInternal).toHaveBeenCalledWith(
          {
            transactionId: 'tx-id-1',
            note: 'TransactionController#updateFirstInteraction - Update first time interaction',
          },
          expect.any(Function),
        );

        const updaterFunction = mockUpdateTransactionInternal.mock.calls[0][1];
        const mockTxMeta = {} as TransactionMeta;
        updaterFunction(mockTxMeta);
        expect(mockTxMeta.isFirstTimeInteraction).toBe(true);
      });

      it('handles API response with count > 0 (not first time interaction)', async () => {
        mockGetAccountAddressRelationship.mockResolvedValue({ count: 5 });

        await updateFirstTimeInteraction({
          existingTransactions: [],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockUpdateTransactionInternal).toHaveBeenCalledWith(
          {
            transactionId: 'tx-id-1',
            note: 'TransactionController#updateFirstInteraction - Update first time interaction',
          },
          expect.any(Function),
        );

        const updaterFunction = mockUpdateTransactionInternal.mock.calls[0][1];
        const mockTxMeta = {} as TransactionMeta;
        updaterFunction(mockTxMeta);
        expect(mockTxMeta.isFirstTimeInteraction).toBe(false);
      });

      it('handles API response with undefined count', async () => {
        mockGetAccountAddressRelationship.mockResolvedValue({
          count: undefined,
        });

        await updateFirstTimeInteraction({
          existingTransactions: [],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockUpdateTransactionInternal).toHaveBeenCalledWith(
          {
            transactionId: 'tx-id-1',
            note: 'TransactionController#updateFirstInteraction - Update first time interaction',
          },
          expect.any(Function),
        );

        const updaterFunction = mockUpdateTransactionInternal.mock.calls[0][1];
        const mockTxMeta = {} as TransactionMeta;
        updaterFunction(mockTxMeta);
        expect(mockTxMeta.isFirstTimeInteraction).toBeUndefined();
      });

      it('handles API error gracefully', async () => {
        const mockError = new Error('API Error');
        mockGetAccountAddressRelationship.mockRejectedValue(mockError);

        await updateFirstTimeInteraction({
          existingTransactions: [],
          getTransaction: mockGetTransaction,
          isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
          trace: mockTrace,
          transactionMeta: mockTransactionMeta,
          updateTransaction: mockUpdateTransactionInternal,
        });

        expect(mockUpdateTransactionInternal).not.toHaveBeenCalled();
      });
    });

    it('returns early if transaction not found after API call', async () => {
      mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });
      mockGetTransaction.mockReturnValue(undefined);

      await updateFirstTimeInteraction({
        existingTransactions: [],
        getTransaction: mockGetTransaction,
        isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
        trace: mockTrace,
        transactionMeta: mockTransactionMeta,
        updateTransaction: mockUpdateTransactionInternal,
      });

      expect(mockUpdateTransactionInternal).not.toHaveBeenCalled();
    });

    it('handles decodeTransactionData returning null', async () => {
      const transactionMetaWithData = {
        ...mockTransactionMeta,
        txParams: { ...mockTransactionMeta.txParams, data: '0xabcdef' },
      };

      mockDecodeTransactionData.mockReturnValue(
        null as unknown as ReturnType<typeof decodeTransactionData>,
      );
      mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

      await updateFirstTimeInteraction({
        existingTransactions: [],
        getTransaction: mockGetTransaction,
        isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
        trace: mockTrace,
        transactionMeta: transactionMetaWithData,
        updateTransaction: mockUpdateTransactionInternal,
      });

      expect(mockValidateParamTo).toHaveBeenCalledWith('0xto');
      expect(mockGetAccountAddressRelationship).toHaveBeenCalledWith({
        chainId: 1,
        to: '0xto',
        from: '0xfrom',
      });
    });

    it('handles missing args in parsed data', async () => {
      const transactionMetaWithData = {
        ...mockTransactionMeta,
        txParams: { ...mockTransactionMeta.txParams, data: '0xabcdef' },
      };

      mockDecodeTransactionData.mockReturnValue({
        name: 'transfer',
        // args is missing
      } as unknown as ReturnType<typeof decodeTransactionData>);
      mockGetAccountAddressRelationship.mockResolvedValue({ count: 0 });

      await updateFirstTimeInteraction({
        existingTransactions: [],
        getTransaction: mockGetTransaction,
        isFirstTimeInteractionEnabled: mockIsFirstTimeInteractionEnabled,
        trace: mockTrace,
        transactionMeta: transactionMetaWithData,
        updateTransaction: mockUpdateTransactionInternal,
      });

      expect(mockValidateParamTo).toHaveBeenCalledWith('0xto');
    });
  });
});
