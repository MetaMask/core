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

/**
 * Whether the main account can sign now: the injected account signer's
 * readiness when one is set, else the keyring's unlock state.
 *
 * @param accountSigner - The client-provided account signer, if any.
 * @param isKeyringUnlocked - Reads the keyring's unlock state.
 * @returns True when the main account is available for signing.
 */
export function isMainAccountSignerReady(
  accountSigner: PerpsAccountSigner | undefined,
  isKeyringUnlocked: () => boolean,
): boolean {
  return accountSigner
    ? isAccountSignerReady(accountSigner)
    : isKeyringUnlocked();
}
