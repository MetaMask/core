import type { CaipReference } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import type {
  ExternalScopeObject,
  ExternalScopesObject,
  ScopeString,
  ScopeObject,
  ScopesObject,
} from './types';
import { parseScopeString } from './types';

/**
 * Returns a list of unique items
 *
 * @param list - The list of items to filter
 * @returns A list of unique items
 */
export const getUniqueArrayItems = <Value>(list: Value[]): Value[] => {
  return Array.from(new Set(list));
};

/**
 * Normalizes a ScopeString and ExternalScopeObject into a separate
 * ScopeString and ScopeObject for each reference in the `references`
 * value if defined and adds an empty `accounts` array if not defined.
 *
 * @param scopeString - The string representing the scope
 * @param externalScopeObject - The object that defines the scope
 * @returns a map of caipChainId to ScopeObjects
 */
export const normalizeScope = (
  scopeString: string,
  externalScopeObject: ExternalScopeObject,
): ScopesObject => {
  const { references, ...scopeObject } = externalScopeObject;
  const { namespace, reference } = parseScopeString(scopeString);

  const normalizedScopeObject = {
    accounts: [],
    ...scopeObject,
  };

  // Scope is already a CAIP-2 ID and has no references to flatten
  if (!namespace || reference || !references) {
    return { [scopeString]: normalizedScopeObject };
  }

  const scopeMap: ScopesObject = {};
  references.forEach((nestedReference: CaipReference) => {
    scopeMap[`${namespace}:${nestedReference}`] = cloneDeep(
      normalizedScopeObject,
    );
  });
  return scopeMap;
};

export const mergeScopeObject = (
  scopeObjectA: ScopeObject,
  scopeObjectB: ScopeObject,
) => {
  const mergedScopeObject: ScopeObject = {
    methods: getUniqueArrayItems([
      ...scopeObjectA.methods,
      ...scopeObjectB.methods,
    ]),
    notifications: getUniqueArrayItems([
      ...scopeObjectA.notifications,
      ...scopeObjectB.notifications,
    ]),
    accounts: getUniqueArrayItems([
      ...scopeObjectA.accounts,
      ...scopeObjectB.accounts,
    ]),
  };

  if (scopeObjectA.rpcDocuments || scopeObjectB.rpcDocuments) {
    mergedScopeObject.rpcDocuments = getUniqueArrayItems([
      ...(scopeObjectA.rpcDocuments ?? []),
      ...(scopeObjectB.rpcDocuments ?? []),
    ]);
  }

  if (scopeObjectA.rpcEndpoints || scopeObjectB.rpcEndpoints) {
    mergedScopeObject.rpcEndpoints = getUniqueArrayItems([
      ...(scopeObjectA.rpcEndpoints ?? []),
      ...(scopeObjectB.rpcEndpoints ?? []),
    ]);
  }

  return mergedScopeObject;
};

export const mergeScopes = (
  scopeA: ScopesObject,
  scopeB: ScopesObject,
): ScopesObject => {
  const scope: ScopesObject = {};

  Object.entries(scopeA).forEach(([_scopeString, scopeObjectA]) => {
    const scopeString = _scopeString as ScopeString;
    const scopeObjectB = scopeB[scopeString];

    scope[scopeString] = scopeObjectB
      ? mergeScopeObject(scopeObjectA, scopeObjectB)
      : scopeObjectA;
  });

  Object.entries(scopeB).forEach(([_scopeString, scopeObjectB]) => {
    const scopeString = _scopeString as ScopeString;
    const scopeObjectA = scopeA[scopeString];

    if (!scopeObjectA) {
      scope[scopeString] = scopeObjectB;
    }
  });

  return scope;
};

export const normalizeMergeScopes = (
  scopes: ExternalScopesObject,
): ScopesObject => {
  let mergedScopes: ScopesObject = {};
  Object.keys(scopes).forEach((scopeString) => {
    const normalizedScopes = normalizeScope(scopeString, scopes[scopeString]);
    mergedScopes = mergeScopes(mergedScopes, normalizedScopes);
  });

  return mergedScopes;
};
