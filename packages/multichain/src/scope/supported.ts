import { toHex, isEqualCaseInsensitive } from '@metamask/controller-utils';
import type { CaipAccountId, Hex } from '@metamask/utils';
import { KnownCaipNamespace, parseCaipAccountId } from '@metamask/utils';

import {
  CaipReferenceRegexes,
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownWalletRpcMethods,
} from './constants';
import type { ExternalScopeString } from './types';
import { parseScopeString } from './types';

/**
 * Determines if a scope string is supported.
 * @param scopeString - The scope string to check.
 * @param isChainIdSupported - A predicate that determines if a chainID is supported.
 * @returns A boolean indicating if the scope string is supported.
 */
export const isSupportedScopeString = (
  scopeString: string,
  isChainIdSupported: (chainId: Hex) => boolean,
) => {
  const { namespace, reference } = parseScopeString(scopeString);

  switch (namespace) {
    case KnownCaipNamespace.Wallet:
      return !reference || reference === KnownCaipNamespace.Eip155;
    case KnownCaipNamespace.Eip155:
      return (
        !reference ||
        (CaipReferenceRegexes.eip155.test(reference) &&
          isChainIdSupported(toHex(reference)))
      );
    default:
      return false;
  }
};

/**
 * Determines if an account is supported by the wallet (i.e. on a keyring known to the wallet).
 * @param account - The CAIP account ID to check.
 * @param getInternalAccounts - A function that returns the internal accounts.
 * @returns A boolean indicating if the account is supported by the wallet.
 */
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

/**
 * Determines if a method is supported by the wallet.
 * @param scopeString - The scope string to check.
 * @param method - The method to check.
 * @returns A boolean indicating if the method is supported by the wallet.
 */
export const isSupportedMethod = (
  scopeString: ExternalScopeString,
  method: string,
): boolean => {
  const { namespace, reference } = parseScopeString(scopeString);

  if (!namespace || !isKnownCaipNamespace(namespace)) {
    return false;
  }

  if (namespace === KnownCaipNamespace.Wallet) {
    if (reference) {
      if (
        !isKnownCaipNamespace(reference) ||
        reference === KnownCaipNamespace.Wallet
      ) {
        return false;
      }
      return KnownWalletNamespaceRpcMethods[reference].includes(method);
    }

    return KnownWalletRpcMethods.includes(method);
  }

  return KnownRpcMethods[namespace].includes(method);
};

/**
 * Determines if a notification is supported by the wallet.
 * @param scopeString - The scope string to check.
 * @param notification - The notification to check.
 * @returns A boolean indicating if the notification is supported by the wallet.
 */
export const isSupportedNotification = (
  scopeString: ExternalScopeString,
  notification: string,
): boolean => {
  const { namespace } = parseScopeString(scopeString);

  if (
    !namespace ||
    !isKnownCaipNamespace(namespace) ||
    namespace === KnownCaipNamespace.Wallet
  ) {
    return false;
  }

  return KnownNotifications[namespace].includes(notification);
};

/**
 * Checks whether the given namespace is a known CAIP namespace.
 *
 * @param namespace - The namespace to check
 * @returns Whether the given namespace is a known CAIP namespace.
 */
function isKnownCaipNamespace(
  namespace: string,
): namespace is KnownCaipNamespace {
  const knownNamespaces = Object.keys(KnownCaipNamespace).map((key) =>
    key.toLowerCase(),
  );

  return knownNamespaces.includes(namespace);
}
