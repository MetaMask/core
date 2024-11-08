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
    if (reference && references.length > 0) {
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
