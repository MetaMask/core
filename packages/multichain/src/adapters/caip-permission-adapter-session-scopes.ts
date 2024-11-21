import { KnownCaipNamespace } from '@metamask/utils';

import type { Caip25CaveatValue } from '../caip25Permission';
import {
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
  KnownWalletRpcMethods,
} from '../scope/constants';
import { mergeScopes } from '../scope/transform';
import type {
  InternalScopesObject,
  NonWalletKnownCaipNamespace,
  NormalizedScopesObject,
} from '../scope/types';
import { parseScopeString } from '../scope/types';

/**
 * Converts an InternalScopesObject to a NormalizedScopesObject.
 * @param internalScopesObject - The InternalScopesObject to convert.
 * @returns A NormalizedScopesObject.
 */
const getNormalizedScopesObject = (
  internalScopesObject: InternalScopesObject,
) => {
  const normalizedScopes: NormalizedScopesObject = {};

  Object.entries(internalScopesObject).forEach(
    ([_scopeString, { accounts }]) => {
      const scopeString = _scopeString as keyof typeof internalScopesObject;
      const { namespace, reference } = parseScopeString(scopeString);
      let methods: string[] = [];
      let notifications: string[] = [];

      if (namespace === KnownCaipNamespace.Wallet) {
        if (reference) {
          methods =
            KnownWalletNamespaceRpcMethods[
              reference as NonWalletKnownCaipNamespace
            ] ?? [];
        } else {
          methods = KnownWalletRpcMethods;
        }
      } else {
        methods =
          KnownRpcMethods[namespace as NonWalletKnownCaipNamespace] ?? [];
        notifications =
          KnownNotifications[namespace as NonWalletKnownCaipNamespace] ?? [];
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
 * @param caip25CaveatValue - The CAIP-25 CaveatValue to convert.
 * @returns A NormalizedScopesObject.
 */
export const getSessionScopes = (
  caip25CaveatValue: Pick<
    Caip25CaveatValue,
    'requiredScopes' | 'optionalScopes'
  >,
) => {
  return mergeScopes(
    getNormalizedScopesObject(caip25CaveatValue.requiredScopes),
    getNormalizedScopesObject(caip25CaveatValue.optionalScopes),
  );
};
