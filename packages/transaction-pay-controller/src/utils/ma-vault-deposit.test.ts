import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '../types.js';
import { findRecentChompVaultDeposit } from './chomp.js';
import { submitMoneyAccountVaultDeposit } from './ma-vault-deposit.js';
import { getNetworkClientId } from './provider.js';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from './transaction.js';

jest.mock('./chomp');
jest.mock('./provider');
jest.mock('./transaction');

const TRANSACTION_ID_MOCK = 'tx-id';
const MONEY_ACCOUNT_ADDRESS_MOCK =
  '0x1111111111111111111111111111111111111111' as Hex;
const NETWORK_CLIENT_ID_MOCK = 'network-client-id-mock';

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID_MOCK,
  nestedTransactions: [
    { data: '0xoldApprove' as Hex, to: '0xapprove' as Hex },
    { data: '0xoldDeposit' as Hex, to: '0xdeposit' as Hex },
  ],
  requiredAssets: [{ amount: '0x0' }],
  txParams: { from: MONEY_ACCOUNT_ADDRESS_MOCK },
  type: TransactionType.batch,
} as unknown as TransactionMeta;

function buildMessenger(
  callMock: jest.Mock = jest.fn(),
): TransactionPayControllerMessenger {
  return { call: callMock } as unknown as TransactionPayControllerMessenger;
}

function callSubmit({
  callMock = jest.fn(),
  sourceAmountRaw = '5000000',
  transaction = TRANSACTION_MOCK,
  vaultDisabled = false,
  fromBlock,
}: {
  callMock?: jest.Mock;
  sourceAmountRaw?: string;
  transaction?: TransactionMeta;
  vaultDisabled?: boolean;
  fromBlock?: Hex;
} = {}): Promise<{ transactionHash?: Hex }> {
  return submitMoneyAccountVaultDeposit({
    fromBlock,
    messenger: buildMessenger(callMock),
    sourceAmountRaw,
    transaction,
    vaultDisabled,
  });
}

describe('submitMoneyAccountVaultDeposit', () => {
  const collectTransactionIdsMock = jest.mocked(collectTransactionIds);
  const getNetworkClientIdMock = jest.mocked(getNetworkClientId);
  const getTransactionMock = jest.mocked(getTransaction);
  const updateTransactionMock = jest.mocked(updateTransaction);
  const waitForTransactionConfirmedMock = jest.mocked(
    waitForTransactionConfirmed,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    getNetworkClientIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
    collectTransactionIdsMock.mockImplementation(
      (_chainId, _from, _messenger, onTransaction) => {
        onTransaction('child-1');
        onTransaction('child-2');
        return { end: jest.fn() };
      },
    );
    getTransactionMock.mockImplementation((transactionId) => {
      if (transactionId === TRANSACTION_ID_MOCK) {
        return TRANSACTION_MOCK;
      }
      if (transactionId === 'child-2') {
        return { hash: '0xvault' } as TransactionMeta;
      }
      return undefined;
    });
    waitForTransactionConfirmedMock.mockResolvedValue();
  });

  it('submits a sponsored vault batch with refreshed calldata', async () => {
    updateTransactionMock.mockImplementation((_request, callback) => {
      callback({
        ...TRANSACTION_MOCK,
        nestedTransactions: TRANSACTION_MOCK.nestedTransactions?.map((nt) => ({
          ...nt,
        })),
        requiredAssets: [{ amount: '0x0' }],
      } as TransactionMeta);
    });

    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getAmountData') {
        return Promise.resolve({
          updates: [
            { data: '0xnewApprove', nestedTransactionIndex: 0 },
            { data: '0xnewDeposit', nestedTransactionIndex: 1 },
          ],
        });
      }
      if (action === 'TransactionController:addTransactionBatch') {
        return Promise.resolve({ batchId: 'batch-id' });
      }
      throw new Error(`Unexpected action: ${action}`);
    });

    const result = await callSubmit({ callMock });

    expect(callMock).toHaveBeenCalledWith(
      'TransactionPayController:getAmountData',
      { amount: '5000000', transaction: TRANSACTION_MOCK },
    );
    expect(updateTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Money Account vault deposit: update vault amount',
        transactionId: TRANSACTION_ID_MOCK,
      }),
      expect.any(Function),
    );
    expect(callMock).toHaveBeenCalledWith(
      'TransactionController:addTransactionBatch',
      expect.objectContaining({
        disableHook: true,
        disableSequential: true,
        disableUpgrade: true,
        from: MONEY_ACCOUNT_ADDRESS_MOCK,
        isGasFeeSponsored: true,
        isInternal: true,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        origin: 'metamask',
        requireApproval: false,
        skipInitialGasEstimate: true,
        transactions: [
          {
            params: { data: '0xnewApprove', to: '0xapprove', value: '0x0' },
            type: TransactionType.tokenMethodApprove,
          },
          {
            params: { data: '0xnewDeposit', to: '0xdeposit', value: '0x0' },
            type: TransactionType.contractInteraction,
          },
        ],
      }),
    );
    expect(updateTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 'Add required transaction ID from Money Account vault submission',
        transactionId: TRANSACTION_ID_MOCK,
      }),
      expect.any(Function),
    );
    expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
      'child-1',
      expect.anything(),
    );
    expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
      'child-2',
      expect.anything(),
    );
    expect(result).toStrictEqual({ transactionHash: '0xvault' });
  });

  it('skips the vault batch when vaultDisabled is true', async () => {
    const callMock = jest.fn();

    const result = await callSubmit({ callMock, vaultDisabled: true });

    expect(result).toStrictEqual({ transactionHash: '0x' });
    expect(callMock).not.toHaveBeenCalled();
    expect(updateTransactionMock).not.toHaveBeenCalled();
    expect(collectTransactionIdsMock).not.toHaveBeenCalled();
  });

  it('throws when the Money Account address is missing', async () => {
    const transaction = {
      ...TRANSACTION_MOCK,
      txParams: {},
    } as TransactionMeta;

    await expect(callSubmit({ transaction })).rejects.toThrow(
      'Missing Money Account address',
    );
  });

  it('throws when getAmountData returns no updates', async () => {
    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getAmountData') {
        return Promise.resolve({ updates: [] });
      }
      throw new Error(`Unexpected action: ${action}`);
    });

    await expect(callSubmit({ callMock })).rejects.toThrow('No amount updates');
  });

  it('throws when nested transactions are missing', async () => {
    const transaction = {
      ...TRANSACTION_MOCK,
      nestedTransactions: undefined,
    } as TransactionMeta;
    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getAmountData') {
        return Promise.resolve({
          updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
        });
      }
      throw new Error(`Unexpected action: ${action}`);
    });

    getTransactionMock.mockReturnValue(transaction);

    await expect(callSubmit({ callMock, transaction })).rejects.toThrow(
      'Missing nested transactions',
    );
  });

  it('prefixes addTransactionBatch errors with Vault and stops collecting IDs', async () => {
    const endMock = jest.fn();
    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getAmountData') {
        return Promise.resolve({
          updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
        });
      }
      if (action === 'TransactionController:addTransactionBatch') {
        throw new Error('batch failed');
      }
      throw new Error(`Unexpected action: ${action}`);
    });
    collectTransactionIdsMock.mockReturnValue({ end: endMock });

    await expect(callSubmit({ callMock })).rejects.toThrow(
      'Vault: batch failed',
    );
    expect(endMock).toHaveBeenCalledTimes(1);
  });

  it('throws when no vault transactions are collected', async () => {
    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getAmountData') {
        return Promise.resolve({
          updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
        });
      }
      if (action === 'TransactionController:addTransactionBatch') {
        return Promise.resolve({ batchId: 'batch-id' });
      }
      throw new Error(`Unexpected action: ${action}`);
    });

    collectTransactionIdsMock.mockReturnValue({ end: jest.fn() });

    await expect(callSubmit({ callMock })).rejects.toThrow(
      'No transactions submitted',
    );
  });

  it('throws when the confirmed vault transaction has no hash', async () => {
    const callMock = jest.fn((action: string) => {
      if (action === 'TransactionPayController:getAmountData') {
        return Promise.resolve({
          updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
        });
      }
      if (action === 'TransactionController:addTransactionBatch') {
        return Promise.resolve({ batchId: 'batch-id' });
      }
      throw new Error(`Unexpected action: ${action}`);
    });

    getTransactionMock.mockImplementation((transactionId) => {
      if (transactionId === TRANSACTION_ID_MOCK) {
        return TRANSACTION_MOCK;
      }
      return undefined;
    });

    await expect(callSubmit({ callMock })).rejects.toThrow(
      'Missing transaction hash',
    );
  });

  describe('CHOMP idempotency', () => {
    const CHOMP_FROM_BLOCK = '0x100' as Hex;
    const CHOMP_HASH =
      '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;
    const findRecentChompVaultDepositMock = jest.mocked(
      findRecentChompVaultDeposit,
    );

    function makeCallMock(): jest.Mock {
      return jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [
              { data: '0xnewApprove', nestedTransactionIndex: 0 },
              { data: '0xnewDeposit', nestedTransactionIndex: 1 },
            ],
          });
        }
        if (action === 'TransactionController:addTransactionBatch') {
          return Promise.resolve({ batchId: 'batch-id' });
        }
        throw new Error(`Unexpected action: ${action}`);
      });
    }

    it('skips addTransactionBatch and returns CHOMP hash when pre-check matches', async () => {
      findRecentChompVaultDepositMock.mockResolvedValue(CHOMP_HASH);

      const result = await callSubmit({
        callMock: makeCallMock(),
        fromBlock: CHOMP_FROM_BLOCK,
      });

      expect(result).toStrictEqual({ transactionHash: CHOMP_HASH });
      expect(collectTransactionIdsMock).not.toHaveBeenCalled();
    });

    it('detects CHOMP in the catch path and returns the CHOMP hash', async () => {
      findRecentChompVaultDepositMock
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(CHOMP_HASH);

      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
          });
        }
        if (action === 'TransactionController:addTransactionBatch') {
          throw new Error('Account does not support EIP-7702');
        }
        throw new Error(`Unexpected action: ${action}`);
      });

      const result = await callSubmit({
        callMock,
        fromBlock: CHOMP_FROM_BLOCK,
      });

      expect(result).toStrictEqual({ transactionHash: CHOMP_HASH });
      expect(findRecentChompVaultDepositMock).toHaveBeenCalledTimes(2);
    });

    it('preserves the Vault-prefixed error when no CHOMP match in catch path', async () => {
      findRecentChompVaultDepositMock.mockResolvedValue(undefined);

      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
          });
        }
        if (action === 'TransactionController:addTransactionBatch') {
          throw new Error('batch failed');
        }
        throw new Error(`Unexpected action: ${action}`);
      });

      await expect(
        callSubmit({ callMock, fromBlock: CHOMP_FROM_BLOCK }),
      ).rejects.toThrow('Vault: batch failed');
    });

    it('proceeds with vault submit when pre-check throws', async () => {
      findRecentChompVaultDepositMock
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce(undefined);

      const result = await callSubmit({
        callMock: makeCallMock(),
        fromBlock: CHOMP_FROM_BLOCK,
      });

      expect(result).toStrictEqual({ transactionHash: '0xvault' });
    });

    it('re-throws Vault-prefixed error when both addTransactionBatch and CHOMP post-check fail', async () => {
      findRecentChompVaultDepositMock
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('rpc error'));

      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getAmountData') {
          return Promise.resolve({
            updates: [{ data: '0xnewApprove', nestedTransactionIndex: 0 }],
          });
        }
        if (action === 'TransactionController:addTransactionBatch') {
          throw new Error('Account does not support EIP-7702');
        }
        throw new Error(`Unexpected action: ${action}`);
      });

      await expect(
        callSubmit({ callMock, fromBlock: CHOMP_FROM_BLOCK }),
      ).rejects.toThrow('Vault: Account does not support EIP-7702');

      expect(findRecentChompVaultDepositMock).toHaveBeenCalledTimes(2);
    });

    it('skips CHOMP checks when fromBlock is not provided', async () => {
      const result = await callSubmit({ callMock: makeCallMock() });

      expect(result).toStrictEqual({ transactionHash: '0xvault' });
      expect(findRecentChompVaultDepositMock).not.toHaveBeenCalled();
    });
  });
});
