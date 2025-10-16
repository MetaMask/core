import type { Hex } from '@metamask/utils';

import { ExtraTransactionsPublishHook } from './ExtraTransactionsPublishHook';
import type {
  BatchTransactionParams,
  TransactionController,
  TransactionMeta,
} from '..';
import type { BatchTransaction } from '../types';
import { TransactionType } from '../types';

const SIGNED_TRANSACTION_MOCK = '0xffe';
const SIGNED_TRANSACTION_2_MOCK = '0xfff' as Hex;
const TRANSACTION_HASH_MOCK = '0xeee';

const BATCH_TRANSACTION_PARAMS_MOCK: BatchTransactionParams = {
  data: '0x123',
  gas: '0xab1',
  maxFeePerGas: '0xab2',
  maxPriorityFeePerGas: '0xab3',
  to: '0x456',
  value: '0x789',
};

const BATCH_TRANSACTION_PARAMS_2_MOCK: BatchTransactionParams = {
  data: '0x321',
  gas: '0xab4',
  maxFeePerGas: '0xab5',
  maxPriorityFeePerGas: '0xab6',
  to: '0x654',
  value: '0x987',
};

const BATCH_TRANSACTION_MOCK: BatchTransaction = {
  ...BATCH_TRANSACTION_PARAMS_MOCK,
  type: TransactionType.gasPayment,
};

const BATCH_TRANSACTION_2_MOCK: BatchTransaction = {
  ...BATCH_TRANSACTION_PARAMS_2_MOCK,
  type: TransactionType.swap,
};

const TRANSACTION_META_MOCK = {
  id: '123-456',
  networkClientId: 'testNetworkClientId',
  txParams: {
    data: '0xabc',
    from: '0xaab',
    gas: '0xab7',
    maxFeePerGas: '0xab8',
    maxPriorityFeePerGas: '0xab9',
    to: '0xdef',
    value: '0xfed',
  },
  batchTransactions: [BATCH_TRANSACTION_MOCK, BATCH_TRANSACTION_2_MOCK],
} as TransactionMeta;

describe('ExtraTransactionsPublishHook', () => {
  it('creates batch transaction', async () => {
    const addTransactionBatch: jest.MockedFn<
      TransactionController['addTransactionBatch']
    > = jest.fn();

    const hookInstance = new ExtraTransactionsPublishHook({
      addTransactionBatch,
    });

    const hook = hookInstance.getHook();

    hook(TRANSACTION_META_MOCK, SIGNED_TRANSACTION_MOCK).catch(() => {
      // Intentionally empty
    });

    expect(addTransactionBatch).toHaveBeenCalledTimes(1);
    expect(addTransactionBatch).toHaveBeenCalledWith({
      from: TRANSACTION_META_MOCK.txParams.from,
      networkClientId: TRANSACTION_META_MOCK.networkClientId,
      transactions: [
        {
          existingTransaction: {
            id: TRANSACTION_META_MOCK.id,
            onPublish: expect.any(Function),
            signedTransaction: SIGNED_TRANSACTION_MOCK,
          },
          params: {
            data: TRANSACTION_META_MOCK.txParams.data,
            gas: TRANSACTION_META_MOCK.txParams.gas,
            maxFeePerGas: TRANSACTION_META_MOCK.txParams.maxFeePerGas,
            maxPriorityFeePerGas:
              TRANSACTION_META_MOCK.txParams.maxPriorityFeePerGas,
            to: TRANSACTION_META_MOCK.txParams.to,
            value: TRANSACTION_META_MOCK.txParams.value,
          },
        },
        {
          params: BATCH_TRANSACTION_PARAMS_MOCK,
          type: BATCH_TRANSACTION_MOCK.type,
        },
        {
          params: BATCH_TRANSACTION_PARAMS_2_MOCK,
          type: BATCH_TRANSACTION_2_MOCK.type,
        },
      ],
      disable7702: true,
      disableHook: false,
      disableSequential: true,
      requireApproval: false,
    });
  });

  it('resolves when onPublish callback is called', async () => {
    const addTransactionBatch: jest.MockedFn<
      TransactionController['addTransactionBatch']
    > = jest.fn();

    const hookInstance = new ExtraTransactionsPublishHook({
      addTransactionBatch,
    });

    const hook = hookInstance.getHook();

    const hookPromise = hook(
      TRANSACTION_META_MOCK,
      SIGNED_TRANSACTION_MOCK,
    ).catch(() => {
      // Intentionally empty
    });

    const onPublish =
      addTransactionBatch.mock.calls[0][0].transactions[0].existingTransaction
        ?.onPublish;

    onPublish?.({ transactionHash: TRANSACTION_HASH_MOCK });

    expect(addTransactionBatch.mock.calls[0][0].transactions[1].type).toBe(
      TransactionType.gasPayment,
    );

    expect(await hookPromise).toStrictEqual({
      transactionHash: TRANSACTION_HASH_MOCK,
    });
  });

  it('rejects if addTransactionBatch throws', async () => {
    const addTransactionBatch: jest.MockedFn<
      TransactionController['addTransactionBatch']
    > = jest.fn().mockImplementation(() => {
      throw new Error('Test error');
    });

    const hookInstance = new ExtraTransactionsPublishHook({
      addTransactionBatch,
    });

    const hook = hookInstance.getHook();

    const hookPromise = hook(TRANSACTION_META_MOCK, SIGNED_TRANSACTION_MOCK);

    hookPromise.catch(() => {
      // Intentionally empty
    });

    await expect(hookPromise).rejects.toThrow('Test error');
  });

  it('uses batch transaction options', async () => {
    const addTransactionBatch: jest.MockedFn<
      TransactionController['addTransactionBatch']
    > = jest.fn();

    const hookInstance = new ExtraTransactionsPublishHook({
      addTransactionBatch,
    });

    const hook = hookInstance.getHook();

    hook(
      {
        ...TRANSACTION_META_MOCK,
        batchTransactionsOptions: {
          disable7702: true,
          disableHook: true,
          disableSequential: true,
        },
      },
      SIGNED_TRANSACTION_MOCK,
    ).catch(() => {
      // Intentionally empty
    });

    expect(addTransactionBatch).toHaveBeenCalledTimes(1);
    expect(addTransactionBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        disable7702: true,
        disableHook: true,
        disableSequential: true,
      }),
    );
  });

  it('orders transactions based on isAfter', () => {
    const addTransactionBatch: jest.MockedFn<
      TransactionController['addTransactionBatch']
    > = jest.fn();

    const hookInstance = new ExtraTransactionsPublishHook({
      addTransactionBatch,
    });

    const hook = hookInstance.getHook();

    hook(
      {
        ...TRANSACTION_META_MOCK,
        batchTransactions: [
          {
            ...BATCH_TRANSACTION_MOCK,
            isAfter: true,
          },
          {
            ...BATCH_TRANSACTION_2_MOCK,
          },
          {
            ...BATCH_TRANSACTION_2_MOCK,
            isAfter: false,
          },
        ],
      },
      SIGNED_TRANSACTION_MOCK,
    ).catch(() => {
      // Intentionally empty
    });

    expect(addTransactionBatch).toHaveBeenCalledTimes(1);
    expect(addTransactionBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        transactions: [
          {
            params: BATCH_TRANSACTION_PARAMS_2_MOCK,
            type: BATCH_TRANSACTION_2_MOCK.type,
          },
          expect.objectContaining({
            existingTransaction: expect.objectContaining({
              id: TRANSACTION_META_MOCK.id,
            }),
          }),
          {
            params: BATCH_TRANSACTION_PARAMS_MOCK,
            type: BATCH_TRANSACTION_MOCK.type,
          },
          {
            params: BATCH_TRANSACTION_PARAMS_2_MOCK,
            type: BATCH_TRANSACTION_2_MOCK.type,
          },
        ],
      }),
    );
  });

  it('calls original publish hook if existing publish callback is called with new signature', async () => {
    const addTransactionBatch: jest.MockedFn<
      TransactionController['addTransactionBatch']
    > = jest.fn();

    const originalPublishHook = jest
      .fn()
      .mockResolvedValue({ transactionHash: TRANSACTION_HASH_MOCK });

    const hookInstance = new ExtraTransactionsPublishHook({
      addTransactionBatch,
      originalPublishHook,
    });

    const hook = hookInstance.getHook();

    const hookPromise = hook(
      TRANSACTION_META_MOCK,
      SIGNED_TRANSACTION_MOCK,
    ).catch(() => {
      // Intentionally empty
    });

    const onPublish =
      addTransactionBatch.mock.calls[0][0].transactions[0].existingTransaction
        ?.onPublish;

    onPublish?.({
      transactionHash: undefined,
      newSignature: SIGNED_TRANSACTION_2_MOCK,
    });

    expect(originalPublishHook).toHaveBeenCalledTimes(1);
    expect(originalPublishHook).toHaveBeenCalledWith(
      TRANSACTION_META_MOCK,
      SIGNED_TRANSACTION_2_MOCK,
    );

    expect(await hookPromise).toStrictEqual({
      transactionHash: TRANSACTION_HASH_MOCK,
    });
  });
});
