import { type CaipAccountId, isCaipReference } from '@metamask/utils';

import type {
  ExternalScopeString,
  ExternalScopeObject,
  ExternalScopesObject,
  InternalScopesObject,
  InternalScopeString,
} from './types';
import { parseScopeString } from './types';
import { KnownSessionProperties } from './constants';

/**
 * Validates a scope object according to the [CAIP-217](https://chainagnostic.org/CAIPs/caip-217) spec.
 *
 * @param scopeString - The scope string to validate.
 * @param scopeObject - The scope object to validate.
 * @returns A boolean indicating if the scope object is valid according to the [CAIP-217](https://chainagnostic.org/CAIPs/caip-217) spec.
 */
export const isValidScope = (
  scopeString: ExternalScopeString,
  scopeObject: ExternalScopeObject,
): boolean => {
  const { namespace, reference } = parseScopeString(scopeString);

  // Namespace is required
  if (!namespace) {
    return false;
  }

  const {
    references,
    methods,
    notifications,
    accounts,
    rpcDocuments,
    rpcEndpoints,
    ...extraProperties
  } = scopeObject;

  // Methods and notifications are required
  if (!methods || !notifications) {
    return false;
  }

  // For namespaces other than 'wallet', either reference or non-empty references array must be present
  if (
    namespace !== 'wallet' &&
    !reference &&
    (!references || references.length === 0)
  ) {
    return false;
  }

  // If references are present, reference must be absent and all references must be valid
  if (references) {
    if (reference) {
      return false;
    }

    const areReferencesValid = references.every((nestedReference) =>
      isCaipReference(nestedReference),
    );

    if (!areReferencesValid) {
      return false;
    }
  }

  const areMethodsValid = methods.every(
    (method) => typeof method === 'string' && method.trim() !== '',
  );

  if (!areMethodsValid) {
    return false;
  }

  const areNotificationsValid = notifications.every(
    (notification) =>
      typeof notification === 'string' && notification.trim() !== '',
  );

  if (!areNotificationsValid) {
    return false;
  }

  // Ensure no unexpected properties are present in the scope object
  if (Object.keys(extraProperties).length > 0) {
    return false;
  }

  return true;
};

/**
 * Filters out invalid scopes and returns valid sets of required and optional scopes according to the [CAIP-217](https://chainagnostic.org/CAIPs/caip-217) spec.
 *
 * @param requiredScopes - The required scopes to validate.
 * @param optionalScopes - The optional scopes to validate.
 * @returns An object containing valid required scopes and optional scopes.
 */
export const getValidScopes = (
  requiredScopes?: ExternalScopesObject,
  optionalScopes?: ExternalScopesObject,
) => {
  const validRequiredScopes: ExternalScopesObject = {};
  for (const [scopeString, scopeObject] of Object.entries(
    requiredScopes || {},
  )) {
    if (isValidScope(scopeString, scopeObject)) {
      validRequiredScopes[scopeString] = {
        accounts: [],
        ...scopeObject,
      };
    }
  }

  const validOptionalScopes: ExternalScopesObject = {};
  for (const [scopeString, scopeObject] of Object.entries(
    optionalScopes || {},
  )) {
    if (isValidScope(scopeString, scopeObject)) {
      validOptionalScopes[scopeString] = {
        accounts: [],
        ...scopeObject,
      };
    }
  }

  return {
    validRequiredScopes,
    validOptionalScopes,
  };
};

/**
 * Gets all accounts from an array of scopes objects
 * This extracts all account IDs from both required and optional scopes
 * and returns a unique set.
 *
 * @param scopesObjects - The scopes objects to extract accounts from
 * @returns Array of unique account IDs
 */
// TODO: unit test (and confirm where to store this)
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
 * Gets all scopes from a CAIP-25 caveat value
 *
 * @param scopesObjects - The scopes objects to get the scopes from.
 * @returns An array of InternalScopeStrings.
 */
// TODO: unit test (and confirm where to store this)
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
 * Checks if a given value is a known session property.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a known session property, otherwise `false`.
 */
export function isKnownSessionPropertyValue(
  value: string,
): value is KnownSessionProperties {
  return Object.values(KnownSessionProperties).includes(
    value as KnownSessionProperties,
  );
}
