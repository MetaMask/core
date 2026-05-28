import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { deriveFiatAssetForFiatPayment } from '../strategy/fiat/utils';
import { getMessengerMock } from '../tests/messenger-mock';
import type { TransactionPayControllerMessenger } from '../types';
import { ensureProviderForFiatAsset, updateFiatAssetId } from './fiat';
import { getTransaction } from './transaction';

jest.mock('../strategy/fiat/utils');
jest.mock('./transaction');

const TRANSACTION_ID_MOCK = '123-456';
const TRANSACTION_META_MOCK = {
  id: TRANSACTION_ID_MOCK,
} as TransactionMeta;

const FIAT_ASSET_MOCK = {
  address: '0x0000000000000000000000000000000000001010' as Hex,
  chainId: '0x89' as Hex,
};

describe('fiat utils', () => {
  const deriveFiatAssetMock = jest.mocked(deriveFiatAssetForFiatPayment);
  const getTransactionMock = jest.mocked(getTransaction);
  let messenger: TransactionPayControllerMessenger;
  let ensureProviderForAssetMock: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    const mocks = getMessengerMock();
    messenger = mocks.messenger;

    ensureProviderForAssetMock = jest.fn();
    jest
      .spyOn(messenger as never, 'call')
      .mockImplementation((action: string, ...args: unknown[]) => {
        if (action === 'RampsController:ensureProviderForAsset') {
          return ensureProviderForAssetMock(...args) as never;
        }
        return undefined as never;
      });
  });

  describe('ensureProviderForFiatAsset', () => {
    it('calls RampsController:ensureProviderForAsset with derived CAIP asset ID', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetMock.mockReturnValue(FIAT_ASSET_MOCK);

      ensureProviderForFiatAsset({
        transactionId: TRANSACTION_ID_MOCK,
        messenger,
      });

      expect(ensureProviderForAssetMock).toHaveBeenCalledWith(
        'eip155:137/slip44:966',
      );
    });

    it('does not call RampsController when transaction is not found', () => {
      getTransactionMock.mockReturnValue(undefined);

      ensureProviderForFiatAsset({
        transactionId: TRANSACTION_ID_MOCK,
        messenger,
      });

      expect(ensureProviderForAssetMock).not.toHaveBeenCalled();
    });

    it('does not call RampsController when fiat asset cannot be derived', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetMock.mockReturnValue(undefined as never);

      ensureProviderForFiatAsset({
        transactionId: TRANSACTION_ID_MOCK,
        messenger,
      });

      expect(ensureProviderForAssetMock).not.toHaveBeenCalled();
    });
  });

  describe('updateFiatAssetId', () => {
    it('stores caipAssetId in fiat payment data', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetMock.mockReturnValue(FIAT_ASSET_MOCK);

      const updateTransactionData = jest.fn();
      updateFiatAssetId({
        transactionId: TRANSACTION_ID_MOCK,
        messenger,
        updateTransactionData,
      });

      expect(updateTransactionData).toHaveBeenCalledWith(
        TRANSACTION_ID_MOCK,
        expect.any(Function),
      );

      const fiatPayment = { caipAssetId: undefined as string | undefined };
      updateTransactionData.mock.calls[0][1]({ fiatPayment });

      expect(fiatPayment.caipAssetId).toBe('eip155:137/slip44:966');
    });

    it('does not call updateTransactionData when transaction is not found', () => {
      getTransactionMock.mockReturnValue(undefined);

      const updateTransactionData = jest.fn();
      updateFiatAssetId({
        transactionId: TRANSACTION_ID_MOCK,
        messenger,
        updateTransactionData,
      });

      expect(updateTransactionData).not.toHaveBeenCalled();
    });

    it('does not call updateTransactionData when fiat asset cannot be derived', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetMock.mockReturnValue(undefined as never);

      const updateTransactionData = jest.fn();
      updateFiatAssetId({
        transactionId: TRANSACTION_ID_MOCK,
        messenger,
        updateTransactionData,
      });

      expect(updateTransactionData).not.toHaveBeenCalled();
    });
  });
});
