import { toHex, isEqualCaseInsensitive } from '@metamask/controller-utils';
import type { CaipAccountId, CaipChainId, Hex } from '@metamask/utils';
import {
  isCaipChainId,
  KnownCaipNamespace,
  parseCaipAccountId,
} from '@metamask/utils';

import {
  CaipReferenceRegexes,
  KnownNotifications,
  KnownRpcMethods,
  KnownSessionProperties,
  KnownWalletNamespaceRpcMethods,
  KnownWalletRpcMethods,
} from './constants';
import type { ExternalScopeString } from './types';
import { parseScopeString } from './types';

/**
 * Determines if a scope string is supported.
 *
 * @param scopeString - The scope string to check.
 * @param hooks - An object containing the following properties:
 * @param hooks.isEvmChainIdSupported - A predicate that determines if an EVM chainID is supported.
 * @param hooks.isNonEvmScopeSupported - A predicate that determines if an non EVM scopeString is supported.
 * @returns A boolean indicating if the scope string is supported.
 */
export const isSupportedScopeString = (
  scopeString: string,
  {
    isEvmChainIdSupported,
    isNonEvmScopeSupported,
  }: {
    isEvmChainIdSupported: (chainId: Hex) => boolean;
    isNonEvmScopeSupported: (scope: CaipChainId) => boolean;
  },
) => {
  const { namespace, reference } = parseScopeString(scopeString);

  switch (namespace) {
    case KnownCaipNamespace.Wallet:
      if (
        isCaipChainId(scopeString) &&
        reference !== KnownCaipNamespace.Eip155
      ) {
        return isNonEvmScopeSupported(scopeString);
      }
      return true;
    case KnownCaipNamespace.Eip155:
      return (
        !reference ||
        (CaipReferenceRegexes.eip155.test(reference) &&
          isEvmChainIdSupported(toHex(reference)))
      );
    default:
      return isCaipChainId(scopeString)
        ? isNonEvmScopeSupported(scopeString)
        : false;
  }
};

/**
 * Determines if an account is supported by the wallet (i.e. on a keyring known to the wallet).
 *
 * @param account - The CAIP account ID to check.
 * @param hooks - An object containing the following properties:
 * @param hooks.getEvmInternalAccounts - A function that returns the EVM internal accounts.
 * @param hooks.getNonEvmAccountAddresses - A function that returns the supported CAIP-10 account addresses for a non EVM scope.
 * @returns A boolean indicating if the account is supported by the wallet.
 */
export const isSupportedAccount = (
  account: CaipAccountId,
  {
    getEvmInternalAccounts,
    getNonEvmAccountAddresses,
  }: {
    getEvmInternalAccounts: () => { type: string; address: Hex }[];
    getNonEvmAccountAddresses: (scope: CaipChainId) => string[];
  },
) => {
  const {
    address,
    chainId,
    chain: { namespace, reference },
  } = parseCaipAccountId(account);

  const isSupportedEip155Account = () =>
    getEvmInternalAccounts().some(
      (internalAccount) =>
        ['eip155:eoa', 'eip155:erc4337'].includes(internalAccount.type) &&
        isEqualCaseInsensitive(address, internalAccount.address),
    );

  const isSupportedNonEvmAccount = () =>
    getNonEvmAccountAddresses(chainId).includes(account);

  // We are trying to discern the type of `namespace`.
  /* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
  switch (namespace) {
    case KnownCaipNamespace.Wallet:
      if (reference === KnownCaipNamespace.Eip155) {
        return isSupportedEip155Account();
      }
      return isSupportedNonEvmAccount();
    case KnownCaipNamespace.Eip155:
      return isSupportedEip155Account();
    default:
      return isSupportedNonEvmAccount();
  }
  /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */
};

/**
 * Determines if a method is supported by the wallet.
 *
 * @param scopeString - The scope string to check.
 * @param method - The method to check.
 * @param hooks - An object containing the following properties:
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 * @returns A boolean indicating if the method is supported by the wallet.
 */
export const isSupportedMethod = (
  scopeString: ExternalScopeString,
  method: string,
  {
    getNonEvmSupportedMethods,
  }: {
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
  },
): boolean => {
  const { namespace, reference } = parseScopeString(scopeString);

  if (!namespace) {
    return false;
  }

  const isSupportedNonEvmMethod = () =>
    isCaipChainId(scopeString) &&
    getNonEvmSupportedMethods(scopeString).includes(method);

  // We are trying to discern the type of `namespace`.
  /* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
  if (namespace === KnownCaipNamespace.Wallet) {
    if (!reference) {
      return KnownWalletRpcMethods.includes(method);
    }

    if (reference === KnownCaipNamespace.Eip155) {
      return KnownWalletNamespaceRpcMethods[reference].includes(method);
    }

    return isSupportedNonEvmMethod();
  }

  if (namespace === KnownCaipNamespace.Eip155) {
    return KnownRpcMethods[namespace].includes(method);
  }
  /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */

  return isSupportedNonEvmMethod();
};

/**
 * Determines if a notification is supported by the wallet.
 *
 * @param scopeString - The scope string to check.
 * @param notification - The notification to check.
 * @returns A boolean indicating if the notification is supported by the wallet.
 */
export const isSupportedNotification = (
  scopeString: ExternalScopeString,
  notification: string,
): boolean => {
  const { namespace } = parseScopeString(scopeString);

  if (namespace === KnownCaipNamespace.Eip155) {
    return KnownNotifications[namespace].includes(notification);
  }

  return false;
};

/**
 * Determines if a session property is supported by the wallet.
 *
 * @param property - The property to check.
 * @returns A boolean indicating if the property is supported by the wallet.
 */
export const isSupportedSessionProperty = (property: string): boolean => {
  return Object.values(KnownSessionProperties).includes(
    property as KnownSessionProperties,
  );
};
