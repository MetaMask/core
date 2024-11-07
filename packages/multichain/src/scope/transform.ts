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

  const normalizedScopeObject: ScopeObject = {
    accounts: [],
    ...scopeObject,
  };

  const shouldFlatten =
    namespace &&
    !reference &&
    references !== undefined &&
    references.length > 0;

  if (shouldFlatten) {
    return Object.fromEntries(
      references.map((ref: CaipReference) => [
        `${namespace}:${ref}`,
        cloneDeep(normalizedScopeObject),
      ]),
    );
  }
  return { [scopeString]: normalizedScopeObject };
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

export const normalizeAndMergeScopes = (
  scopes: ExternalScopesObject,
): ScopesObject => {
  let mergedScopes: ScopesObject = {};
  Object.keys(scopes).forEach((scopeString) => {
    const normalizedScopes = normalizeScope(scopeString, scopes[scopeString]);
    mergedScopes = mergeScopes(mergedScopes, normalizedScopes);
  });

  return mergedScopes;
};
