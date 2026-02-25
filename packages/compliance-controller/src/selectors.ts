import { createSelector } from 'reselect';

import type { ComplianceControllerState } from './ComplianceController';

const selectBlockedWallets = (
  state: ComplianceControllerState,
): ComplianceControllerState['blockedWallets'] => state.blockedWallets;

const selectWalletComplianceStatusMap = (
  state: ComplianceControllerState,
): ComplianceControllerState['walletComplianceStatusMap'] =>
  state.walletComplianceStatusMap;

/**
 * Creates a selector that returns whether a wallet address is blocked, based
 * on the cached blocklist. The lookup checks the proactively fetched blocklist
 * first, then falls back to the per-address compliance status map.
 *
 * @param address - The wallet address to check.
 * @returns A selector that takes `ComplianceControllerState` and returns
 * `true` if the wallet is blocked, `false` otherwise.
 */
export const selectIsWalletBlocked = (
  address: string,
): ((state: ComplianceControllerState) => boolean) =>
  createSelector(
    [selectBlockedWallets, selectWalletComplianceStatusMap],
    (blockedWallets, statusMap): boolean => {
      if (blockedWallets?.addresses.includes(address)) {
        return true;
      }
      return statusMap[address]?.blocked ?? false;
    },
  );
