import {
  SignatureRequestStatus,
  SignatureRequestType,
  type SignatureRequest,
} from '@metamask/signature-controller';
import {
  TransactionStatus,
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import type { SignTypedDataVersion } from 'src/constants';
import { v1 as random } from 'uuid';

import type { createMockMessenger } from './mocks/messenger';
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
    rawTx: '0xdeadbeef',
  };
}

/**
 * Generate a mock signature request.
 *
 * @param type - The type of the signature request.
 * @param version - The version of the signature request.
 * @returns A mock signature request.
 */
export function generateMockSignatureRequest(
  type: SignatureRequestType = SignatureRequestType.PersonalSign,
  version?: SignTypedDataVersion,
): SignatureRequest {
  return {
    chainId: '0x1',
    id: random(),
    type,
    messageParams: {
      data: '0x00',
      from: '0x0000000000000000000000000000000000000000',
      origin: 'https://metamask.io',
    },
    networkClientId: '1',
    status: SignatureRequestStatus.Unapproved,
    time: Date.now(),
    version,
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

/**
 * Get a random coverage result.
 *
 * @returns A random coverage result.
 */
export function getRandomCoverageResult() {
  return {
    status: getRandomCoverageStatus(),
    message: 'message',
    reasonCode: 'reasonCode',
  };
}

/**
 * Setup a coverage result received handler.
 *
 * @param messenger - The controller messenger.
 * @returns A promise that resolves when the coverage result is received.
 */
export function setupCoverageResultReceived(
  messenger: ReturnType<typeof createMockMessenger>['messenger'],
): Promise<void> {
  return new Promise<void>((resolve) => {
    const handler = (_coverageResult: unknown) => {
      messenger.unsubscribe('ShieldController:coverageResultReceived', handler);
      resolve();
    };
    messenger.subscribe('ShieldController:coverageResultReceived', handler);
  });
}

/**
 * Delay for a specified amount of time.
 *
 * @param ms - The number of milliseconds to delay.
 * @returns A promise that resolves after the specified amount of time.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
