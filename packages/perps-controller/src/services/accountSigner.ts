import type { PerpsAccountSigner } from '../types/index.js';

/**
 * Whether an injected account signer can sign now.
 *
 * @param accountSigner - The client-provided account signer.
 * @returns False only when the signer reports it is not ready.
 */
export function isAccountSignerReady(
  accountSigner: PerpsAccountSigner,
): boolean {
  return accountSigner.isReady?.() ?? true;
}
