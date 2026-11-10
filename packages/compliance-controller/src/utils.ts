import {
  isEqualCaseInsensitive,
  isValidHexAddress,
} from '@metamask/controller-utils';

import type { WalletComplianceStatus } from './types.js';

export const getWalletComplianceStatus = (
  statusMap: Record<string, WalletComplianceStatus>,
  address: string,
): WalletComplianceStatus | undefined => {
  const exactMatch = statusMap[address];

  if (exactMatch || !isValidHexAddress(address, { allowNonPrefixed: false })) {
    return exactMatch;
  }

  const matchingAddress = Object.keys(statusMap).find(
    (cachedAddress) =>
      isValidHexAddress(cachedAddress, { allowNonPrefixed: false }) &&
      isEqualCaseInsensitive(cachedAddress, address),
  );

  return matchingAddress ? statusMap[matchingAddress] : undefined;
};

/**
 * Writes a wallet's compliance status into the status map, reconciling it
 * with any existing entry (or entries) for the same address under a
 * different casing instead of leaving or creating a stale duplicate.
 *
 * A wallet's cache entry can only ever live under one key at a time,
 * regardless of the casing used across separate calls. All keys that
 * case-insensitively match the incoming address (the exact key, if present,
 * included) are collected; the new status is written under the FIRST such
 * key found (preferring key insertion order, so already-persisted state
 * keeps its existing key rather than being rekeyed under the caller's
 * casing), and every OTHER matching key is deleted. This also heals
 * duplicate entries that predate this reconciliation (e.g. state persisted
 * before this fix shipped, where the same wallet could have ended up cached
 * under two different casings) the next time either casing is written.
 *
 * @param statusMap - The status map to write into, in place.
 * @param address - The wallet address being written.
 * @param status - The compliance status to store for the address.
 */
export const setWalletComplianceStatus = (
  statusMap: Record<string, WalletComplianceStatus>,
  address: string,
  status: WalletComplianceStatus,
): void => {
  if (!isValidHexAddress(address, { allowNonPrefixed: false })) {
    statusMap[address] = status;
    return;
  }

  const matchingAddresses = Object.keys(statusMap).filter(
    (cachedAddress) =>
      isValidHexAddress(cachedAddress, { allowNonPrefixed: false }) &&
      isEqualCaseInsensitive(cachedAddress, address),
  );

  const [canonicalAddress, ...staleAddresses] = matchingAddresses;

  for (const staleAddress of staleAddresses) {
    delete statusMap[staleAddress];
  }

  statusMap[canonicalAddress ?? address] = status;
};
