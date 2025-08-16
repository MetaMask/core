import {
  TransactionStatus,
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import { v1 as random } from 'uuid';

import { coverageStatuses, type CoverageStatus } from '../src/types';

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
    id: random(),
    networkClientId: '1',
    status: TransactionStatus.unapproved,
    time: Date.now(),
    type: TransactionType.contractInteraction,
    origin: 'https://metamask.io',
    submittedTime: Date.now(),
  };
}

/**
 * Get a random coverage status.
 *
 * @returns A random coverage status.
 */
export function getRandomCoverageStatus(): CoverageStatus {
  return coverageStatuses[Math.floor(Math.random() * coverageStatuses.length)];
}
