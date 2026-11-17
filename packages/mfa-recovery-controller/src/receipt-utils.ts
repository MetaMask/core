import { integer, is, min, string, type } from '@metamask/superstruct';

import type {
  AuthControllerToken,
  Mutation,
  MutationReceipt,
  RecoveryEscrowProvider,
} from './types.js';

// `type()`, not `object()`, so unknown fields are accepted.
const MutationReceiptStruct = type({
  mutationId: string(),
  requestHash: string(),
  escrowId: string(),
  version: min(integer(), 0),
  receiptKeyId: string(),
  signature: string(),
});

/**
 * Checks the serialized shape of a mutation receipt.
 *
 * @param value - Decrypted or provider-returned value.
 * @returns Whether the value has a mutation receipt shape.
 */
export function isMutationReceipt(value: unknown): value is MutationReceipt {
  return is(value, MutationReceiptStruct);
}

/**
 * Verifies a receipt against its expected target escrow.
 *
 * The provider checks the Ed25519 receipt signature with its build-pinned
 * receipt key; the target identity check is performed here as well.
 *
 * @param receipt - Value returned by an escrow.
 * @param mutation - Mutation the receipt must acknowledge.
 * @param escrow - Expected target escrow provider.
 * @returns Whether the value is a valid receipt for the target.
 */
export async function verifyMutationReceipt(
  receipt: unknown,
  mutation: Mutation,
  escrow: RecoveryEscrowProvider,
): Promise<boolean> {
  if (!isMutationReceipt(receipt) || receipt.escrowId !== escrow.id) {
    return false;
  }
  try {
    return await escrow.verifyReceipt(receipt, mutation, escrow.id);
  } catch {
    return false;
  }
}

/**
 * Returns this mutation's receipts if every escrow applied it, or `null` if
 * any escrow has no receipt for it (another mutation wrote it).
 *
 * @param escrows - Escrows to read.
 * @param token - AuthController token for the read.
 * @param mutation - Mutation the receipts must acknowledge.
 * @returns The receipts, or `null` when an escrow has none for this mutation.
 */
export async function getAppliedMutationReceipts(
  escrows: RecoveryEscrowProvider[],
  token: AuthControllerToken,
  mutation: Mutation,
): Promise<MutationReceipt[] | null> {
  const receipts = await Promise.all(
    escrows.map(async (escrow) => {
      const { receipt } = await escrow.getMutationReceipt(token, mutation);
      return (await verifyMutationReceipt(receipt, mutation, escrow))
        ? receipt
        : null;
    }),
  );
  return receipts.every((receipt) => receipt !== null) ? receipts : null;
}
