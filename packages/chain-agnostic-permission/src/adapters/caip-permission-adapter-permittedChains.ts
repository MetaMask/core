import { toHex } from '@metamask/controller-utils';
import type { Hex, CaipChainId, CaipNamespace } from '@metamask/utils';
import { hexToBigInt, KnownCaipNamespace } from '@metamask/utils';

import { Caip25CaveatType, type Caip25CaveatValue } from '../caip25Permission';
import { getUniqueArrayItems } from '../scope/transform';
import type { InternalScopesObject, InternalScopeString } from '../scope/types';
import { isWalletScope, parseScopeString } from '../scope/types';

/*
 *
 *
 * EVM SPECIFIC GETTERS AND SETTERS
 *
 *
 */

/**
 * Gets the Ethereum (EIP155 namespaced) chainIDs from internal scopes.
 *
 * @param scopes - The internal scopes from which to get the Ethereum chainIDs.
 * @returns An array of Ethereum chainIDs.
 */
const getPermittedEthChainIdsFromScopes = (scopes: InternalScopesObject) => {
  const ethChainIds: Hex[] = [];

  Object.keys(scopes).forEach((scopeString) => {
    const { namespace, reference } = parseScopeString(scopeString);
    if (namespace === KnownCaipNamespace.Eip155 && reference) {
      ethChainIds.push(toHex(reference));
    }
  });

  return ethChainIds;
};

/**
 * Gets the Ethereum (EIP155 namespaced) chainIDs from the required and optional scopes.
 *
 * @param caip25CaveatValue - The CAIP-25 caveat value from which to get the Ethereum chainIDs.
 * @returns An array of Ethereum chainIDs.
 */
export const getPermittedEthChainIds = (
  caip25CaveatValue: Pick<
    Caip25CaveatValue,
    'requiredScopes' | 'optionalScopes'
  >,
) => {
  const { requiredScopes, optionalScopes } = caip25CaveatValue;

  const ethChainIds: Hex[] = [
    ...getPermittedEthChainIdsFromScopes(requiredScopes),
    ...getPermittedEthChainIdsFromScopes(optionalScopes),
  ];

  return getUniqueArrayItems(ethChainIds);
};

/**
 * Adds an Ethereum (EIP155 namespaced) chainID to the optional scopes if it is not already present
 * in either the pre-existing required or optional scopes.
 *
 * @param caip25CaveatValue - The CAIP-25 caveat value to add the Ethereum chainID to.
 * @param chainId - The Ethereum chainID to add.
 * @returns The updated CAIP-25 caveat value with the added Ethereum chainID.
 */
export const addPermittedEthChainId = (
  caip25CaveatValue: Caip25CaveatValue,
  chainId: Hex,
): Caip25CaveatValue => {
  const scopeString = `eip155:${hexToBigInt(chainId).toString(10)}`;
  if (
    Object.keys(caip25CaveatValue.requiredScopes).includes(scopeString) ||
    Object.keys(caip25CaveatValue.optionalScopes).includes(scopeString)
  ) {
    return caip25CaveatValue;
  }

  return {
    ...caip25CaveatValue,
    optionalScopes: {
      ...caip25CaveatValue.optionalScopes,
      [scopeString]: {
        accounts: [],
      },
    },
  };
};

/**
 * Filters the scopes object to only include:
 * - Scopes without references (e.g. "wallet:")
 * - EIP155 scopes for the given chainIDs
 * - Non EIP155 scopes (e.g. "bip122:" or any other non ethereum namespaces)
 *
 * @param scopesObject - The scopes object to filter.
 * @param chainIds - The chainIDs to filter EIP155 scopes by.
 * @returns The filtered scopes object.
 */
const filterEthScopesObjectByChainId = (
  scopesObject: InternalScopesObject,
  chainIds: Hex[],
): InternalScopesObject => {
  const updatedScopesObject: InternalScopesObject = {};

  Object.entries(scopesObject).forEach(([key, scopeObject]) => {
    // Cast needed because index type is returned as `string` by `Object.entries`
    const scopeString = key as keyof typeof scopesObject;
    const { namespace, reference } = parseScopeString(scopeString);
    if (!reference) {
      updatedScopesObject[scopeString] = scopeObject;
      return;
    }
    if (namespace === KnownCaipNamespace.Eip155) {
      const chainId = toHex(reference);
      if (chainIds.includes(chainId)) {
        updatedScopesObject[scopeString] = scopeObject;
      }
    } else {
      updatedScopesObject[scopeString] = scopeObject;
    }
  });

  return updatedScopesObject;
};

/**
 * Sets the permitted Ethereum (EIP155 namespaced) chainIDs for the required and optional scopes.
 *
 * @param caip25CaveatValue - The CAIP-25 caveat value to set the permitted Ethereum chainIDs for.
 * @param chainIds - The Ethereum chainIDs to set as permitted.
 * @returns The updated CAIP-25 caveat value with the permitted Ethereum chainIDs.
 */
export const setPermittedEthChainIds = (
  caip25CaveatValue: Caip25CaveatValue,
  chainIds: Hex[],
): Caip25CaveatValue => {
  let updatedCaveatValue: Caip25CaveatValue = {
    ...caip25CaveatValue,
    requiredScopes: filterEthScopesObjectByChainId(
      caip25CaveatValue.requiredScopes,
      chainIds,
    ),
    optionalScopes: filterEthScopesObjectByChainId(
      caip25CaveatValue.optionalScopes,
      chainIds,
    ),
  };

  chainIds.forEach((chainId) => {
    updatedCaveatValue = addPermittedEthChainId(updatedCaveatValue, chainId);
  });

  return updatedCaveatValue;
};

/*
 *
 *
 * GENERALIZED GETTERS AND SETTERS
 *
 *
 */

/*
 *
 * GETTERS
 *
 */

/**
 * Gets all scopes from a CAIP-25 caveat value
 *
 * @param scopesObjects - The scopes objects to get the scopes from.
 * @returns An array of InternalScopeStrings.
 */
export function getAllScopesFromScopesObjects(
  scopesObjects: InternalScopesObject[],
): InternalScopeString[] {
  const scopeSet = new Set<InternalScopeString>();

  for (const scopeObject of scopesObjects) {
    for (const key of Object.keys(scopeObject)) {
      scopeSet.add(key as InternalScopeString);
    }
  }

  return Array.from(scopeSet);
}

/**
 * Gets all scopes (chain IDs) from a CAIP-25 caveat
 * This extracts all scopes from both required and optional scopes
 * and returns a unique set.
 *
 * @param caip25CaveatValue - The CAIP-25 caveat value to extract scopes from
 * @returns Array of unique scope strings (chain IDs)
 */
export function getAllScopesFromCaip25CaveatValue(
  caip25CaveatValue: Caip25CaveatValue,
): CaipChainId[] {
  return getAllScopesFromScopesObjects([
    caip25CaveatValue.requiredScopes,
    caip25CaveatValue.optionalScopes,
  ]) as CaipChainId[];
}

/**
 * Gets all non-wallet namespaces from a CAIP-25 caveat value
 * This extracts all namespaces from both required and optional scopes
 * and returns a unique set.
 *
 * @param caip25CaveatValue - The CAIP-25 caveat value to extract namespaces from
 * @returns Array of unique namespace strings
 */
export function getAllNamespacesFromCaip25CaveatValue(
  caip25CaveatValue: Caip25CaveatValue,
): CaipNamespace[] {
  const allScopes = getAllScopesFromCaip25CaveatValue(caip25CaveatValue);
  const namespaceSet = new Set<CaipNamespace>();

  for (const scope of allScopes) {
    const { namespace, reference } = parseScopeString(scope);
    if (namespace === KnownCaipNamespace.Wallet) {
      namespaceSet.add(reference ?? namespace);
    } else if (namespace) {
      namespaceSet.add(namespace);
    }
  }

  return Array.from(namespaceSet);
}

/**
 * Gets all scopes (chain IDs) from a CAIP-25 permission
 * This extracts all scopes from both required and optional scopes
 * and returns a unique set.
 *
 * @param caip25Permission - The CAIP-25 permission object
 * @param caip25Permission.caveats - The caveats of the CAIP-25 permission
 * @returns Array of unique scope strings (chain IDs)
 */
export function getAllScopesFromPermission(caip25Permission: {
  caveats: {
    type: string;
    value: Caip25CaveatValue;
  }[];
}): CaipChainId[] {
  const caip25Caveat = caip25Permission.caveats.find(
    (caveat) => caveat.type === Caip25CaveatType,
  );
  if (!caip25Caveat) {
    return [];
  }

  return getAllScopesFromCaip25CaveatValue(caip25Caveat.value);
}

/*
 *
 * SETTERS
 *
 */

/**
 * Adds a chainID to the optional scopes if it is not already present
 * in either the pre-existing required or optional scopes.
 *
 * @param caip25CaveatValue - The CAIP-25 caveat value to add the chainID to.
 * @param chainId - The chainID to add.
 * @returns The updated CAIP-25 caveat value with the added chainID.
 */
export const addCaipChainIdInCaip25CaveatValue = (
  caip25CaveatValue: Caip25CaveatValue,
  chainId: CaipChainId,
): Caip25CaveatValue => {
  if (
    caip25CaveatValue.requiredScopes[chainId] ||
    caip25CaveatValue.optionalScopes[chainId]
  ) {
    return caip25CaveatValue;
  }

  return {
    ...caip25CaveatValue,
    optionalScopes: {
      ...caip25CaveatValue.optionalScopes,
      [chainId]: {
        accounts: [],
      },
    },
  };
};

/**
 * Sets the CAIP-2 chainIds for the required and optional scopes.
 * If the caip25CaveatValue contains chainIds not in the chainIds array arg they are filtered out
 *
 * @param caip25CaveatValue - The CAIP-25 caveat value to set the permitted CAIP-2 chainIDs for.
 * @param chainIds - The CAIP-2 chainIDs to set.
 * @returns The updated CAIP-25 caveat value with the CAIP-2 chainIDs.
 */
export const setChainIdsInCaip25CaveatValue = (
  caip25CaveatValue: Caip25CaveatValue,
  chainIds: CaipChainId[],
): Caip25CaveatValue => {
  const chainIdSet = new Set(chainIds);
  const result: Caip25CaveatValue = {
    requiredScopes: {},
    optionalScopes: {},
    sessionProperties: caip25CaveatValue.sessionProperties,
    isMultichainOrigin: caip25CaveatValue.isMultichainOrigin,
  };

  for (const [key, value] of Object.entries(caip25CaveatValue.requiredScopes)) {
    const scopeString = key as keyof typeof caip25CaveatValue.requiredScopes;
    if (isWalletScope(scopeString) || chainIdSet.has(scopeString)) {
      result.requiredScopes[scopeString] = value;
    }
  }

  for (const [key, value] of Object.entries(caip25CaveatValue.optionalScopes)) {
    const scopeString = key as keyof typeof caip25CaveatValue.optionalScopes;
    if (isWalletScope(scopeString) || chainIdSet.has(scopeString)) {
      result.optionalScopes[scopeString] = value;
    }
  }

  for (const chainId of chainIds) {
    if (!result.requiredScopes[chainId] && !result.optionalScopes[chainId]) {
      result.optionalScopes[chainId] = { accounts: [] };
    }
  }

  return result;
};
