import {
  hasProperty,
  isCaipAccountId,
  isCaipChainId,
  isCaipNamespace,
  isCaipReference,
  type Hex,
} from '@metamask/utils';

import { Caip25Errors } from './errors';
import {
  isSupportedMethod,
  isSupportedNotification,
  isSupportedScopeString,
} from './supported';
import type {
  ExternalScopeObject,
  ExternalScopesObject,
  ExternalScopeString,
  InternalScopeObject,
  InternalScopesObject,
} from './types';

/**
 * Asserts that a scope string and its associated scope object are supported.
 * @param scopeString - The scope string against which to assert support.
 * @param scopeObject - The scope object against which to assert support.
 * @param options - An object containing the following properties:
 * @param options.isChainIdSupported - A predicate that determines if a chainID is supported.
 */
export const assertScopeSupported = (
  scopeString: string,
  scopeObject: InternalScopeObject,
  {
    isChainIdSupported,
  }: {
    isChainIdSupported: (chainId: Hex) => boolean;
  },
) => {
  const { methods, notifications } = scopeObject;
  if (!isSupportedScopeString(scopeString, isChainIdSupported)) {
    throw Caip25Errors.requestedChainsNotSupportedError();
  }

  const allMethodsSupported = methods.every((method) =>
    isSupportedMethod(scopeString, method),
  );

  if (!allMethodsSupported) {
    throw Caip25Errors.requestedMethodsNotSupportedError();
  }

  if (
    notifications &&
    !notifications.every((notification) =>
      isSupportedNotification(scopeString, notification),
    )
  ) {
    throw Caip25Errors.requestedNotificationsNotSupportedError();
  }
};

/**
 * Asserts that all scope strings and their associated scope objects are supported.
 * @param scopes - The scopes object against which to assert support.
 * @param options - An object containing the following properties:
 * @param options.isChainIdSupported - A predicate that determines if a chainID is supported.
 */
export const assertScopesSupported = (
  scopes: InternalScopesObject,
  {
    isChainIdSupported,
  }: {
    isChainIdSupported: (chainId: Hex) => boolean;
  },
) => {
  for (const [scopeString, scopeObject] of Object.entries(scopes)) {
    assertScopeSupported(scopeString, scopeObject, {
      isChainIdSupported,
    });
  }
};
/**
 * Asserts that an object is a valid ExternalScopeObject.
 * @param obj - The object to assert.
 */
function assertIsExternalScopeObject(
  obj: unknown,
): asserts obj is ExternalScopeObject {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('ExternalScopeObject must be an object');
  }

  if (hasProperty(obj, 'references')) {
    if (
      !Array.isArray(obj.references) ||
      !obj.references.every(isCaipReference)
    ) {
      throw new Error(
        'ExternalScopeObject.references must be an array of CaipReference',
      );
    }
  }

  if (hasProperty(obj, 'accounts')) {
    if (!Array.isArray(obj.accounts) || !obj.accounts.every(isCaipAccountId)) {
      throw new Error(
        'ExternalScopeObject.accounts must be an array of CaipAccountId',
      );
    }
  }

  if (hasProperty(obj, 'methods')) {
    if (
      !Array.isArray(obj.methods) ||
      !obj.methods.every((method) => typeof method === 'string')
    ) {
      throw new Error(
        'ExternalScopeObject.methods must be an array of strings',
      );
    }
  }

  if (hasProperty(obj, 'notifications')) {
    if (
      !Array.isArray(obj.notifications) ||
      !obj.notifications.every(
        (notification) => typeof notification === 'string',
      )
    ) {
      throw new Error(
        'ExternalScopeObject.notifications must be an array of strings',
      );
    }
  }

  if (hasProperty(obj, 'rpcDocuments')) {
    if (
      !Array.isArray(obj.rpcDocuments) ||
      !obj.rpcDocuments.every((doc) => typeof doc === 'string')
    ) {
      throw new Error(
        'ExternalScopeObject.rpcDocuments must be an array of strings',
      );
    }
  }

  if (hasProperty(obj, 'rpcEndpoints')) {
    if (
      !Array.isArray(obj.rpcEndpoints) ||
      !obj.rpcEndpoints.every((endpoint) => typeof endpoint === 'string')
    ) {
      throw new Error(
        'ExternalScopeObject.rpcEndpoints must be an array of strings',
      );
    }
  }
}

/**
 * Asserts that a scope string is a valid ExternalScopeString.
 * @param scopeString - The scope string to assert.
 */
function assertIsExternalScopeString(
  scopeString: unknown,
): asserts scopeString is ExternalScopeString {
  if (
    typeof scopeString !== 'string' ||
    (!isCaipNamespace(scopeString) && !isCaipChainId(scopeString))
  ) {
    throw new Error('scopeString is not a valid ExternalScopeString');
  }
}

/**
 * Asserts that an object is a valid ExternalScopesObject.
 * @param obj - The object to assert.
 */
export function assertIsExternalScopesObject(
  obj: unknown,
): asserts obj is ExternalScopesObject {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Object is not an ExternalScopesObject');
  }

  for (const [scopeString, scopeObject] of Object.entries(obj)) {
    assertIsExternalScopeString(scopeString);
    assertIsExternalScopeObject(scopeObject);
  }
}
