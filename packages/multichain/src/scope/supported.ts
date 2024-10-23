import { toHex, isEqualCaseInsensitive } from '@metamask/controller-utils';
import type { CaipAccountId, Hex, CaipChainId } from '@metamask/utils';
import { KnownCaipNamespace, parseCaipAccountId } from '@metamask/utils';

import {
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownWalletRpcMethods,
} from './constants';
import type { NonWalletKnownCaipNamespace, ExternalScopeString } from './types';
import { parseScopeString } from './types';

export const isSupportedScopeString = (
  scopeString: string,
  isChainIdSupported: (chainId: Hex) => boolean,
) => {
  const { namespace, reference } = parseScopeString(scopeString as CaipChainId);

  switch (namespace) {
    case KnownCaipNamespace.Wallet:
      return !reference || reference === KnownCaipNamespace.Eip155;
    case KnownCaipNamespace.Eip155:
      return !reference || isChainIdSupported(toHex(reference));
    default:
      return false;
  }
};

export const isSupportedAccount = (
  account: CaipAccountId,
  getInternalAccounts: () => { type: string; address: string }[],
) => {
  const {
    address,
    chain: { namespace, reference },
  } = parseCaipAccountId(account);

  const isSupportedEip155Account = () =>
    getInternalAccounts().some(
      (internalAccount) =>
        ['eip155:eoa', 'eip155:erc4337'].includes(internalAccount.type) &&
        isEqualCaseInsensitive(address, internalAccount.address),
    );

  switch (namespace) {
    case KnownCaipNamespace.Wallet:
      return reference === KnownCaipNamespace.Eip155
        ? isSupportedEip155Account()
        : false;
    case KnownCaipNamespace.Eip155:
      return isSupportedEip155Account();
    default:
      return false;
  }
};

export const isSupportedMethod = (
  scopeString: ExternalScopeString,
  method: string,
): boolean => {
  const { namespace, reference } = parseScopeString(scopeString);

  if (namespace === KnownCaipNamespace.Wallet) {
    if (reference) {
      return (
        KnownWalletNamespaceRpcMethods[
          reference as NonWalletKnownCaipNamespace
        ] || []
      ).includes(method);
    }

    return KnownWalletRpcMethods.includes(method);
  }

  return (
    KnownRpcMethods[namespace as NonWalletKnownCaipNamespace] || []
  ).includes(method);
};

export const isSupportedNotification = (
  scopeString: ExternalScopeString,
  notification: string,
): boolean => {
  const { namespace } = parseScopeString(scopeString);

  return (
    KnownNotifications[namespace as NonWalletKnownCaipNamespace] || []
  ).includes(notification);
};
