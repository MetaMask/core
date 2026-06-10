import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import { createRedeemerTerms } from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

export const equalsIgnoreCase = (a: Hex, b: Hex): boolean =>
  a.toLowerCase() === b.toLowerCase();

/**
 * Builds a predicate that matches stored delegations carrying a redeemer
 * caveat targeting the Veda vault adapter — i.e. delegations we wrote for
 * auto-deposit / auto-withdrawal. The expected terms blob is computed once
 * and reused across calls.
 *
 * @param redeemerEnforcer - The RedeemerEnforcer contract address.
 * @param vedaVaultAdapterAddress - The Veda vault adapter address that must
 * be encoded as the sole redeemer.
 * @returns A predicate over `DelegationResponse`.
 */
export const makeHasVedaRedeemerCaveat = (
  redeemerEnforcer: Hex,
  vedaVaultAdapterAddress: Hex,
): ((entry: DelegationResponse) => boolean) => {
  const expectedRedeemerTerms = createRedeemerTerms({
    redeemers: [vedaVaultAdapterAddress],
  });
  return (entry) =>
    entry.signedDelegation.caveats.some(
      (caveat) =>
        equalsIgnoreCase(caveat.enforcer, redeemerEnforcer) &&
        equalsIgnoreCase(caveat.terms, expectedRedeemerTerms),
    );
};
