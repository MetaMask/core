import type {
  DerivedIdentity,
  DerivedIdentityMigration,
} from '@metamask/chomp-api-service';

export type MoneyAccountLifecycle =
  | { type: 'notInIdentity' }
  | { type: 'sfa' | 'mfa'; identity: DerivedIdentity }
  | {
      type: 'migrating';
      identity: DerivedIdentity & { migration: DerivedIdentityMigration };
    };

/**
 * Classifies a Money Account against the derived identities. A Money Account
 * that is an identity's current address is `migrating` while that identity
 * has a pending migration, and an `sfa` otherwise. Either takes precedence
 * over an `mfa` match.
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
    const { migration } = sfaIdentity;
    return migration
      ? { type: 'migrating', identity: { ...sfaIdentity, migration } }
      : { type: 'sfa', identity: sfaIdentity };
  }

  const mfaIdentity = identities.find(({ previousAddresses }) =>
    previousAddresses.some(isMoneyAccountAddress),
  );
  if (!mfaIdentity) {
    return { type: 'notInIdentity' };
  }

  return { type: 'mfa', identity: mfaIdentity };
}
