import {
  type CaipAccountId,
  type Hex,
  KnownCaipNamespace,
  parseCaipAccountId,
} from '@metamask/utils';

import type { Caip25CaveatValue } from '../caip25Permission';
import { KnownWalletScopeString } from '../scope/constants';
import { getUniqueArrayItems, mergeScopes } from '../scope/transform';
import type { InternalScopesObject, InternalScopeString } from '../scope/types';
import { parseScopeString } from '../scope/types';

/**
 * Checks if a scope string is either an EIP155 or wallet namespaced scope string.
 * @param scopeString - The scope string to check.
 * @returns True if the scope string is an EIP155 or wallet namespaced scope string, false otherwise.
 */
const isEip155ScopeString = (scopeString: InternalScopeString) => {
  const { namespace } = parseScopeString(scopeString);

  return (
    namespace === KnownCaipNamespace.Eip155 ||
    scopeString === KnownWalletScopeString.Eip155
  );
};

/**
 * Gets the Ethereum (EIP155 namespaced) accounts from the required and optional scopes.
 * @param caip25CaveatValue - The CAIP-25 caveat value to get the Ethereum accounts from.
 * @returns An array of Ethereum accounts.
 */
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

/**
 * Sets the Ethereum (EIP155 namespaced) accounts for the given scopes object.
 * @param scopesObject - The scopes object to set the Ethereum accounts for.
 * @param accounts - The Ethereum accounts to set.
 * @returns The updated scopes object with the Ethereum accounts set.
 */
const setEthAccountsForScopesObject = (
  scopesObject: InternalScopesObject,
  accounts: Hex[],
) => {
  const updatedScopesObject: InternalScopesObject = {};

  Object.entries(scopesObject).forEach(([scopeString, scopeObject]) => {
    const isWalletNamespace = scopeString === KnownCaipNamespace.Wallet;

    if (
      !isEip155ScopeString(scopeString as InternalScopeString) &&
      !isWalletNamespace
    ) {
      updatedScopesObject[scopeString as InternalScopeString] = scopeObject;
      return;
    }

    const caipAccounts = accounts.map<CaipAccountId>(
      (account) =>
        (isWalletNamespace
          ? `${KnownWalletScopeString.Eip155}:${account}`
          : `${scopeString}:${account}`),
    );

    updatedScopesObject[scopeString as InternalScopeString] = {
      ...scopeObject,
      accounts: caipAccounts,
    };
  });

  return updatedScopesObject;
};

/**
 * Sets the Ethereum (EIP155 namespaced) accounts for the given CAIP-25 caveat value.
 * @param caip25CaveatValue - The CAIP-25 caveat value to set the Ethereum accounts for.
 * @param accounts - The Ethereum accounts to set.
 * @returns The updated CAIP-25 caveat value with the Ethereum accounts set.
 */
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
