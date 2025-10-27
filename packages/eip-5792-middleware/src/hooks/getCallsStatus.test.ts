import type { AccountsControllerGetStateAction } from '@metamask/accounts-controller';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MockAnyNamespace,
} from '@metamask/messenger';
import type { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import type {
  TransactionControllerGetStateAction,
  TransactionControllerState,
} from '@metamask/transaction-controller';

import { getCallsStatus } from './getCallsStatus';
import { GetCallsStatusCode } from '../constants';
import type { EIP5792Messenger } from '../types';

const CHAIN_ID_MOCK = '0x123';
const BATCH_ID_MOCK = '0xf3472db2a4134607a17213b7e9ca26e3';

const TRANSACTION_META_MOCK = {
  batchId: BATCH_ID_MOCK,
  chainId: CHAIN_ID_MOCK,
  status: TransactionStatus.confirmed,
  txReceipt: {
    blockHash: '0xabcd',
    blockNumber: '0x1234',
    gasUsed: '0x4321',
    logs: [
      {
        address: '0xa123',
        data: '0xb123',
        topics: ['0xc123'],
      },
      {
        address: '0xd123',
        data: '0xe123',
        topics: ['0xf123'],
      },
    ],
    status: '0x1',
    transactionHash: '0xcba',
  },
};

type AllActions =
  | MessengerActions<EIP5792Messenger>
  | PreferencesControllerGetStateAction
  | AccountsControllerGetStateAction;

type RootMessenger = Messenger<MockAnyNamespace, AllActions>;

describe('EIP-5792', () => {
  const getTransactionControllerStateMock: jest.MockedFn<
    TransactionControllerGetStateAction['handler']
  > = jest.fn();

  let rootMessenger: RootMessenger;

  let messenger: Messenger<'EIP5792', AllActions, never, RootMessenger>;

  beforeEach(() => {
    jest.resetAllMocks();

    rootMessenger = new Messenger<MockAnyNamespace, AllActions>({
      namespace: MOCK_ANY_NAMESPACE,
    });

    rootMessenger.registerActionHandler(
      'TransactionController:getState',
      getTransactionControllerStateMock,
    );

    messenger = new Messenger({
      namespace: 'EIP5792',
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger,
      actions: ['TransactionController:getState'],
    });
  });

  describe('getCallsStatus', () => {
    it('returns result using metadata from transaction controller', () => {
      getTransactionControllerStateMock.mockReturnValueOnce({
        transactions: [TRANSACTION_META_MOCK],
      } as unknown as TransactionControllerState);

      expect(getCallsStatus(messenger, BATCH_ID_MOCK)).toStrictEqual({
        version: '2.0.0',
        id: BATCH_ID_MOCK,
        chainId: CHAIN_ID_MOCK,
        atomic: true,
        status: GetCallsStatusCode.CONFIRMED,
        receipts: [
          {
            blockNumber: TRANSACTION_META_MOCK.txReceipt.blockNumber,
            blockHash: TRANSACTION_META_MOCK.txReceipt.blockHash,
            gasUsed: TRANSACTION_META_MOCK.txReceipt.gasUsed,
            logs: TRANSACTION_META_MOCK.txReceipt.logs,
            status: TRANSACTION_META_MOCK.txReceipt.status,
            transactionHash: TRANSACTION_META_MOCK.txReceipt.transactionHash,
          },
        ],
      });
    });

    it('ignores additional properties in receipt', () => {
      getTransactionControllerStateMock.mockReturnValueOnce({
        transactions: [
          {
            ...TRANSACTION_META_MOCK,
            txReceipt: {
              ...TRANSACTION_META_MOCK.txReceipt,
              extra: 'data',
            },
          },
        ],
      } as unknown as TransactionControllerState);

      const receiptResult = getCallsStatus(messenger, BATCH_ID_MOCK)
        ?.receipts?.[0];

      expect(receiptResult).not.toHaveProperty('extra');
    });

    it('ignores additional properties in log', () => {
      getTransactionControllerStateMock.mockReturnValueOnce({
        transactions: [
          {
            ...TRANSACTION_META_MOCK,
            txReceipt: {
              ...TRANSACTION_META_MOCK.txReceipt,
              logs: [
                {
                  ...TRANSACTION_META_MOCK.txReceipt.logs[0],
                  extra: 'data',
                },
              ],
            },
          },
        ],
      } as unknown as TransactionControllerState);

      const receiptLog = getCallsStatus(messenger, BATCH_ID_MOCK)?.receipts?.[0]
        ?.logs?.[0];

      expect(receiptLog).not.toHaveProperty('extra');
    });

    it('returns failed status if transaction status is failed and no hash', () => {
      getTransactionControllerStateMock.mockReturnValueOnce({
        transactions: [
          {
            ...TRANSACTION_META_MOCK,
            status: TransactionStatus.failed,
            hash: undefined,
          },
        ],
      } as unknown as TransactionControllerState);

      expect(getCallsStatus(messenger, BATCH_ID_MOCK)?.status).toStrictEqual(
        GetCallsStatusCode.FAILED_OFFCHAIN,
      );
    });

    it('returns reverted status if transaction status is failed and hash', () => {
      getTransactionControllerStateMock.mockReturnValueOnce({
        transactions: [
          {
            ...TRANSACTION_META_MOCK,
            status: TransactionStatus.failed,
            hash: '0x123',
          },
        ],
      } as unknown as TransactionControllerState);

      expect(getCallsStatus(messenger, BATCH_ID_MOCK)?.status).toStrictEqual(
        GetCallsStatusCode.REVERTED,
      );
    });

    it('returns reverted status if transaction status is dropped', () => {
      getTransactionControllerStateMock.mockReturnValueOnce({
        transactions: [
          {
            ...TRANSACTION_META_MOCK,
            status: TransactionStatus.dropped,
          },
        ],
      } as unknown as TransactionControllerState);

      expect(getCallsStatus(messenger, BATCH_ID_MOCK)?.status).toStrictEqual(
        GetCallsStatusCode.REVERTED,
      );
    });

    it.each([
      TransactionStatus.approved,
      TransactionStatus.signed,
      TransactionStatus.submitted,
      TransactionStatus.unapproved,
    ])(
      'returns pending status if transaction status is %s',
      (status: TransactionStatus) => {
        getTransactionControllerStateMock.mockReturnValueOnce({
          transactions: [
            {
              ...TRANSACTION_META_MOCK,
              status,
            },
          ],
        } as unknown as TransactionControllerState);

        expect(getCallsStatus(messenger, BATCH_ID_MOCK)?.status).toStrictEqual(
          GetCallsStatusCode.PENDING,
        );
      },
    );

    it('throws if no transactions found', () => {
      getTransactionControllerStateMock.mockReturnValueOnce({
        transactions: [],
      } as unknown as TransactionControllerState);

      expect(() => getCallsStatus(messenger, BATCH_ID_MOCK)).toThrow(
        `No matching bundle found`,
      );
    });
  });
});
