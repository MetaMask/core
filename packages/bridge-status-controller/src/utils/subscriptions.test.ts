import {
  CHAIN_IDS,
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import {
  getControllerMessenger,
  getMockPayControllerState,
  getMockPayQuote,
  getMockTransactionControllerState,
  getRootMessenger,
} from '../__fixtures__/test-utils.js';
import { Operation } from '../types.js';
import {
  mmPayQuotesReadySubscription,
  unapprovedTxSubscription,
  withdrawUpdateHandler,
} from './subscriptions.js';

const BATCH_ID = '0x1234BatchId';
const OTHER_BATCH_ID = '0xotherBatch';
const TX_ID = 'deposit-tx-id';
const MONEY_ACCOUNT = '0x1111111111111111111111111111111111111111' as const;
const UNDERLYING_TOKEN = '0x8888888888888888888888888888888888888888' as const;

const depositTxMeta = (
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta => ({
  id: TX_ID,
  batchId: BATCH_ID,
  type: TransactionType.moneyAccountDeposit,
  status: TransactionStatus.unapproved,
  chainId: CHAIN_IDS.ARBITRUM,
  networkClientId: 'arb',
  time: 1,
  txParams: {
    data: '0xdeposit',
    from: MONEY_ACCOUNT,
    to: '0x7777777777777777777777777777777777777777',
  },
  ...overrides,
});

const throwingStatusTx = (tx: TransactionMeta): TransactionMeta => {
  Object.defineProperty(tx, 'status', {
    get: (): TransactionStatus => {
      throw new Error('status boom');
    },
  });
  return tx;
};

const setup = (
  transactions: TransactionMeta[],
): {
  rootMessenger: ReturnType<typeof getRootMessenger>;
  messenger: ReturnType<typeof getControllerMessenger>;
} => {
  const rootMessenger = getRootMessenger();
  const messenger = getControllerMessenger(rootMessenger);
  rootMessenger.registerActionHandler('TransactionController:getState', () =>
    getMockTransactionControllerState(transactions),
  );
  rootMessenger.registerActionHandler(
    'TransactionPayController:setTransactionConfig',
    (): void => undefined,
  );
  rootMessenger.registerActionHandler(
    'TransactionPayController:updatePaymentToken',
    (): void => undefined,
  );
  return { rootMessenger, messenger };
};

describe('mmPayQuotesReadySubscription', () => {
  it('rejects when reading trade meta status throws after quotes exist', async () => {
    const { rootMessenger, messenger } = setup([
      throwingStatusTx(depositTxMeta()),
    ]);
    const { promise } = mmPayQuotesReadySubscription(messenger, BATCH_ID);
    rootMessenger.publish(
      'TransactionPayController:stateChange',
      {
        transactionData: {
          [TX_ID]: { isLoading: false, tokens: [] },
        },
      },
      [],
    );
    rootMessenger.publish(
      'TransactionPayController:stateChange',
      getMockPayControllerState(TX_ID, [getMockPayQuote()]),
      [],
    );
    await expect(promise).rejects.toThrow('status boom');
  });
});

describe('unapprovedTxSubscription', () => {
  it('ignores txs from other batches and non-unapproved status', async () => {
    const { rootMessenger, messenger } = setup([]);
    const { promise } = unapprovedTxSubscription(
      messenger,
      BATCH_ID,
      Operation.DEPOSIT,
      { address: MONEY_ACCOUNT },
      UNDERLYING_TOKEN,
      CHAIN_IDS.ARBITRUM,
    );

    rootMessenger.publish(
      'TransactionController:unapprovedTransactionAdded',
      depositTxMeta({ batchId: OTHER_BATCH_ID }),
    );
    rootMessenger.publish(
      'TransactionController:unapprovedTransactionAdded',
      depositTxMeta({ status: TransactionStatus.confirmed }),
    );
    rootMessenger.publish(
      'TransactionController:unapprovedTransactionAdded',
      depositTxMeta(),
    );

    expect(await promise).toBeUndefined();
  });
});

describe('withdrawUpdateHandler', () => {
  it('ignores statuses that are not confirmed or failed', () => {
    const calls: string[] = [];

    withdrawUpdateHandler({
      txMeta: depositTxMeta({ status: TransactionStatus.submitted }),
      historyKey: TX_ID,
      onTransactionConfirmed: (): void => {
        calls.push('confirmed');
      },
      onTransactionFailed: (): void => {
        calls.push('failed');
      },
      onReportSubmittedOnce: (): void => undefined,
    });

    expect(calls).toStrictEqual([]);
  });
});
