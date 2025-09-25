import { Messenger } from '@metamask/base-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { TransactionControllerState } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { calculateFiat } from './required-fiat';
import { parseRequiredTokens } from './required-tokens';
import { getTransaction, pollTransactionChanges } from './transaction';
import type { TransactionPayControllerMessenger } from '..';
import type {
  AllowedActions,
  AllowedEvents,
  TransactionData,
  TransactionTokenRequired,
} from '../types';

jest.mock('./required-fiat');
jest.mock('./required-tokens');

const TRANSACTION_ID_MOCK = '123-456';

const TRANSACTION_META_MOCK = {
  id: TRANSACTION_ID_MOCK,
  txParams: {
    from: '0x123',
  },
} as TransactionMeta;

const TRANSCTION_TOKEN_REQUIRED_MOCK = {
  address: '0x456' as Hex,
} as TransactionTokenRequired;

const FIAT_MOCK = {
  amountFiat: '2',
  amountUsd: '3',
  balanceFiat: '4',
  balanceUsd: '5',
};

describe('Transaction Utils', () => {
  let baseMessenger: Messenger<AllowedActions, AllowedEvents>;
  let messenger: TransactionPayControllerMessenger;

  const getTransactionControllerStateMock = jest.fn();
  const parseRequiredTokensMock = jest.mocked(parseRequiredTokens);
  const calculateFiatMock = jest.mocked(calculateFiat);

  beforeEach(() => {
    jest.resetAllMocks();

    baseMessenger = new Messenger();

    baseMessenger.registerActionHandler(
      'TransactionController:getState',
      getTransactionControllerStateMock,
    );

    messenger = baseMessenger.getRestricted({
      name: 'TransactionPayController',
      allowedActions: ['TransactionController:getState'],
      allowedEvents: ['TransactionController:stateChange'],
    });
  });

  describe('getTransaction', () => {
    it('returns transaction', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [TRANSACTION_META_MOCK],
      });

      const result = getTransaction(TRANSACTION_ID_MOCK, messenger);
      expect(result).toBe(TRANSACTION_META_MOCK);
    });

    it('returns undefined if transaction not found', () => {
      getTransactionControllerStateMock.mockReturnValue({
        transactions: [],
      });

      const result = getTransaction(TRANSACTION_ID_MOCK, messenger);
      expect(result).toBeUndefined();
    });
  });

  describe('pollTransactionChanges', () => {
    it('updates state for new transactions', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);
      calculateFiatMock.mockReturnValue(FIAT_MOCK);

      pollTransactionChanges(messenger, updateTransactionDataMock);

      baseMessenger.publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

      const transactionData = {} as TransactionData;
      updateTransactionDataMock.mock.calls[0][1](transactionData);

      expect(transactionData.tokens).toStrictEqual([
        {
          ...TRANSCTION_TOKEN_REQUIRED_MOCK,
          ...FIAT_MOCK,
        },
      ]);
    });

    it('updates state for updated transactions', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);
      calculateFiatMock.mockReturnValue(FIAT_MOCK);

      pollTransactionChanges(messenger, updateTransactionDataMock);

      baseMessenger.publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      baseMessenger.publish(
        'TransactionController:stateChange',
        {
          transactions: [
            { ...TRANSACTION_META_MOCK, txParams: { data: '0x1' } },
          ],
        } as TransactionControllerState,
        [],
      );

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(2);
    });

    it('returns empty array if cannot calculate fiat', () => {
      const updateTransactionDataMock = jest.fn();

      parseRequiredTokensMock.mockReturnValue([TRANSCTION_TOKEN_REQUIRED_MOCK]);
      calculateFiatMock.mockReturnValue(undefined);

      pollTransactionChanges(messenger, updateTransactionDataMock);

      baseMessenger.publish(
        'TransactionController:stateChange',
        {
          transactions: [TRANSACTION_META_MOCK],
        } as TransactionControllerState,
        [],
      );

      expect(updateTransactionDataMock).toHaveBeenCalledTimes(1);

      const transactionData = {} as TransactionData;
      updateTransactionDataMock.mock.calls[0][1](transactionData);

      expect(transactionData.tokens).toStrictEqual([]);
    });
  });
});
