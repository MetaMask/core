import {
  type CaipAccountId,
  type Hex,
  KnownCaipNamespace,
  parseCaipAccountId,
} from '@metamask/utils';

import type { Caip25CaveatValue } from '../caip25Permission';
import { getUniqueArrayItems, mergeScopes } from '../scope/transform';
import type { ScopesObject, ScopeString } from '../scope/types';
import { KnownWalletScopeString, parseScopeString } from '../scope/types';

const isEip155ScopeString = (scopeString: ScopeString) => {
  const { namespace } = parseScopeString(scopeString);

  return (
    namespace === KnownCaipNamespace.Eip155 ||
    scopeString === KnownWalletScopeString.Eip155
  );
};

export const getEthAccounts = (
  caip25CaveatValue: Pick<
    Caip25CaveatValue,
    'requiredScopes' | 'optionalScopes'
  >,
) => {
  const ethAccounts: string[] = [];
  const sessionScopes = mergeScopes(
    caip25CaveatValue.requiredScopes,
    caip25CaveatValue.optionalScopes,
  );

  Object.entries(sessionScopes).forEach(([_, { accounts }]) => {
    accounts?.forEach((account) => {
      const { address, chainId } = parseCaipAccountId(account);

      if (isEip155ScopeString(chainId)) {
        ethAccounts.push(address);
      }
    });
  });

  return getUniqueArrayItems(ethAccounts);
};

const setEthAccountsForScopesObject = (
  scopesObject: ScopesObject,
  accounts: Hex[],
) => {
  const updatedScopesObject: ScopesObject = {};

  Object.entries(scopesObject).forEach(([scopeString, scopeObject]) => {
    const isWalletNamespace = scopeString === KnownCaipNamespace.Wallet;

    if (
      !isEip155ScopeString(scopeString as ScopeString) &&
      !isWalletNamespace
    ) {
      updatedScopesObject[scopeString as ScopeString] = scopeObject;
      return;
    }

    const caipAccounts = accounts.map(
      (account) =>
        (isWalletNamespace
          ? `${KnownWalletScopeString.Eip155}:${account}`
          : `${scopeString}:${account}`) as CaipAccountId,
    );

    updatedScopesObject[scopeString as ScopeString] = {
      ...scopeObject,
      accounts: caipAccounts,
    };
  });

  return updatedScopesObject;
};

export const setEthAccounts = (
  caip25CaveatValue: Caip25CaveatValue,
  accounts: Hex[],
) => {
  return {
    ...caip25CaveatValue,
    requiredScopes: setEthAccountsForScopesObject(
      caip25CaveatValue.requiredScopes,
      accounts,
    ),
    optionalScopes: setEthAccountsForScopesObject(
      {
        [KnownWalletScopeString.Eip155]: {
          methods: [],
          notifications: [],
          accounts: [],
        },
        ...caip25CaveatValue.optionalScopes,
      },
      accounts,
    ),
  };
};
