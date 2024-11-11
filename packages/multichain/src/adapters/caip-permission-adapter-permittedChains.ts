import { toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { KnownCaipNamespace } from '@metamask/utils';

import type { Caip25CaveatValue } from '../caip25Permission';
import {
  KnownNotifications,
  KnownRpcMethods,
  KnownWalletScopeString,
} from '../scope/constants';
import { getUniqueArrayItems, mergeScopes } from '../scope/transform';
import type { InternalScopesObject, InternalScopeString } from '../scope/types';
import { parseScopeString } from '../scope/types';

/**
 * Gets the Ethereum (EIP155 namespaced) chainIDs from the required and optional scopes.
 * @param caip25CaveatValue - The CAIP-25 caveat value from which to get the Ethereum chainIDs.
 * @returns An array of Ethereum chainIDs.
 */
export const getPermittedEthChainIds = (
  caip25CaveatValue: Pick<
    Caip25CaveatValue,
    'requiredScopes' | 'optionalScopes'
  >,
) => {
  const ethChainIds: Hex[] = [];
  const sessionScopes = mergeScopes(
    caip25CaveatValue.requiredScopes,
    caip25CaveatValue.optionalScopes,
  );

  Object.keys(sessionScopes).forEach((scopeString) => {
    const { namespace, reference } = parseScopeString(scopeString);
    if (namespace === KnownCaipNamespace.Eip155 && reference) {
      ethChainIds.push(toHex(reference));
    }
  });

  return getUniqueArrayItems(ethChainIds);
};

/**
 * Adds an Ethereum (EIP155 namespaced) chainID to the required and optional scopes.
 * @param caip25CaveatValue - The CAIP-25 caveat value to add the Ethereum chainID to.
 * @param chainId - The Ethereum chainID to add.
 * @returns The updated CAIP-25 caveat value with the added Ethereum chainID.
 */
export const addPermittedEthChainId = (
  caip25CaveatValue: Caip25CaveatValue,
  chainId: Hex,
) => {
  const scopeString = `eip155:${parseInt(chainId, 16)}`;
  if (
    Object.keys(caip25CaveatValue.requiredScopes).includes(scopeString) ||
    Object.keys(caip25CaveatValue.optionalScopes).includes(scopeString)
  ) {
    return caip25CaveatValue;
  }

  return {
    ...caip25CaveatValue,
    optionalScopes: {
      [KnownWalletScopeString.Eip155]: {
        methods: [],
        notifications: [],
        accounts: [],
      },
      ...caip25CaveatValue.optionalScopes,
      [scopeString]: {
        methods: KnownRpcMethods.eip155,
        notifications: KnownNotifications.eip155,
        accounts: [],
      },
    },
  };
};

/**
 * Filters the scopes object to only include the scopes for the given chainIDs.
 * @param scopesObject - The scopes object to filter.
 * @param chainIds - The chainIDs to filter the scopes object by.
 * @returns The filtered scopes object.
 */
const filterEthScopesObjectByChainId = (
  scopesObject: InternalScopesObject,
  chainIds: Hex[],
) => {
  const updatedScopesObject: InternalScopesObject = {};

  Object.entries(scopesObject).forEach(([scopeString, scopeObject]) => {
    const { namespace, reference } = parseScopeString(scopeString);
    if (!reference) {
      updatedScopesObject[scopeString as InternalScopeString] = scopeObject;
      return;
    }
    if (namespace === KnownCaipNamespace.Eip155) {
      const chainId = toHex(reference);
      if (chainIds.includes(chainId)) {
        updatedScopesObject[scopeString as InternalScopeString] = scopeObject;
      }
    } else {
      updatedScopesObject[scopeString as InternalScopeString] = scopeObject;
    }
  });

  return updatedScopesObject;
};

/**
 * Sets the permitted Ethereum (EIP155 namespaced) chainIDs for the required and optional scopes.
 * @param caip25CaveatValue - The CAIP-25 caveat value to set the permitted Ethereum chainIDs for.
 * @param chainIds - The Ethereum chainIDs to set as permitted.
 * @returns The updated CAIP-25 caveat value with the permitted Ethereum chainIDs.
 */
export const setPermittedEthChainIds = (
  caip25CaveatValue: Caip25CaveatValue,
  chainIds: Hex[],
) => {
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