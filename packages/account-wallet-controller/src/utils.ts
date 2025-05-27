import { KeyringTypes } from '@metamask/keyring-controller';

import type {
  AccountWalletMetadata,
  AccountWallet,
  AccountWalletControllerState,
  AccountWalletId,
} from './AccountWalletController';
import { AccountWalletCategory } from './AccountWalletController';

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
 * Generates a display name for an account wallet based on its ID.
 * This is often used as a fallback if specific metadata is not available.
 *
 * @param id - The AccountWalletId, expected format "category:specificIdentifier".
 * @returns A generated name for the account wallet.
 */
export function generateAccountWalletName(id: AccountWalletId): string {
  if (!id || !id.includes(':')) {
    // Handle malformed ID
    return 'Unnamed Wallet';
  }

  const [category, ...rest] = id.split(':') as [AccountWalletCategory, string];
  const specificIdentifier = rest.join(':');

  if (category === AccountWalletCategory.Entropy) {
    // Fallback name for HD Wallets. Sequential numbering should be handled by AccountWalletController in metadata.
    return 'Wallet';
  }

  if (category === AccountWalletCategory.Snap) {
    return `Snap (${specificIdentifier})`;
  }

  if (category === AccountWalletCategory.Keyring) {
    return formatKeyringType(specificIdentifier);
  }

  return specificIdentifier || 'Unnamed Wallet';
}

/**
 * Converts the state of the `AccountWalletController` to a list of `AccountWallet` objects.
 *
 * @param state - The state of the `AccountWalletController`.
 * @returns A list of `AccountWallet` objects.
 */
export async function toAccountWalletsList(
  state: AccountWalletControllerState,
): Promise<AccountWallet[]> {
  const { accountWallets } = state;

  return Object.entries(accountWallets).reduce<AccountWallet[]>(
    (acc, [walletId, walletInstance]) => {
      const id = walletId as AccountWalletId;

      const outputMetadata: AccountWalletMetadata = {
        ...walletInstance.metadata,
        name: walletInstance.metadata?.name ?? generateAccountWalletName(id),
      };

      acc.push({
        id,
        groups: walletInstance.groups,
        metadata: outputMetadata,
      });
      return acc;
    },
    [],
  );
}
