import {
  assertIsStrictHexString,
  type CaipAccountId,
  type Hex,
  KnownCaipNamespace,
  parseCaipAccountId,
} from '@metamask/utils';

import type { Caip25CaveatValue } from '../caip25Permission';
import { KnownWalletScopeString } from '../scope/constants';
import { getUniqueArrayItems } from '../scope/transform';
import type { InternalScopeString, InternalScopesObject } from '../scope/types';
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
 * Gets the Ethereum (EIP155 namespaced) accounts from internal scopes.
 * @param scopes - The internal scopes from which to get the Ethereum accounts.
 * @returns An array of Ethereum accounts.
 */
const getEthAccountsFromScopes = (scopes: InternalScopesObject) => {
  const ethAccounts: Hex[] = [];

  Object.entries(scopes).forEach(([_, { accounts }]) => {
    accounts?.forEach((account) => {
      const { address, chainId } = parseCaipAccountId(account);

      if (isEip155ScopeString(chainId)) {
        // This address should always be a valid Hex string because
        // it's an EIP155/Ethereum account
        assertIsStrictHexString(address);
        ethAccounts.push(address);
      }
    });
  });

  return ethAccounts;
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
): Hex[] => {
  const { requiredScopes, optionalScopes } = caip25CaveatValue;

  const ethAccounts: Hex[] = [
    ...getEthAccountsFromScopes(requiredScopes),
    ...getEthAccountsFromScopes(optionalScopes),
  ];

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
  Object.entries(scopesObject).forEach(([key, scopeObject]) => {
    // Cast needed because index type is returned as `string` by `Object.entries`
    const scopeString = key as keyof typeof scopesObject;
    const isWalletNamespace = scopeString === KnownCaipNamespace.Wallet;
    const { namespace, reference } = parseScopeString(scopeString);
    if (!isEip155ScopeString(scopeString) && !isWalletNamespace) {
      updatedScopesObject[scopeString] = scopeObject;
      return;
    }

    let caipAccounts: CaipAccountId[] = [];
    if (isWalletNamespace) {
      caipAccounts = accounts.map<CaipAccountId>(
        (account) => `${KnownWalletScopeString.Eip155}:${account}`,
      );
    } else if (namespace && reference) {
      caipAccounts = accounts.map<CaipAccountId>(
        (account) => `${namespace}:${reference}:${account}`,
      );
    }

    updatedScopesObject[scopeString] = {
      ...scopeObject,
      accounts: caipAccounts,
    };
  });

  return updatedScopesObject;
};

/**
 * Sets the Ethereum (EIP155 namespaced) accounts for the given CAIP-25 caveat value.
 * We set the same accounts for all the scopes that are EIP155 or Wallet namespaced because
 * we do not provide UI/UX flows for selecting different accounts across different chains.
 * @param caip25CaveatValue - The CAIP-25 caveat value to set the Ethereum accounts for.
 * @param accounts - The Ethereum accounts to set.
 * @returns The updated CAIP-25 caveat value with the Ethereum accounts set.
 */
export const setEthAccounts = (
  caip25CaveatValue: Caip25CaveatValue,
  accounts: Hex[],
): Caip25CaveatValue => {
  return {
    ...caip25CaveatValue,
    requiredScopes: setEthAccountsForScopesObject(
      caip25CaveatValue.requiredScopes,
      accounts,
    ),
    optionalScopes: setEthAccountsForScopesObject(
      caip25CaveatValue.optionalScopes,
      accounts,
    ),
  };
};
