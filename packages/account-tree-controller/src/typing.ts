/* eslint-disable jsdoc/require-jsdoc */

// TODO: Replace this with the next `@metamask/account-api` release.

import type { AccountWalletType } from '@metamask/account-api';

export type AccountWalletIdOf<WalletType extends AccountWalletType> =
  `${WalletType}:${string}`;

export type AccountGroupIdOf<WalletType extends AccountWalletType> =
  `${AccountWalletIdOf<WalletType>}/${string}`;

export function toAccountWalletId<WalletType extends AccountWalletType>(
  type: WalletType,
  id: string,
): AccountWalletIdOf<WalletType> {
  return `${type}:${id}`;
}

export function toAccountGroupId<WalletType extends AccountWalletType>(
  walletId: AccountWalletIdOf<WalletType>,
  id: string,
): AccountGroupIdOf<WalletType> {
  return `${walletId}/${id}`;
}
