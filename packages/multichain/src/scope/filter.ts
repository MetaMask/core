import { CaipChainId, type Hex } from '@metamask/utils';

import { assertIsInternalScopeString, assertScopeSupported } from './assert';
import { isSupportedMethod, isSupportedNotification } from './supported';
import type {
  InternalScopeString,
  NormalizedScopeObject,
  NormalizedScopesObject,
} from './types';

/**
 * Groups a NormalizedScopesObject into two separate
 * NormalizedScopesObject with supported scopes in one
 * and unsupported scopes in the other.
 * @param scopes - The NormalizedScopesObject to group.
 * @param hooks - An object containing the following properties:
 * @param hooks.isEvmChainIdSupported - A predicate that determines if an EVM chainID is supported.
 * @param hooks.isNonEvmScopeSupported - A predicate that determines if an non EVM scopeString is supported.
 */
export const bucketScopesBySupport = (
  scopes: NormalizedScopesObject,
  {
    isEvmChainIdSupported,
    isNonEvmScopeSupported
  }
  : {
    isEvmChainIdSupported: (chainId: Hex) => boolean,
        isNonEvmScopeSupported: (scope: CaipChainId) => boolean,
  },
) => {
  const supportedScopes: NormalizedScopesObject = {};
  const unsupportedScopes: NormalizedScopesObject = {};

  for (const [scopeString, scopeObject] of Object.entries(scopes)) {
    assertIsInternalScopeString(scopeString);
    try {
      assertScopeSupported(scopeString, scopeObject, {
        isEvmChainIdSupported,
        isNonEvmScopeSupported
      });
      supportedScopes[scopeString] = scopeObject;
    } catch (err) {
      unsupportedScopes[scopeString] = scopeObject;
    }
  }

  return { supportedScopes, unsupportedScopes };
};

/**
 * Returns a NormalizedScopeObject with
 * unsupported methods and notifications removed.
 * @param scopeString - The InternalScopeString for the scopeObject.
 * @param scopeObject - The NormalizedScopeObject to filter.
 * @returns a NormalizedScopeObject with only methods and notifications that are currently supported.
 */
const getSupportedScopeObject = (
  scopeString: InternalScopeString,
  scopeObject: NormalizedScopeObject,
) => {
  const { methods, notifications } = scopeObject;

  const supportedMethods = methods.filter((method) =>
    isSupportedMethod(scopeString, method),
  );

  const supportedNotifications = notifications.filter((notification) =>
    isSupportedNotification(scopeString, notification),
  );

  return {
    ...scopeObject,
    methods: supportedMethods,
    notifications: supportedNotifications,
  };
};

/**
 * Returns a NormalizedScopesObject with
 * unsupported methods and notifications removed from scopeObjects.
 * @param scopes - The NormalizedScopesObject to filter.
 * @returns a NormalizedScopesObject with only methods, and notifications that are currently supported.
 */
export const getSupportedScopeObjects = (scopes: NormalizedScopesObject) => {
  const filteredScopesObject: NormalizedScopesObject = {};

  for (const [scopeString, scopeObject] of Object.entries(scopes)) {
    assertIsInternalScopeString(scopeString);
    filteredScopesObject[scopeString] = getSupportedScopeObject(
      scopeString,
      scopeObject,
    );
  }

  return filteredScopesObject;
};
