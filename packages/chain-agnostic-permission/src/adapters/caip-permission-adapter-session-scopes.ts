import {
  type CaipAccountId,
  type CaipChainId,
  isCaipChainId,
  KnownCaipNamespace,
} from '@metamask/utils';

import type { Caip25CaveatValue } from '../caip25Permission';
import {
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownWalletRpcMethods,
} from '../scope/constants';
import { mergeNormalizedScopes } from '../scope/transform';
import type {
  InternalScopesObject,
  NormalizedScopesObject,
} from '../scope/types';
import { parseScopeString } from '../scope/types';

/**
 * Converts an NormalizedScopesObject to a InternalScopesObject.
 *
 * @param normalizedScopesObject - The NormalizedScopesObject to convert.
 * @returns An InternalScopesObject.
 */
export const getInternalScopesObject = (
  normalizedScopesObject: NormalizedScopesObject,
) => {
  const internalScopes: InternalScopesObject = {};

  Object.entries(normalizedScopesObject).forEach(
    ([_scopeString, { accounts }]) => {
      const scopeString = _scopeString as keyof typeof normalizedScopesObject;

      internalScopes[scopeString] = {
        accounts,
      };
    },
  );

  return internalScopes;
};

/**
 * Converts an InternalScopesObject to a NormalizedScopesObject.
 *
 * @param internalScopesObject - The InternalScopesObject to convert.
 * @param hooks - An object containing the following properties:
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 * @returns A NormalizedScopesObject.
 */
const getNormalizedScopesObject = (
  internalScopesObject: InternalScopesObject,
  {
    getNonEvmSupportedMethods,
  }: {
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
  },
) => {
  const normalizedScopes: NormalizedScopesObject = {};

  Object.entries(internalScopesObject).forEach(
    ([_scopeString, { accounts }]) => {
      const scopeString = _scopeString as keyof typeof internalScopesObject;
      const { namespace, reference } = parseScopeString(scopeString);
      let methods: string[] = [];
      let notifications: string[] = [];

      if (
        scopeString === KnownCaipNamespace.Wallet ||
        namespace === KnownCaipNamespace.Wallet
      ) {
        if (reference === KnownCaipNamespace.Eip155) {
          methods = KnownWalletNamespaceRpcMethods[reference];
        } else if (isCaipChainId(scopeString)) {
          methods = getNonEvmSupportedMethods(scopeString);
        } else {
          methods = KnownWalletRpcMethods;
        }
      } else if (namespace === KnownCaipNamespace.Eip155) {
        methods = KnownRpcMethods[namespace];
        notifications = KnownNotifications[namespace];
      } else {
        methods = getNonEvmSupportedMethods(scopeString);
        notifications = [];
      }

      normalizedScopes[scopeString] = {
        methods,
        notifications,
        accounts,
      };
    },
  );

  return normalizedScopes;
};

/**
 * Takes the scopes from an endowment:caip25 permission caveat value,
 * hydrates them with supported methods and notifications, and returns a NormalizedScopesObject.
 *
 * @param caip25CaveatValue - The CAIP-25 CaveatValue to convert.
 * @param hooks - An object containing the following properties:
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 * @returns A NormalizedScopesObject.
 */
export const getSessionScopes = (
  caip25CaveatValue: Pick<
    Caip25CaveatValue,
    'requiredScopes' | 'optionalScopes'
  >,
  {
    getNonEvmSupportedMethods,
  }: {
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
  },
) => {
  return mergeNormalizedScopes(
    getNormalizedScopesObject(caip25CaveatValue.requiredScopes, {
      getNonEvmSupportedMethods,
    }),
    getNormalizedScopesObject(caip25CaveatValue.optionalScopes, {
      getNonEvmSupportedMethods,
    }),
  );
};

/**
 * Get the permitted accounts for the given scopes.
 *
 * @param caip25CaveatValue - The CAIP-25 CaveatValue to get the permitted accounts for
 * @param scopes - The scopes to get the permitted accounts for
 * @returns An array of permitted accounts
 */
export const getPermittedAccountsForScopes = (
  caip25CaveatValue: Pick<
    Caip25CaveatValue,
    'requiredScopes' | 'optionalScopes'
  >,
  scopes: CaipChainId[],
): CaipAccountId[] => {
  const scopeAccounts: CaipAccountId[] = [];

  scopes.forEach((scope) => {
    const requiredScope = caip25CaveatValue.requiredScopes[scope];
    const optionalScope = caip25CaveatValue.optionalScopes[scope];
    if (requiredScope) {
      scopeAccounts.push(...requiredScope.accounts);
    }

    if (optionalScope) {
      scopeAccounts.push(...optionalScope.accounts);
    }
  });
  return [...new Set(scopeAccounts)];
};
