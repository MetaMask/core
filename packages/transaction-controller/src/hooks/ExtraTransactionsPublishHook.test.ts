import { ExtraTransactionsPublishHook } from './ExtraTransactionsPublishHook';
import type {
  BatchTransactionParams,
  TransactionController,
  TransactionMeta,
} from '..';

const SIGNED_TRANSACTION_MOCK = '0xffe';
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
} as TransactionMeta;

describe('ExtraTransactionsPublishHook', () => {
  it('creates batch transaction', async () => {
    const addTransactionBatch: jest.MockedFn<
      TransactionController['addTransactionBatch']
    > = jest.fn();

    const hookInstance = new ExtraTransactionsPublishHook({
      addTransactionBatch,
      transactions: [
        BATCH_TRANSACTION_PARAMS_MOCK,
        BATCH_TRANSACTION_PARAMS_2_MOCK,
      ],
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
        },
        {
          params: BATCH_TRANSACTION_PARAMS_2_MOCK,
        },
      ],
      useHook: true,
    });
  });

  it('resolves when onPublish callback is called', async () => {
    const addTransactionBatch: jest.MockedFn<
      TransactionController['addTransactionBatch']
    > = jest.fn();

    const hookInstance = new ExtraTransactionsPublishHook({
      addTransactionBatch,
      transactions: [
        BATCH_TRANSACTION_PARAMS_MOCK,
        BATCH_TRANSACTION_PARAMS_2_MOCK,
      ],
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
      transactions: [
        BATCH_TRANSACTION_PARAMS_MOCK,
        BATCH_TRANSACTION_PARAMS_2_MOCK,
      ],
    });

    const hook = hookInstance.getHook();

    const hookPromise = hook(TRANSACTION_META_MOCK, SIGNED_TRANSACTION_MOCK);

    hookPromise.catch(() => {
      // Intentionally empty
    });

    await expect(hookPromise).rejects.toThrow('Test error');
  });
});
