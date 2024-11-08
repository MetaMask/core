import type { Hex } from '@metamask/utils';

import { Caip25Errors } from './errors';
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