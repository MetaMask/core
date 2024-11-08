import type { Hex } from '@metamask/utils';

import {
  REQUESTED_CHAINS_NOT_SUPPORTED_ERROR,
  REQUESTED_METHODS_NOT_SUPPORTED_ERROR,
  REQUESTED_NOTIFICATIONS_NOT_SUPPORTED_ERROR,
} from './errors';
import {
  isSupportedMethod,
  isSupportedNotification,
  isSupportedScopeString,
} from './supported';
import type { InternalScopeObject, InternalScopesObject } from './types';

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
    throw REQUESTED_CHAINS_NOT_SUPPORTED_ERROR;
  }

  const allMethodsSupported = methods.every((method) =>
    isSupportedMethod(scopeString, method),
  );

  if (!allMethodsSupported) {
    throw REQUESTED_METHODS_NOT_SUPPORTED_ERROR;
  }

  if (
    notifications &&
    !notifications.every((notification) =>
      isSupportedNotification(scopeString, notification),
    )
  ) {
    throw REQUESTED_NOTIFICATIONS_NOT_SUPPORTED_ERROR;
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
