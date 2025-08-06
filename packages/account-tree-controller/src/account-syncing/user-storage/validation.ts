import type {
  UserStorageSyncedWallet,
  UserStorageSyncedWalletGroup,
} from '../types';

/**
 * Validates if user storage wallet data is properly structured and safe to use.
 *
 * @param walletData - The wallet data from user storage to validate.
 * @returns True if the wallet data is valid, false otherwise.
 */
export function isValidUserStorageWallet(
  walletData: unknown,
): walletData is UserStorageSyncedWallet {
  if (!walletData || typeof walletData !== 'object') {
    return false;
  }

  const wallet = walletData as Record<string, unknown>;

  // Check if name metadata exists and is valid
  if (wallet.name && typeof wallet.name === 'object') {
    const nameData = wallet.name as Record<string, unknown>;
    if (
      typeof nameData.value !== 'string' ||
      typeof nameData.lastUpdatedAt !== 'number'
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Validates if user storage group data is properly structured and safe to use.
 *
 * @param groupData - The group data from user storage to validate.
 * @returns True if the group data is valid, false otherwise.
 */
export function isValidUserStorageGroup(
  groupData: unknown,
): groupData is UserStorageSyncedWalletGroup {
  if (!groupData || typeof groupData !== 'object') {
    return false;
  }

  const group = groupData as Record<string, unknown>;

  // Validate required groupIndex
  if (typeof group.groupIndex !== 'number' || group.groupIndex < 0) {
    return false;
  }

  // Check if name metadata exists and is valid
  if (group.name && typeof group.name === 'object') {
    const nameData = group.name as Record<string, unknown>;
    if (
      typeof nameData.value !== 'string' ||
      typeof nameData.lastUpdatedAt !== 'number'
    ) {
      return false;
    }
  }

  // Check if pinned metadata exists and is valid
  if (group.pinned && typeof group.pinned === 'object') {
    const pinnedData = group.pinned as Record<string, unknown>;
    if (
      typeof pinnedData.value !== 'boolean' ||
      typeof pinnedData.lastUpdatedAt !== 'number'
    ) {
      return false;
    }
  }

  // Check if hidden metadata exists and is valid
  if (group.hidden && typeof group.hidden === 'object') {
    const hiddenData = group.hidden as Record<string, unknown>;
    if (
      typeof hiddenData.value !== 'boolean' ||
      typeof hiddenData.lastUpdatedAt !== 'number'
    ) {
      return false;
    }
  }

  return true;
}
