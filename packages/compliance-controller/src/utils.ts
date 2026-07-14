import {
  isEqualCaseInsensitive,
  isValidHexAddress,
} from '@metamask/controller-utils';

import type { WalletComplianceStatus } from './types';

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
