import { hash } from './crypto.js';
import { MfaRecoveryError } from './errors.js';
import { isMutationReceipt } from './escrow-utils.js';
import { MIN_IDENTIFIERS, getIdentifierAuthMode } from './identifier-auth.js';
import { assertSameAudienceIds } from './state-machine.js';
import type {
  AuthControllerToken,
  Identifier,
  Mutation,
  MutationReceipt,
  PendingMutationPayload,
  PendingRegisterPayload,
  PendingUpdateIdentifiersPayload,
  PendingUpdateRecoverySecretPayload,
} from './types.js';

/**
 * Validates decrypted pending state before it can trigger authorization or
 * escrow operations.
 *
 * @param pending - Decrypted pending state.
 * @param escrowIds - Build-configured escrow ids.
 * @throws If the pending state is malformed or inconsistent.
 */
export async function assertValidPendingOperation(
  pending: unknown,
  escrowIds: string[],
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
  assertSameAudienceIds(mutation.audiences, escrowIds);

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
  if ((hash(payload)) !== mutation.payloadHash) {
    throw new MfaRecoveryError(
      'Pending payload does not match mutation',
      'payload_mismatch',
    );
  }
  const requestHash = hash({
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
  if (
    !isAuthControllerToken(pending.authControllerToken) ||
    pending.authControllerToken.profileId !== mutation.profileId ||
    pending.authControllerToken.requestHash !== mutation.requestHash ||
    (mutation.operation !== 'register' &&
      pending.authControllerToken.twoFactor !== true) ||
    ((mutation.operation === 'register' ||
      mutation.operation === 'updateIdentifiers') &&
      (pending.authControllerToken.identifierOwnershipApproved !== true ||
        typeof pending.authControllerToken.identifiersHash !== 'string')) ||
    !isMutationReceiptArray(pending.receipts)
  ) {
    throwInvalidPendingOperation();
  }
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
 * @param payload - Logical pending mutation payload.
 * @returns Whether the payload includes an identifier set.
 */
export function pendingPayloadHasIdentifiers(
  payload: PendingMutationPayload,
): payload is PendingRegisterPayload | PendingUpdateIdentifiersPayload {
  return Object.prototype.hasOwnProperty.call(payload, 'identifiers');
}

/**
 * @param payload - Logical pending mutation payload.
 * @returns Whether the payload includes a hex recovery secret.
 */
export function pendingPayloadHasRecoverySecret(
  payload: PendingMutationPayload,
): payload is PendingRegisterPayload | PendingUpdateRecoverySecretPayload {
  return Object.prototype.hasOwnProperty.call(payload, 'recoverySecret');
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
    return (
      keys.every((key) => key === 'recoverySecret') &&
      isHexSecret(payload.recoverySecret)
    );
  }
  if (
    !Array.isArray(payload.identifiers) ||
    payload.identifiers.length < MIN_IDENTIFIERS ||
    !payload.identifiers.every(isIdentifier)
  ) {
    return false;
  }
  if (operation === 'register') {
    return (
      isHexSecret(payload.recoverySecret) &&
      keys.every((key) => key === 'identifiers' || key === 'recoverySecret')
    );
  }
  return keys.every((key) => key === 'identifiers');
}

function isHexSecret(value: unknown): value is string {
  return typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})+$/u.test(value);
}

function isIdentifier(value: unknown): value is Identifier {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    typeof value.namespace === 'string' &&
    typeof value.value === 'string' &&
    Object.prototype.hasOwnProperty.call(value, 'verifier')
  );
}

function isAuthControllerToken(value: unknown): value is AuthControllerToken {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.profileId === 'string' &&
    typeof value.requestHash === 'string' &&
    (value.twoFactor === undefined || value.twoFactor === true) &&
    (value.identifiersHash === undefined ||
      typeof value.identifiersHash === 'string') &&
    (value.identifierOwnershipApproved === undefined ||
      value.identifierOwnershipApproved === true) &&
    typeof value.issuer === 'string' &&
    typeof value.expiresAt === 'number' &&
    Number.isInteger(value.expiresAt) &&
    value.expiresAt >= 0 &&
    typeof value.signature === 'string'
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
