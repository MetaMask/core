import type { DerivedIdentity } from '@metamask/chomp-api-service';

export type MoneyAccountLifecycle =
  | { type: 'notInIdentity' }
  | { type: 'sfa' | 'mfa'; identity: DerivedIdentity };

/**
 * Classifies a Money Account against the derived identities. An SFA match
 * takes precedence over an MFA match.
 *
 * @param moneyAccountAddress - The address of the Money Account.
 * @param identities - The derived identities to search.
 * @returns The lifecycle of the Money Account.
 */
export function getMoneyAccountLifecycle(
  moneyAccountAddress: string,
  identities: DerivedIdentity[],
): MoneyAccountLifecycle {
  const normalizedAddress = moneyAccountAddress.toLowerCase();
  const isMoneyAccountAddress = (address: string): boolean =>
    address.toLowerCase() === normalizedAddress;

  const sfaIdentity = identities.find(({ currentAddress }) =>
    isMoneyAccountAddress(currentAddress),
  );
  if (sfaIdentity) {
    return { type: 'sfa', identity: sfaIdentity };
  }

  const mfaIdentity = identities.find(({ previousAddresses }) =>
    previousAddresses.some(isMoneyAccountAddress),
  );
  if (!mfaIdentity) {
    return { type: 'notInIdentity' };
  }

  return { type: 'mfa', identity: mfaIdentity };
}
