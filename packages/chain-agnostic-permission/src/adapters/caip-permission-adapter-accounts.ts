import {
  assertIsStrictHexString,
  type CaipAccountId,
  type Hex,
  KnownCaipNamespace,
  parseCaipAccountId,
} from '@metamask/utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { Caip25CaveatValue } from '../caip25Permission';
import { KnownWalletScopeString } from '../scope/constants';
import { getUniqueArrayItems } from '../scope/transform';
import type { InternalScopeString, InternalScopesObject } from '../scope/types';
import { parseScopeString } from '../scope/types';

/*
 *
 *
 * EVM SPECIFIC GETTERS AND SETTERS
 *
 *
 */

/**
 *
 * Checks if a scope string is either an EIP155 or wallet namespaced scope string.
 *
 * @param scopeString - The scope string to check.
 * @returns True if the scope string is an EIP155 or wallet namespaced scope string, false otherwise.
 */
const isEip155ScopeString = (scopeString: InternalScopeString) => {
  const { namespace } = parseScopeString(scopeString);

  return (
    namespace === KnownCaipNamespace.Eip155 ||
    // We are trying to discern the type of `scopeString`.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    scopeString === KnownWalletScopeString.Eip155
  );
};

/**
 * Gets the Ethereum (EIP155 namespaced) accounts from internal scopes.
 *
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
 *
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
 *
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
    if (namespace && reference) {
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
 *
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

/*
 *
 *
 * GENERALIZED GETTERS AND SETTERS
 *
 *
 */

/**
 *
 * Getters
 *
 */

/**
 * Gets all accounts from an array of scopes objects
 * This extracts all account IDs from both required and optional scopes
 * and returns a unique set.
 *
 * @param scopesObjects - The scopes objects to extract accounts from
 * @returns Array of unique account IDs
 */
export function getCaipAccountIdsFromScopesObjects(
  scopesObjects: InternalScopesObject[],
): CaipAccountId[] {
  const allAccounts = new Set<CaipAccountId>();

  for (const scopeObject of scopesObjects) {
    for (const { accounts } of Object.values(scopeObject)) {
      for (const account of accounts) {
        allAccounts.add(account);
      }
    }
  }

  return Array.from(allAccounts);
}

/**
 * Gets all permitted accounts from a CAIP-25 caveat
 * This extracts all account IDs from both required and optional scopes
 * and returns a unique set.
 *
 * @param caip25CaveatValue - The CAIP-25 caveat value to extract accounts from
 * @returns Array of unique account IDs
 */
export function getCaipAccountIdsFromCaip25CaveatValue(
  caip25CaveatValue: Caip25CaveatValue,
): CaipAccountId[] {
  return getCaipAccountIdsFromScopesObjects([
    caip25CaveatValue.requiredScopes,
    caip25CaveatValue.optionalScopes,
  ]);
}

/**
 *
 * Setters
 *
 */

/**
 * Sets the CAIP account IDs to scopes with matching namespaces in the given scopes object.
 * This function should not be used with Smart Contract Accounts (SCA) because
 * it adds the same account ID to all the scopes that have the same namespace.
 *
 * @param scopesObject - The scopes object to set the CAIP account IDs for.
 * @param accounts - The CAIP account IDs to add to the appropriate scopes.
 * @returns The updated scopes object with the CAIP account IDs set.
 */
const setNonSCACaipAccountIdsInScopesObject = (
  scopesObject: InternalScopesObject,
  accounts: CaipAccountId[],
) => {
  const accountsByNamespace = new Map<string, Set<string>>();

  for (const account of accounts) {
    const {
      chain: { namespace },
      address,
    } = parseCaipAccountId(account);

    if (!accountsByNamespace.has(namespace)) {
      accountsByNamespace.set(namespace, new Set());
    }

    accountsByNamespace.get(namespace)?.add(address);
  }

  const updatedScopesObject: InternalScopesObject = {};

  for (const [scopeString, scopeObject] of Object.entries(scopesObject)) {
    const { namespace, reference } = parseScopeString(scopeString as string);

    let caipAccounts: CaipAccountId[] = [];

    if (namespace && reference && accountsByNamespace.has(namespace)) {
      const addressSet = accountsByNamespace.get(namespace);
      if (addressSet) {
        caipAccounts = Array.from(addressSet).map(
          (address) => `${namespace}:${reference}:${address}` as CaipAccountId,
        );
      }
    }

    updatedScopesObject[scopeString as keyof typeof scopesObject] = {
      ...scopeObject,
      accounts: getUniqueArrayItems(caipAccounts),
    };
  }

  return updatedScopesObject;
};

/**
 * Sets the permitted accounts to scopes with matching namespaces in the given CAIP-25 caveat value.
 * This function should not be used with Smart Contract Accounts (SCA) because
 * it adds the same account ID to all scopes that have the same namespace as the account.
 *
 * @param caip25CaveatValue - The CAIP-25 caveat value to set the permitted accounts for.
 * @param accounts - The permitted accounts to add to the appropriate scopes.
 * @returns The updated CAIP-25 caveat value with the permitted accounts set.
 */
export const setNonSCACaipAccountIdsInCaip25CaveatValue = (
  caip25CaveatValue: Caip25CaveatValue,
  accounts: CaipAccountId[],
): Caip25CaveatValue => {
  return {
    ...caip25CaveatValue,
    requiredScopes: setNonSCACaipAccountIdsInScopesObject(
      caip25CaveatValue.requiredScopes,
      accounts,
    ),
    optionalScopes: setNonSCACaipAccountIdsInScopesObject(
      caip25CaveatValue.optionalScopes,
      accounts,
    ),
  };
};

/**
 * Checks if an internal account is connected to any of the permitted accounts
 * based on scope matching
 *
 * @param internalAccount - The internal account to check against permitted accounts
 * @param permittedAccounts - Array of CAIP-10 account IDs that are permitted
 * @returns True if the account is connected to any permitted account
 */
export function isInternalAccountInPermittedAccountIds(
  internalAccount: InternalAccount,
  permittedAccounts: CaipAccountId[],
): boolean {
  if (!internalAccount || !permittedAccounts.length) {
    return false;
  }

  const parsedInteralAccountScopes = internalAccount.scopes.map((scope) => {
    return parseScopeString(scope);
  });

  return permittedAccounts.some((account) => {
    const parsedPermittedAccount = parseCaipAccountId(account);

    return parsedInteralAccountScopes.some(({ namespace, reference }) => {
      if (
        namespace !== parsedPermittedAccount.chain.namespace ||
        internalAccount.address !== parsedPermittedAccount.address
      ) {
        return false;
      }

      return (
        reference === '0' ||
        reference === parsedPermittedAccount.chain.reference
      );
    });
  });
}
