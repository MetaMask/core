import { JsonRpcError } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';

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
    throw new JsonRpcError(5100, 'Requested chains are not supported');
  }

  const allMethodsSupported = methods.every((method) =>
    isSupportedMethod(scopeString, method),
  );

  if (!allMethodsSupported) {
    // not sure which one of these to use
    // When provider evaluates requested methods to not be supported
    //   code = 5101
    //   message = "Requested methods are not supported"
    // When provider does not recognize one or more requested method(s)
    //   code = 5201
    //   message = "Unknown method(s) requested"

    throw new JsonRpcError(5101, 'Requested methods are not supported');
  }

  if (
    notifications &&
    !notifications.every((notification) =>
      isSupportedNotification(scopeString, notification),
    )
  ) {
    // not sure which one of these to use
    // When provider evaluates requested notifications to not be supported
    //   code = 5102
    //   message = "Requested notifications are not supported"
    // When provider does not recognize one or more requested notification(s)
    //   code = 5202
    //   message = "Unknown notification(s) requested"
    throw new JsonRpcError(5102, 'Requested notifications are not supported');
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
