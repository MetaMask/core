import type { CaipAccountId, CaipChainId, Hex } from '@metamask/utils';

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
 *
 * @param scopes - The NormalizedScopesObject to group.
 * @param hooks - An object containing the following properties:
 * @param hooks.isEvmChainIdSupported - A predicate that determines if an EVM chainID is supported.
 * @param hooks.isNonEvmScopeSupported - A predicate that determines if an non EVM scopeString is supported.
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 * @returns The supported and unsupported scopes.
 */
export const bucketScopesBySupport = (
  scopes: NormalizedScopesObject,
  {
    isEvmChainIdSupported,
    isNonEvmScopeSupported,
    getNonEvmSupportedMethods,
  }: {
    isEvmChainIdSupported: (chainId: Hex) => boolean;
    isNonEvmScopeSupported: (scope: CaipChainId) => boolean;
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
  },
) => {
  const supportedScopes: NormalizedScopesObject = {};
  const unsupportedScopes: NormalizedScopesObject = {};

  for (const [scopeString, scopeObject] of Object.entries(scopes)) {
    assertIsInternalScopeString(scopeString);
    try {
      assertScopeSupported(scopeString, scopeObject, {
        isEvmChainIdSupported,
        isNonEvmScopeSupported,
        getNonEvmSupportedMethods,
      });
      supportedScopes[scopeString] = scopeObject;
    } catch {
      unsupportedScopes[scopeString] = scopeObject;
    }
  }

  return { supportedScopes, unsupportedScopes };
};

/**
 * Returns a NormalizedScopeObject with
 * unsupported methods and notifications removed.
 *
 * @param scopeString - The InternalScopeString for the scopeObject.
 * @param scopeObject - The NormalizedScopeObject to filter.
 * @param hooks - An object containing the following properties:
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 * @returns a NormalizedScopeObject with only methods and notifications that are currently supported.
 */
const getSupportedScopeObject = (
  scopeString: InternalScopeString,
  scopeObject: NormalizedScopeObject,
  {
    getNonEvmSupportedMethods,
  }: {
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
  },
) => {
  const { methods, notifications } = scopeObject;

  const supportedMethods = methods.filter((method) =>
    isSupportedMethod(scopeString, method, { getNonEvmSupportedMethods }),
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
 *
 * @param scopes - The NormalizedScopesObject to filter.
 * @param hooks - An object containing the following properties:
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 * @returns a NormalizedScopesObject with only methods, and notifications that are currently supported.
 */
export const getSupportedScopeObjects = (
  scopes: NormalizedScopesObject,
  {
    getNonEvmSupportedMethods,
  }: {
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
  },
) => {
  const filteredScopesObject: NormalizedScopesObject = {};

  for (const [scopeString, scopeObject] of Object.entries(scopes)) {
    assertIsInternalScopeString(scopeString);
    filteredScopesObject[scopeString] = getSupportedScopeObject(
      scopeString,
      scopeObject,
      { getNonEvmSupportedMethods },
    );
  }

  return filteredScopesObject;
};
