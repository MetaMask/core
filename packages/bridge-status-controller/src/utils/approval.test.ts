import { CHAIN_IDS, TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import {
  getControllerMessenger,
  getMockTransactionControllerState,
  getRootMessenger,
} from '../__fixtures__/test-utils.js';
import { safeRejectTxBatch } from './approval.js';

const BATCH_ID = '0xbatch';

const tx = (id: string): TransactionMeta => ({
  id,
  batchId: BATCH_ID,
  status: TransactionStatus.unapproved,
  chainId: CHAIN_IDS.ARBITRUM,
  networkClientId: 'arb',
  time: 1,
  txParams: { from: '0xaccount1' },
});

const setup = (
  transactions: TransactionMeta[],
  reject: (id: string, error: unknown) => void,
): ReturnType<typeof getControllerMessenger> => {
  const rootMessenger = getRootMessenger();
  const messenger = getControllerMessenger(rootMessenger);
  rootMessenger.registerActionHandler('TransactionController:getState', () =>
    getMockTransactionControllerState(transactions),
  );
  rootMessenger.registerActionHandler(
    'ApprovalController:rejectRequest',
    reject,
  );
  return messenger;
};

describe('safeRejectTxBatch', () => {
  it('skips txs with no id and rejects the batch id', () => {
    const rejected: string[] = [];
    const messenger = setup([tx('')], (id): void => {
      rejected.push(id);
    });

    safeRejectTxBatch(messenger, BATCH_ID, 'boom');

    expect(rejected).toStrictEqual([BATCH_ID]);
  });

  it('tries the next id when reject throws', () => {
    const rejected: string[] = [];
    const messenger = setup([tx('tx-1')], (id): void => {
      rejected.push(id);
      throw new Error('still pending');
    });

    safeRejectTxBatch(messenger, BATCH_ID, 'boom');

    expect(rejected).toStrictEqual(['tx-1', BATCH_ID]);
  });
});
