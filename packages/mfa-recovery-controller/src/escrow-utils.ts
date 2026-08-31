import { areUint8ArraysEqual } from '@metamask/utils';

import { MfaRecoveryError } from './errors.js';
import type {
  Mutation,
  MutationReceipt,
  RecoveryEscrowProvider,
} from './types.js';

export type RecoverySecretResult = {
  escrowId: string;
  recoverySecret: Uint8Array;
  version: number;
  lastMutationId: string;
};

/**
 * Identifies a fulfilled promise result for TypeScript narrowing.
 *
 * @param result - Settled promise result.
 * @returns Whether the result is fulfilled.
 */
export function isFulfilledResult<Result>(
  result: PromiseSettledResult<Result>,
): result is PromiseFulfilledResult<Result> {
  return result.status === 'fulfilled';
}

/**
 * Checks the serialized shape of a mutation receipt.
 *
 * @param value - Decrypted or provider-returned value.
 * @returns Whether the value has a mutation receipt shape.
 */
export function isMutationReceipt(value: unknown): value is MutationReceipt {
  return (
    isRecord(value) &&
    typeof value.mutationId === 'string' &&
    typeof value.requestHash === 'string' &&
    typeof value.escrowId === 'string' &&
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    value.version >= 0 &&
    typeof value.signature === 'string'
  );
}

/**
 * Verifies a receipt against its expected target escrow.
 *
 * The provider performs cryptographic verification using its build-pinned
 * configuration; the target identity check is performed here as well.
 *
 * @param receipt - Receipt returned by an escrow.
 * @param mutation - Mutation the receipt must acknowledge.
 * @param escrow - Expected target escrow provider.
 * @param expectedEscrowId - Build-configured identity of the target escrow.
 * @returns Whether the receipt is valid for the target.
 */
export function verifyMutationReceipt(
  receipt: MutationReceipt,
  mutation: Mutation,
  escrow: RecoveryEscrowProvider,
  expectedEscrowId: string,
): boolean {
  if (receipt.escrowId !== expectedEscrowId) {
    return false;
  }
  try {
    return escrow.verifyReceipt(receipt, mutation, expectedEscrowId);
  } catch {
    return false;
  }
}

/**
 * Selects the highest consistent successful recovery-secret response.
 *
 * @param results - Settled escrow read results.
 * @returns The selected recovery-secret response.
 * @throws If no response succeeds or matching highest versions disagree.
 */
export function selectHighestConsistentVersion(
  results: PromiseSettledResult<RecoverySecretResult>[],
): Omit<RecoverySecretResult, 'escrowId'> {
  const responses = results
    .filter(isFulfilledResult)
    .map((result) => result.value);
  if (responses.length === 0) {
    throw new MfaRecoveryError(
      'No escrow returned a recovery secret',
      'read_failed',
    );
  }
  const highestVersion = Math.max(
    ...responses.map((response) => response.version),
  );
  const highest = responses.filter(
    (response) => response.version === highestVersion,
  );
  const selected = highest[0];
  if (
    !highest.every(
      (response) =>
        response.lastMutationId === selected.lastMutationId &&
        areUint8ArraysEqual(response.recoverySecret, selected.recoverySecret),
    )
  ) {
    throw new MfaRecoveryError('Replica corruption', 'replica_corruption');
  }
  return selected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
