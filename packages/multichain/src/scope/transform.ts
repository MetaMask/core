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
 * Flattens a ScopeString and ScopeObject into a separate
 * ScopeString and ScopeObject for each reference in the `references`
 * value if defined. Returns the ScopeString and ScopeObject
 * unmodified if it cannot be flattened
 *
 * @param scopeString - The string representing the scopeObject
 * @param scopeObject - The object that defines the scope
 * @returns a map of caipChainId to ScopeObjects
 */
export const flattenScope = (
  scopeString: string,
  scopeObject: ExternalScopeObject,
): ScopesObject => {
  const { references, ...restScopeObject } = scopeObject;
  const { namespace, reference } = parseScopeString(scopeString);

  // Scope is already a CAIP-2 ID and has no references to flatten
  if (!namespace || reference || !references) {
    return { [scopeString]: scopeObject };
  }

  const scopeMap: ScopesObject = {};
  references.forEach((nestedReference: CaipReference) => {
    scopeMap[`${namespace}:${nestedReference}`] = cloneDeep(restScopeObject);
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
  };

  if (scopeObjectA.accounts || scopeObjectB.accounts) {
    mergedScopeObject.accounts = getUniqueArrayItems([
      ...(scopeObjectA.accounts ?? []),
      ...(scopeObjectB.accounts ?? []),
    ]);
  }

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

export const flattenMergeScopes = (
  scopes: ExternalScopesObject,
): ScopesObject => {
  let flattenedScopes: ScopesObject = {};
  Object.keys(scopes).forEach((scopeString) => {
    const flattenedScopeMap = flattenScope(scopeString, scopes[scopeString]);
    flattenedScopes = mergeScopes(flattenedScopes, flattenedScopeMap);
  });

  return flattenedScopes;
};
