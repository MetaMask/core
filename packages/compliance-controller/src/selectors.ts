import { createSelector } from 'reselect';

import type { ComplianceControllerState } from './ComplianceController';

const selectWalletComplianceStatusMap = (
  state: ComplianceControllerState,
): ComplianceControllerState['walletComplianceStatusMap'] =>
  state.walletComplianceStatusMap;

/**
 * Creates a selector that returns whether a wallet address is blocked, based
 * on the per-address compliance status cache.
 *
 * @param address - The wallet address to check.
 * @returns A selector that takes `ComplianceControllerState` and returns
 * `true` if the wallet is blocked, `false` otherwise.
 */
export const selectIsWalletBlocked = (
  address: string,
): ((state: ComplianceControllerState) => boolean) =>
  createSelector(
    [selectWalletComplianceStatusMap],
    (statusMap): boolean => statusMap[address]?.blocked ?? false,
  );
