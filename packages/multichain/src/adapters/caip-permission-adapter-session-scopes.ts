import { KnownCaipNamespace } from '@metamask/utils';
import { Caip25CaveatValue } from 'src/caip25Permission';
import {
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletNamespaceRpcMethods,
} from 'src/scope/constants';
import { mergeScopes } from 'src/scope/transform';
import type {
  InternalScopesObject,
  NormalizedScopesObject,
} from 'src/scope/types';
import { parseScopeString } from 'src/scope/types';

const getNormalizedScopesObject = (
  internalScopesObject: InternalScopesObject
) => {
  const normalizedScopes: NormalizedScopesObject = {};

  Object.entries(internalScopesObject).forEach(
    ([_scopeString, { accounts }]) => {
      const scopeString = _scopeString as keyof typeof internalScopesObject;
      const { namespace, reference } = parseScopeString(scopeString);
      let methods: string[] = [];
      let notifications: string[] = [];

      // TODO: write this better to work more generically
      if (namespace === KnownCaipNamespace.Eip155) {
        methods = KnownRpcMethods.eip155;
        notifications = KnownNotifications.eip155;
      } else if (
        namespace === KnownCaipNamespace.Wallet &&
        reference === KnownCaipNamespace.Eip155
      ) {
        methods = KnownWalletNamespaceRpcMethods.eip155;
      }

      normalizedScopes[scopeString] = {
        methods,
        notifications,
        accounts,
      };
    },
  );

  return normalizedScopes;
}

export const getSessionScopes = (
  caip25CaveatValue: Pick<
    Caip25CaveatValue,
    'requiredScopes' | 'optionalScopes'
  >,
) => {
  return mergeScopes(
    getNormalizedScopesObject(caip25CaveatValue.requiredScopes),
    getNormalizedScopesObject(caip25CaveatValue.optionalScopes),
  )
};
