import type { DerivedIdentity } from '@metamask/chomp-api-service';

export type MoneyAccountLifecycle =
  | { type: 'notInIdentity' }
  | { type: 'sfa' | 'migrating' | 'mfa'; identity: DerivedIdentity };

/**
 * Whether an identity is migrating to a successor. CHOMP validates `status`
 * and `migration` independently, so either one signalling a migration counts.
 *
 * @param identity - The derived identity.
 * @returns Whether the identity is migrating.
 */
export function isMigrating(identity: DerivedIdentity): boolean {
  return identity.status === 'MIGRATING' || identity.migration !== null;
}

/**
 * Classifies a Money Account against the derived identities. A Money Account
 * that is an identity's current address is `migrating` while that identity
 * is migrating, and an `sfa` otherwise. A Money Account that is one of an
 * identity's previous addresses is an `mfa`.
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
    return {
      type: isMigrating(sfaIdentity) ? 'migrating' : 'sfa',
      identity: sfaIdentity,
    };
  }

  const mfaIdentity = identities.find(({ previousAddresses }) =>
    previousAddresses.some(isMoneyAccountAddress),
  );
  if (!mfaIdentity) {
    return { type: 'notInIdentity' };
  }

  return { type: 'mfa', identity: mfaIdentity };
}
