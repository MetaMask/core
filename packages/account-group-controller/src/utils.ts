import { KeyringTypes } from '@metamask/keyring-controller';

import {
  DEFAULT_SUB_GROUP,
  AccountGroupCategory,
  type AccountGroup,
  type AccountGroupControllerState,
  type AccountGroupId,
} from './AccountGroupController';

/**
 * Formats a keyring type string into a more presentable name.
 *
 * @param type - The keyring type string (e.g., "hd", "ledger").
 * @returns A formatted name (e.g., "HD Wallet", "Ledger").
 */
function formatKeyringType(type: string): string {
  if (!type) {
    return 'Keyring'; // Should not happen if specificIdentifier is present
  }

  const lowerType = type.toLowerCase();
  if (lowerType === KeyringTypes.hd.toLowerCase()) {
    return 'HD Wallet';
  }
  if (lowerType === KeyringTypes.ledger.toLowerCase()) {
    return 'Ledger';
  }
  if (lowerType === KeyringTypes.trezor.toLowerCase()) {
    return 'Trezor';
  }
  if (lowerType === KeyringTypes.snap.toLowerCase()) {
    return 'Snap Wallet';
  }

  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Generates a display name for an account group based on its ID.
 * This is often used as a fallback if specific metadata is not available.
 *
 * @param id - The AccountGroupId, expected format "category:specificIdentifier".
 * @returns A generated name for the account group.
 */
export function generateAccountGroupName(id: AccountGroupId): string {
  if (!id || !id.includes(':')) {
    // Handle malformed ID
    return 'Unnamed Group';
  }

  const [category, ...rest] = id.split(':') as [AccountGroupCategory, string];
  const specificIdentifier = rest.join(':');

  if (category === AccountGroupCategory.Entropy) {
    // Fallback name for HD Wallets. Sequential numbering should be handled by AccountGroupController in metadata.
    return 'Wallet';
  }

  if (category === AccountGroupCategory.Snap) {
    return `Snap (${specificIdentifier})`;
  }

  if (category === AccountGroupCategory.Keyring) {
    return formatKeyringType(specificIdentifier);
  }

  return specificIdentifier || 'Unnamed Group';
}

/**
 * Converts the state of the `AccountGroupController` to a list of `AccountGroup` objects.
 *
 * @param state - The state of the `AccountGroupController`.
 * @returns A list of `AccountGroup` objects.
 */
export async function toAccountGroupsList(
  state: AccountGroupControllerState,
): Promise<AccountGroup[]> {
  const {
    accountGroups: { groups },
    accountGroupsMetadata: metadata,
  } = state;

  return Object.entries(groups).reduce<AccountGroup[]>(
    (acc, [id, groupData]) => {
      const groupMetadata = metadata[id as AccountGroupId];
      const name =
        groupMetadata?.name ?? generateAccountGroupName(id as AccountGroupId);
      // Ensure accounts array is present, defaulting to empty if sub-group or accounts are missing
      const accounts = groupData?.[DEFAULT_SUB_GROUP] ?? [];

      if (accounts.length > 0) {
        acc.push({
          id: id as AccountGroupId,
          name,
          accounts,
        });
      }
      return acc;
    },
    [],
  );
}
