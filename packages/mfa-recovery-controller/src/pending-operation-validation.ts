import { decodeAuthControllerToken } from './auth-controller-token.js';
import { hash } from './crypto.js';
import { MfaRecoveryError } from './errors.js';
import {
  countDistinctIdentifiers,
  getIdentifierAuthMode,
  MIN_IDENTIFIERS,
} from './identifier-auth.js';
import { isMutationReceipt } from './receipt-utils.js';
import { assertConfiguredAudienceIds } from './state-machine.js';
import type {
  Identifier,
  Mutation,
  MutationReceipt,
  PendingMutationPayload,
  PendingRecoverySecretHex,
  PendingRegisterPayload,
  PendingUpdateIdentifiersPayload,
} from './types.js';

/**
 * A pending mutation's recovery secret, held in memory only.
 */
export type KeptRecoverySecret = {
  mutationId: string;
  recoverySecret: PendingRecoverySecretHex;
};

/**
 * Validates persisted pending state before it can trigger authorization or
 * escrow operations.
 *
 * @param pending - Persisted pending state.
 * @param escrowIds - Build-configured escrow ids.
 * @param kept - Recovery secret kept in memory, if any. Without one for this
 * mutation, a secret-bearing payload cannot be checked against `payloadHash`.
 * @throws If the pending state is malformed or inconsistent.
 */
export async function assertValidPendingOperation(
  pending: unknown,
  escrowIds: string[],
  kept?: KeptRecoverySecret,
): Promise<void> {
  if (!isRecord(pending)) {
    throwInvalidPendingOperation();
  }
  if (pending.phase !== 'authorizing' && pending.phase !== 'writing') {
    throwInvalidPendingOperation();
  }
  if (!isRecord(pending.mutation)) {
    throwInvalidPendingOperation();
  }

  const mutationValue = pending.mutation;
  if (
    typeof mutationValue.id !== 'string' ||
    typeof mutationValue.profileId !== 'string' ||
    !isMutationOperation(mutationValue.operation) ||
    typeof mutationValue.expectedVersion !== 'number' ||
    !Number.isInteger(mutationValue.expectedVersion) ||
    mutationValue.expectedVersion < 0 ||
    typeof mutationValue.newVersion !== 'number' ||
    !Number.isInteger(mutationValue.newVersion) ||
    mutationValue.newVersion < 0 ||
    mutationValue.newVersion !== mutationValue.expectedVersion + 1 ||
    typeof mutationValue.payloadHash !== 'string' ||
    typeof mutationValue.requestHash !== 'string' ||
    !Array.isArray(mutationValue.audiences) ||
    !mutationValue.audiences.every((audience): audience is string => {
      return typeof audience === 'string';
    })
  ) {
    throwInvalidPendingOperation();
  }
  const mutation = mutationValue as unknown as Mutation;
  assertConfiguredAudienceIds(mutation.audiences, escrowIds);

  const { payload } = pending;
  if (!isPendingPayload(mutation.operation, payload)) {
    throwInvalidPendingOperation();
  }
  if (pendingPayloadHasIdentifiers(payload)) {
    for (const identifier of payload.identifiers) {
      getIdentifierAuthMode(identifier.type);
    }
  }

  if (
    mutation.operation === 'register'
      ? pending.identifier !== null
      : !isIdentifier(pending.identifier)
  ) {
    throwInvalidPendingOperation();
  }
  if (mutation.operation !== 'register' && isIdentifier(pending.identifier)) {
    getIdentifierAuthMode(pending.identifier.type);
  }

  if (mutation.operation === 'register' && mutation.expectedVersion !== 0) {
    throwInvalidPendingOperation();
  }
  const recoverySecret =
    kept?.mutationId === mutation.id ? kept.recoverySecret : undefined;
  if (
    mutation.operation === 'updateIdentifiers' ||
    recoverySecret !== undefined
  ) {
    await assertPayloadHash(mutation, payload, recoverySecret);
  }
  const requestHash = await hash({
    id: mutation.id,
    profileId: mutation.profileId,
    operation: mutation.operation,
    expectedVersion: mutation.expectedVersion,
    newVersion: mutation.newVersion,
    payloadHash: mutation.payloadHash,
    audiences: mutation.audiences,
  });
  if (requestHash !== mutation.requestHash) {
    throwInvalidPendingOperation();
  }

  if (pending.phase === 'authorizing') {
    return;
  }
  const token = decodeAuthControllerToken(pending.authControllerToken);
  const { approvedIdentifiers } = pending;
  if (
    token?.sub !== mutation.profileId ||
    token.ext.requestHash !== mutation.requestHash ||
    token.ext.aal < 2 ||
    !Array.isArray(approvedIdentifiers) ||
    !approvedIdentifiers.every(isIdentifier) ||
    (pendingPayloadHasIdentifiers(payload) &&
      (token.ext.identifiersHash !== (await hash(approvedIdentifiers)) ||
        !(await isApprovedSubset(payload.identifiers, approvedIdentifiers)))) ||
    !isMutationReceiptArray(pending.receipts)
  ) {
    throwInvalidPendingOperation();
  }
}

/**
 * Escrows reject non-SIWE payload identifiers that are not exactly (verifier
 * included) in the approval's list, and the rejection leaves the write
 * unabortable. SIWE identifiers are proven by their own authorizations.
 *
 * @param identifiers - Payload identifiers.
 * @param approvedIdentifiers - The approval's identifiers.
 * @returns Whether every non-SIWE payload identifier is in the approval.
 */
async function isApprovedSubset(
  identifiers: Identifier[],
  approvedIdentifiers: Identifier[],
): Promise<boolean> {
  const approved = new Set(await Promise.all(approvedIdentifiers.map(hash)));
  const hashes = await Promise.all(
    identifiers.filter(({ type }) => type !== 'siwe').map(hash),
  );
  return hashes.every((identifierHash) => approved.has(identifierHash));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMutationOperation(value: unknown): value is Mutation['operation'] {
  return (
    value === 'register' ||
    value === 'updateRecoverySecret' ||
    value === 'updateIdentifiers'
  );
}

/**
 * Checks a pending payload, plus the recovery secret for operations that
 * carry one, against the mutation's `payloadHash`.
 *
 * @param mutation - Pending mutation.
 * @param payload - Persisted pending payload.
 * @param recoverySecret - Recovery secret, for `register` and
 * `updateRecoverySecret`.
 * @throws If the hash does not match.
 */
export async function assertPayloadHash(
  mutation: Mutation,
  payload: PendingMutationPayload,
  recoverySecret: PendingRecoverySecretHex | undefined,
): Promise<void> {
  if (
    (await hashPendingPayload(payload, recoverySecret)) !== mutation.payloadHash
  ) {
    throw new MfaRecoveryError(
      'Pending payload does not match mutation',
      'payload_mismatch',
    );
  }
}

/**
 * @param payload - Persisted pending payload.
 * @param recoverySecret - Recovery secret, for `register` and
 * `updateRecoverySecret`.
 * @returns The mutation's `payloadHash`.
 */
export async function hashPendingPayload(
  payload: PendingMutationPayload,
  recoverySecret: PendingRecoverySecretHex | undefined,
): Promise<string> {
  return await hash(
    recoverySecret === undefined ? payload : { ...payload, recoverySecret },
  );
}

/**
 * @param payload - Persisted pending payload.
 * @returns Whether the payload includes an identifier set.
 */
export function pendingPayloadHasIdentifiers(
  payload: PendingMutationPayload,
): payload is PendingRegisterPayload | PendingUpdateIdentifiersPayload {
  return Object.prototype.hasOwnProperty.call(payload, 'identifiers');
}

function isPendingPayload(
  operation: Mutation['operation'],
  payload: unknown,
): payload is PendingMutationPayload {
  if (!isRecord(payload)) {
    return false;
  }
  const keys = Object.keys(payload);
  if (operation === 'updateRecoverySecret') {
    return keys.length === 0;
  }
  return (
    Array.isArray(payload.identifiers) &&
    payload.identifiers.every(isIdentifier) &&
    countDistinctIdentifiers(payload.identifiers) >= MIN_IDENTIFIERS &&
    keys.every((key) => key === 'identifiers')
  );
}

function isIdentifier(value: unknown): value is Identifier {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    typeof value.namespace === 'string' &&
    typeof value.value === 'string'
  );
}

function isMutationReceiptArray(value: unknown): value is MutationReceipt[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const escrowIds = new Set<string>();
  for (const receipt of value) {
    if (!isMutationReceipt(receipt) || escrowIds.has(receipt.escrowId)) {
      return false;
    }
    escrowIds.add(receipt.escrowId);
  }
  return true;
}

function throwInvalidPendingOperation(): never {
  throw new MfaRecoveryError(
    'Invalid pending operation',
    'invalid_pending_operation',
  );
}
