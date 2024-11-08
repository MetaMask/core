import { isCaipReference } from '@metamask/utils';

import type {
  ExternalScopeString,
  ExternalScopeObject,
  ExternalScopesObject,
} from './types';
import { parseScopeString } from './types';

/**
 * Validates a scope object according to the [CAIP-217](https://chainagnostic.org/CAIPs/caip-217) spec.
 * @param scopeString - The scope string to validate.
 * @param scopeObject - The scope object to validate.
 * @returns A boolean indicating if the scope object is valid according to the [CAIP-217](https://chainagnostic.org/CAIPs/caip-217) spec.
 */
export const isValidScope = (
  scopeString: ExternalScopeString,
  scopeObject: ExternalScopeObject,
): boolean => {
  const { namespace, reference } = parseScopeString(scopeString);

  if (!namespace && !reference) {
    return false;
  }

  const {
    references,
    methods,
    notifications,
    accounts,
    rpcDocuments,
    rpcEndpoints,
    ...restScopeObject
  } = scopeObject;

  if (!methods || !notifications) {
    return false;
  }

  // These assume that the namespace has a notion of chainIds
  if (reference && references && references.length > 0) {
    return false;
  }

  if (namespace && references) {
    const areReferencesValid = references.every((nestedReference) => {
      return isCaipReference(nestedReference);
    });

    if (!areReferencesValid) {
      return false;
    }
  }

  const areMethodsValid = methods.every(
    (method) => typeof method === 'string' && method !== '',
  );
  if (!areMethodsValid) {
    return false;
  }

  const areNotificationsValid = notifications.every(
    (notification) => typeof notification === 'string' && notification !== '',
  );
  if (!areNotificationsValid) {
    return false;
  }

  // unexpected properties found on scopeObject
  if (Object.keys(restScopeObject).length !== 0) {
    return false;
  }

  return true;
};

/**
 * Validates a set of scopes according to the [CAIP-217](https://chainagnostic.org/CAIPs/caip-217) spec.
 * @param requiredScopes - The required scopes to validate.
 * @param optionalScopes - The optional scopes to validate.
 * @returns An object containing the valid required scopes and optional scopes.
 */
export const validateScopes = (
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
