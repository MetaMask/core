import type { DerivedIdentity } from './chomp-api-service-derived-identities.js';

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
 * @throws If the Money Account is a previous address of an identity that has
 * not finished migrating.
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

  const successor = identities.find(({ previousAddresses }) =>
    previousAddresses.some(isMoneyAccountAddress),
  );
  if (!successor) {
    return { type: 'notInIdentity' };
  }

  if (successor.status !== 'DONE') {
    throw new Error(
      `Money account ${moneyAccountAddress} is a previous address of a derived identity with status '${successor.status}'`,
    );
  }

  return { type: 'mfa', identity: successor };
}
