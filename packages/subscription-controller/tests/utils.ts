import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';

/**
 * Generate a mock transaction meta.
 *
 * @returns A mock transaction meta.
 */
export function generateMockTxMeta(): TransactionMeta {
  return {
    txParams: {
      from: '0x0000000000000000000000000000000000000000',
      to: '0x0000000000000000000000000000000000000000',
      value: '0x00',
    },
    chainId: '0x1',
    id: '123',
    networkClientId: '1',
    status: TransactionStatus.unapproved,
    time: Date.now(),
    type: TransactionType.contractInteraction,
    origin: 'https://metamask.io',
    submittedTime: Date.now(),
  };
}
