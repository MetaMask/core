import {
  type CaipChainId,
  hasProperty,
  isCaipAccountId,
  isCaipChainId,
  isCaipNamespace,
  isCaipReference,
  KnownCaipNamespace,
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
  InternalScopeString,
  NormalizedScopeObject,
  NormalizedScopesObject,
} from './types';

/**
 * Asserts that a scope string and its associated scope object are supported.
 * @param scopeString - The scope string against which to assert support.
 * @param scopeObject - The scope object against which to assert support.
 * @param hooks - An object containing the following properties:
 * @param hooks.isEvmChainIdSupported - A predicate that determines if an EVM chainID is supported.
 * @param hooks.isNonEvmScopeSupported - A predicate that determines if an non EVM scopeString is supported.
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 */
export const assertScopeSupported = (
  scopeString: string,
  scopeObject: NormalizedScopeObject,
  {
    isEvmChainIdSupported,
    isNonEvmScopeSupported,
    getNonEvmSupportedMethods
  }
  : {
    isEvmChainIdSupported: (chainId: Hex) => boolean,
    isNonEvmScopeSupported: (scope: CaipChainId) => boolean,
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[]

  },
) => {
  const { methods, notifications } = scopeObject;
  if (!isSupportedScopeString(scopeString, {isEvmChainIdSupported, isNonEvmScopeSupported} )) {
    throw Caip25Errors.requestedChainsNotSupportedError();
  }

  const allMethodsSupported = methods.every((method) =>
    isSupportedMethod(scopeString, method, {getNonEvmSupportedMethods}),
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
 * @param hooks - An object containing the following properties:
 * @param hooks.isEvmChainIdSupported - A predicate that determines if an EVM chainID is supported.
 * @param hooks.isNonEvmScopeSupported - A predicate that determines if an non EVM scopeString is supported.
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 */
export const assertScopesSupported = (
  scopes: NormalizedScopesObject,
  {
    isEvmChainIdSupported,
    isNonEvmScopeSupported,
    getNonEvmSupportedMethods
  }
  : {
    isEvmChainIdSupported: (chainId: Hex) => boolean,
        isNonEvmScopeSupported: (scope: CaipChainId) => boolean,
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[]
  },
) => {
  for (const [scopeString, scopeObject] of Object.entries(scopes)) {
    assertScopeSupported(scopeString, scopeObject, {
      isEvmChainIdSupported,
      isNonEvmScopeSupported,
      getNonEvmSupportedMethods,
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
    throw new Error('ExternalScopesObject must be an object');
  }

  for (const [scopeString, scopeObject] of Object.entries(obj)) {
    assertIsExternalScopeString(scopeString);
    assertIsExternalScopeObject(scopeObject);
  }
}

/**
 * Asserts that an object is a valid InternalScopeObject.
 * @param obj - The object to assert.
 */
function assertIsInternalScopeObject(
  obj: unknown,
): asserts obj is InternalScopeObject {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('InternalScopeObject must be an object');
  }

  if (
    !hasProperty(obj, 'accounts') ||
    !Array.isArray(obj.accounts) ||
    !obj.accounts.every(isCaipAccountId)
  ) {
    throw new Error(
      'InternalScopeObject.accounts must be an array of CaipAccountId',
    );
  }
}

/**
 * Asserts that a scope string is a valid InternalScopeString.
 * @param scopeString - The scope string to assert.
 */
export function assertIsInternalScopeString(
  scopeString: unknown,
): asserts scopeString is InternalScopeString {
  if (
    typeof scopeString !== 'string' ||
    (scopeString !== KnownCaipNamespace.Wallet && !isCaipChainId(scopeString))
  ) {
    throw new Error('scopeString is not a valid InternalScopeString');
  }
}

/**
 * Asserts that an object is a valid InternalScopesObject.
 * @param obj - The object to assert.
 */
export function assertIsInternalScopesObject(
  obj: unknown,
): asserts obj is InternalScopesObject {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('InternalScopesObject must be an object');
  }

  for (const [scopeString, scopeObject] of Object.entries(obj)) {
    assertIsInternalScopeString(scopeString);
    assertIsInternalScopeObject(scopeObject);
  }
}
