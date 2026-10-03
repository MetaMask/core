import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '../types.js';
import { withChompRecovery } from './chomp.js';
import { getNetworkClientId } from './provider.js';
import {
  resolveExecutionAccount,
  resolveNonAtomicRecipient,
  submitSecondLeg,
} from './second-leg.js';
import {
  collectTransactionIds,
  getTransaction,
  getTransferredAmountFromTxHash,
  updateTransaction,
  waitForTransactionConfirmed,
} from './transaction.js';

jest.mock('./chomp');
jest.mock('./provider');
jest.mock('./transaction');

const TRANSACTION_ID_MOCK = 'tx-id';
const FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const CHAIN_ID_MOCK = '0x279f' as Hex;
const FROM_BLOCK_MOCK = '0x100' as Hex;
const TOKEN_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const SETTLEMENT_HASH_MOCK = '0xsettlement' as Hex;
const NETWORK_CLIENT_ID_MOCK = 'network-client-id-mock';
const AMOUNT_MOCK = '5000000';
const PAYER_MOCK = '0x3333333333333333333333333333333333333333' as Hex;
const OVERRIDE_RECIPIENT_MOCK =
  '0x4444444444444444444444444444444444444444' as Hex;

const TRANSACTION_MOCK = {
  id: TRANSACTION_ID_MOCK,
  nestedTransactions: [
    { data: '0xoldApprove' as Hex, to: '0xapprove' as Hex },
    { data: '0xoldDeposit' as Hex, to: '0xdeposit' as Hex },
  ],
  requiredAssets: [{ amount: '0x0' }],
  txParams: { from: FROM_MOCK },
  type: TransactionType.batch,
} as unknown as TransactionMeta;

function buildMessenger(
  callMock: jest.Mock = jest.fn(),
): TransactionPayControllerMessenger {
  return { call: callMock } as unknown as TransactionPayControllerMessenger;
}

function buildAmountDataCallMock(
  overrides: {
    addTransactionBatch?: () => Promise<unknown>;
    updates?: { data: string; nestedTransactionIndex: number }[];
  } = {},
): jest.Mock {
  return jest.fn((action: string) => {
    if (action === 'TransactionPayController:getAmountData') {
      return Promise.resolve({
        updates: overrides.updates ?? [
          { data: '0xnewApprove', nestedTransactionIndex: 0 },
          { data: '0xnewDeposit', nestedTransactionIndex: 1 },
        ],
      });
    }

    if (action === 'TransactionController:addTransactionBatch') {
      return (
        overrides.addTransactionBatch?.() ??
        Promise.resolve({ batchId: 'batch-id' })
      );
    }

    throw new Error(`Unexpected action: ${action}`);
  });
}

describe('second-leg', () => {
  const collectTransactionIdsMock = jest.mocked(collectTransactionIds);
  const getNetworkClientIdMock = jest.mocked(getNetworkClientId);
  const getTransactionMock = jest.mocked(getTransaction);
  const getTransferredAmountFromTxHashMock = jest.mocked(
    getTransferredAmountFromTxHash,
  );
  const updateTransactionMock = jest.mocked(updateTransaction);
  const waitForTransactionConfirmedMock = jest.mocked(
    waitForTransactionConfirmed,
  );
  const withChompRecoveryMock = jest.mocked(withChompRecovery);

  beforeEach(() => {
    jest.resetAllMocks();

    withChompRecoveryMock.mockImplementation(
      async (_options, submit) => await submit(),
    );

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
        return { hash: '0xsecondleg' } as TransactionMeta;
      }
    });

    waitForTransactionConfirmedMock.mockResolvedValue();
  });

  describe('resolveExecutionAccount', () => {
    it('returns the executing account when it differs from the payer', () => {
      expect(resolveExecutionAccount(TRANSACTION_MOCK, PAYER_MOCK)).toBe(
        FROM_MOCK,
      );
    });

    it('returns undefined when the executing account is the payer', () => {
      expect(
        resolveExecutionAccount(TRANSACTION_MOCK, FROM_MOCK),
      ).toBeUndefined();
    });

    it('ignores case when comparing the executing account to the payer', () => {
      expect(
        resolveExecutionAccount(
          TRANSACTION_MOCK,
          FROM_MOCK.toUpperCase() as Hex,
        ),
      ).toBeUndefined();
    });

    it('returns undefined when the transaction has no params', () => {
      expect(
        resolveExecutionAccount({} as TransactionMeta, PAYER_MOCK),
      ).toBeUndefined();
    });
  });

  describe('resolveNonAtomicRecipient', () => {
    it('returns undefined for atomic flows', async () => {
      expect(
        await resolveNonAtomicRecipient(
          TRANSACTION_MOCK,
          { atomic: true, from: PAYER_MOCK } as never,
          buildMessenger(),
        ),
      ).toBeUndefined();
    });

    it('returns undefined when the request does not specify atomicity', async () => {
      expect(
        await resolveNonAtomicRecipient(
          TRANSACTION_MOCK,
          { from: PAYER_MOCK } as never,
          buildMessenger(),
        ),
      ).toBeUndefined();
    });

    it('settles on the executing account when the payer only funds the quote', async () => {
      expect(
        await resolveNonAtomicRecipient(
          TRANSACTION_MOCK,
          { atomic: false, from: PAYER_MOCK } as never,
          buildMessenger(),
        ),
      ).toBe(FROM_MOCK);
    });

    it('falls back to the payer when there is no distinct executing account', async () => {
      expect(
        await resolveNonAtomicRecipient(
          {} as TransactionMeta,
          { atomic: false, from: PAYER_MOCK } as never,
          buildMessenger(),
        ),
      ).toBe(PAYER_MOCK);
    });

    it('asks the client for the recipient on post-quote flows', async () => {
      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getState') {
          return {
            transactionData: {
              [TRANSACTION_ID_MOCK]: { tokens: [{ amountHuman: '1.5' }] },
            },
          };
        }

        if (action === 'TransactionPayController:getPaymentOverrideData') {
          return Promise.resolve({ recipient: OVERRIDE_RECIPIENT_MOCK });
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      const result = await resolveNonAtomicRecipient(
        TRANSACTION_MOCK,
        { atomic: false, from: PAYER_MOCK, isPostQuote: true } as never,
        buildMessenger(callMock),
      );

      expect(result).toBe(OVERRIDE_RECIPIENT_MOCK);
      expect(callMock).toHaveBeenCalledWith(
        'TransactionPayController:getPaymentOverrideData',
        expect.objectContaining({ amount: '1.5' }),
      );
    });

    it('defaults the post-quote amount to zero when no token amount is known', async () => {
      const callMock = jest.fn((action: string) => {
        if (action === 'TransactionPayController:getState') {
          return { transactionData: {} };
        }

        if (action === 'TransactionPayController:getPaymentOverrideData') {
          return Promise.resolve({ recipient: OVERRIDE_RECIPIENT_MOCK });
        }

        throw new Error(`Unexpected action: ${action}`);
      });

      await resolveNonAtomicRecipient(
        TRANSACTION_MOCK,
        { atomic: false, from: PAYER_MOCK, isPostQuote: true } as never,
        buildMessenger(callMock),
      );

      expect(callMock).toHaveBeenCalledWith(
        'TransactionPayController:getPaymentOverrideData',
        expect.objectContaining({ amount: '0' }),
      );
    });
  });

  describe('submitSecondLeg', () => {
    beforeEach(() => {
      getTransferredAmountFromTxHashMock.mockResolvedValue({
        amountRaw: AMOUNT_MOCK,
        blockNumber: FROM_BLOCK_MOCK,
      });
    });

    it('throws when settlement hash is missing', async () => {
      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          messenger: buildMessenger(),
          settlementHash: undefined,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Missing settlement hash');
    });

    it('throws when no amount can be read from the settlement transaction', async () => {
      getTransferredAmountFromTxHashMock.mockResolvedValue({
        amountRaw: undefined,
        blockNumber: undefined,
      });

      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          messenger: buildMessenger(),
          settlementHash: SETTLEMENT_HASH_MOCK,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow(
        `Could not determine settled amount from transaction ${SETTLEMENT_HASH_MOCK}`,
      );
    });

    it('reads the settled amount from the settlement transaction', async () => {
      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: buildMessenger(buildAmountDataCallMock()),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(getTransferredAmountFromTxHashMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: CHAIN_ID_MOCK,
          tokenAddress: TOKEN_MOCK,
          txHash: SETTLEMENT_HASH_MOCK,
          walletAddress: FROM_MOCK,
        }),
      );
    });

    it('passes fromBlock (receipt blockNumber) to type-specific handling', async () => {
      const messenger = buildMessenger(buildAmountDataCallMock());

      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger,
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(withChompRecoveryMock).toHaveBeenCalledWith(
        {
          from: FROM_MOCK,
          fromBlock: FROM_BLOCK_MOCK,
          messenger,
          sourceAmountRaw: AMOUNT_MOCK,
          transaction: TRANSACTION_MOCK,
        },
        expect.any(Function),
      );
    });

    it('calls getCalls with the settled amount', async () => {
      const getCallsMock = jest
        .fn()
        .mockResolvedValue([{ data: '0xcall' as Hex, to: '0xtarget' as Hex }]);

      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        getCalls: getCallsMock,
        messenger: buildMessenger(),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(getCallsMock).toHaveBeenCalledWith(AMOUNT_MOCK);
    });

    it('throws when getCalls returns empty array', async () => {
      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          getCalls: async () => [],
          messenger: buildMessenger(),
          settlementHash: SETTLEMENT_HASH_MOCK,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Missing second leg calls');
    });

    it('submits the calls from getCalls without re-encoding the parent calls', async () => {
      const callMock = buildAmountDataCallMock();

      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        getCalls: async () => [{ data: '0xprebuilt', to: '0xtarget' }],
        messenger: buildMessenger(callMock),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(callMock).not.toHaveBeenCalledWith(
        'TransactionPayController:getAmountData',
        expect.anything(),
      );
      expect(callMock).toHaveBeenCalledWith(
        'TransactionController:addTransactionBatch',
        expect.objectContaining({
          transactions: [
            {
              params: { data: '0xprebuilt', to: '0xtarget', value: '0x0' },
              type: TransactionType.tokenMethodApprove,
            },
          ],
        }),
      );
    });

    it('updates the parent transaction calls and required asset amount', async () => {
      const parentTransaction = {
        ...TRANSACTION_MOCK,
        nestedTransactions: TRANSACTION_MOCK.nestedTransactions?.map((nt) => ({
          ...nt,
        })),
        requiredAssets: [{ amount: '0x0' }],
      } as TransactionMeta;

      updateTransactionMock.mockImplementation((_request, callback) => {
        callback(parentTransaction);
      });

      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: buildMessenger(buildAmountDataCallMock()),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(parentTransaction.nestedTransactions).toStrictEqual([
        { data: '0xnewApprove', to: '0xapprove' },
        { data: '0xnewDeposit', to: '0xdeposit' },
      ]);
      expect(parentTransaction.requiredAssets?.[0].amount).toBe('0x4c4b40');
    });

    it('ignores amount updates that target a call index that does not exist', async () => {
      const parentTransaction = {
        ...TRANSACTION_MOCK,
        nestedTransactions: [{ data: '0xoldApprove', to: '0xapprove' }],
      } as TransactionMeta;

      getTransactionMock.mockImplementation((transactionId) =>
        transactionId === TRANSACTION_ID_MOCK
          ? parentTransaction
          : ({ hash: '0xsecondleg' } as TransactionMeta),
      );
      updateTransactionMock.mockImplementation((_request, callback) => {
        callback(parentTransaction);
      });

      const callMock = buildAmountDataCallMock({
        updates: [{ data: '0xnew', nestedTransactionIndex: 5 }],
      });

      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: buildMessenger(callMock),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(parentTransaction.nestedTransactions).toStrictEqual([
        { data: '0xoldApprove', to: '0xapprove' },
      ]);
      expect(callMock).toHaveBeenCalledWith(
        'TransactionController:addTransactionBatch',
        expect.objectContaining({
          transactions: [
            {
              params: { data: '0xoldApprove', to: '0xapprove', value: '0x0' },
              type: TransactionType.tokenMethodApprove,
            },
          ],
        }),
      );
    });

    it('leaves the required asset amount alone when the transaction has none', async () => {
      const parentTransaction = {
        ...TRANSACTION_MOCK,
        nestedTransactions: TRANSACTION_MOCK.nestedTransactions?.map((nt) => ({
          ...nt,
        })),
        requiredAssets: undefined,
      } as TransactionMeta;

      updateTransactionMock.mockImplementation((_request, callback) => {
        callback(parentTransaction);
      });

      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: buildMessenger(buildAmountDataCallMock()),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(parentTransaction.requiredAssets).toBeUndefined();
    });

    it('throws when there are no amount updates', async () => {
      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          messenger: buildMessenger(buildAmountDataCallMock({ updates: [] })),
          settlementHash: SETTLEMENT_HASH_MOCK,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('No amount updates');
    });

    it('throws when the transaction has no nested calls', async () => {
      getTransactionMock.mockReturnValue({
        ...TRANSACTION_MOCK,
        nestedTransactions: undefined,
      });

      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          messenger: buildMessenger(buildAmountDataCallMock()),
          settlementHash: SETTLEMENT_HASH_MOCK,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Missing nested transactions');
    });

    it('submits a sponsored batch on the requested chain from the requested account', async () => {
      const callMock = buildAmountDataCallMock();

      const result = await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: buildMessenger(callMock),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(getNetworkClientIdMock).toHaveBeenCalledWith(
        expect.anything(),
        CHAIN_ID_MOCK,
      );
      expect(callMock).toHaveBeenCalledWith(
        'TransactionController:addTransactionBatch',
        expect.objectContaining({
          disableHook: true,
          disableSequential: true,
          disableUpgrade: true,
          from: FROM_MOCK,
          isGasFeeSponsored: true,
          isInternal: true,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          origin: ORIGIN_METAMASK,
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
      expect(result).toStrictEqual({ transactionHash: '0xsecondleg' });
    });

    it('submits without sponsorship when sponsored is false', async () => {
      const callMock = buildAmountDataCallMock();

      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: buildMessenger(callMock),
        settlementHash: SETTLEMENT_HASH_MOCK,
        sponsored: false,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(callMock).toHaveBeenCalledWith(
        'TransactionController:addTransactionBatch',
        expect.objectContaining({ isGasFeeSponsored: false }),
      );
    });

    it('waits for every submitted child transaction to confirm', async () => {
      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: buildMessenger(buildAmountDataCallMock()),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
        'child-1',
        expect.anything(),
      );
      expect(waitForTransactionConfirmedMock).toHaveBeenCalledWith(
        'child-2',
        expect.anything(),
      );
    });

    it('prefixes submission errors', async () => {
      const callMock = buildAmountDataCallMock({
        addTransactionBatch: () => Promise.reject(new Error('submit failed')),
      });

      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          messenger: buildMessenger(callMock),
          settlementHash: SETTLEMENT_HASH_MOCK,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Second leg: submit failed');
    });

    it('records each submitted child transaction as required by the parent', async () => {
      await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: buildMessenger(buildAmountDataCallMock()),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      const parent = {} as TransactionMeta;

      for (const [options, updater] of updateTransactionMock.mock.calls) {
        if (
          options.note ===
          'Add required transaction ID from second leg submission'
        ) {
          updater(parent);
        }
      }

      expect(parent.requiredTransactionIds).toStrictEqual([
        'child-1',
        'child-2',
      ]);
    });

    it('updates the parent transaction even when type-specific handling skips submission', async () => {
      withChompRecoveryMock.mockResolvedValue({
        transactionHash: '0xexternal',
      });

      const callMock = buildAmountDataCallMock();

      const result = await submitSecondLeg({
        chainId: CHAIN_ID_MOCK,
        from: FROM_MOCK,
        messenger: buildMessenger(callMock),
        settlementHash: SETTLEMENT_HASH_MOCK,
        tokenAddress: TOKEN_MOCK,
        transaction: TRANSACTION_MOCK,
      });

      expect(result).toStrictEqual({ transactionHash: '0xexternal' });
      expect(updateTransactionMock).toHaveBeenCalledTimes(1);
      expect(callMock).not.toHaveBeenCalledWith(
        'TransactionController:addTransactionBatch',
        expect.anything(),
      );
    });

    it('prefixes errors raised by type-specific handling', async () => {
      withChompRecoveryMock.mockRejectedValue(
        new Error('Vault: submit failed'),
      );

      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          messenger: buildMessenger(buildAmountDataCallMock()),
          settlementHash: SETTLEMENT_HASH_MOCK,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow(/^Second leg: Vault: submit failed$/u);
    });

    it('does not prefix errors resolving the calls', async () => {
      const callMock = jest.fn().mockResolvedValue({ updates: [] });

      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          messenger: buildMessenger(callMock),
          settlementHash: SETTLEMENT_HASH_MOCK,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow(/^No amount updates$/u);
    });

    it('throws when no child transactions were submitted', async () => {
      collectTransactionIdsMock.mockReturnValue({ end: jest.fn() });

      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          messenger: buildMessenger(buildAmountDataCallMock()),
          settlementHash: SETTLEMENT_HASH_MOCK,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Second leg: No transactions submitted');
    });

    it('throws when the submitted transaction has no hash', async () => {
      getTransactionMock.mockImplementation((transactionId) =>
        transactionId === TRANSACTION_ID_MOCK ? TRANSACTION_MOCK : undefined,
      );

      await expect(
        submitSecondLeg({
          chainId: CHAIN_ID_MOCK,
          from: FROM_MOCK,
          messenger: buildMessenger(buildAmountDataCallMock()),
          settlementHash: SETTLEMENT_HASH_MOCK,
          tokenAddress: TOKEN_MOCK,
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Second leg: Missing transaction hash');
    });
  });
});
