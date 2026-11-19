/**
 * @param value - Untrusted signed or persisted hash.
 * @returns Whether the exact native transaction hash is usable.
 */
export function isLighterTxHash(value: unknown): value is string {
  return typeof value === 'string' && /^(0x)?[0-9a-fA-F]{8,128}$/u.test(value);
}

/**
 * @param value - Untrusted millisecond expiry.
 * @returns Whether the signed expiry is a positive exact integer.
 */
export function isLighterTxExpiry(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Extract the signed txHash and ExpiredAt from a bridge signing result,
 * failing CLOSED: without them the settlement journal cannot resolve a
 * lost response authoritatively, so the mutation must not be submitted.
 *
 * @param signed - Bridge signing result.
 * @param signed.txHash - Signed transaction hash (hex).
 * @param signed.txInfo - Signed wire payload JSON (carries ExpiredAt).
 * @returns The transaction hash and expiry (ms).
 */
export const requireSignedTxIdentity = (signed: {
  txHash?: string;
  txInfo?: string;
}): { txHash: string; expiresAt: number } => {
  const { txHash } = signed;
  if (!isLighterTxHash(txHash)) {
    throw new Error(
      'Lighter signing result carries no usable txHash; refusing to submit an unreconcilable mutation',
    );
  }
  let expiresAt: unknown;
  try {
    expiresAt = (JSON.parse(signed.txInfo ?? '') as Record<string, unknown>)
      .ExpiredAt;
  } catch {
    expiresAt = undefined;
  }
  if (!isLighterTxExpiry(expiresAt)) {
    throw new Error(
      'Lighter signing result carries no usable ExpiredAt; refusing to submit an unreconcilable mutation',
    );
  }
  return { txHash, expiresAt };
};
