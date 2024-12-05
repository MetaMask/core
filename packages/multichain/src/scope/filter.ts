import type { CaipChainId, Hex } from '@metamask/utils';

import { assertScopeSupported } from './assert';
import type { NormalizedScopesObject } from './types';

/**
 * Groups a NormalizedScopesObject into two separate
 * NormalizedScopesObject with supported scopes in one
 * and unsupported scopes in the other.
 * @param scopes - The NormalizedScopesObject to group.
 * @param hooks - The hooks.
 * @param hooks.isChainIdSupported - A helper that returns true if an eth chainId is currently supported by the wallet.
 * @returns an object with two NormalizedScopesObjects separated by support.
 */
export const bucketScopesBySupport = (
  scopes: NormalizedScopesObject,
  {
    isChainIdSupported,
  }: {
    isChainIdSupported: (chainId: Hex) => boolean;
  },
) => {
  const supportedScopes: NormalizedScopesObject = {};
  const unsupportedScopes: NormalizedScopesObject = {};

  for (const [scopeString, scopeObject] of Object.entries(scopes)) {
    try {
      assertScopeSupported(scopeString, scopeObject, {
        isChainIdSupported,
      });
      supportedScopes[scopeString as CaipChainId] = scopeObject;
    } catch (err) {
      unsupportedScopes[scopeString as CaipChainId] = scopeObject;
    }
  }

  return { supportedScopes, unsupportedScopes };
};

/**
 * Returns a NormalizedScopesObject with only
 * scopes that are supported.
 * @param scopes - The NormalizedScopesObject to convert.
 * @param hooks - The hooks.
 * @param hooks.isChainIdSupported - A helper that returns true if an eth chainId is currently supported by the wallet.
 * @returns a NormalizedScopesObject with only scopes that are currently supported.
 */
export const filterScopesSupported = (
  scopes: NormalizedScopesObject,
  {
    isChainIdSupported,
  }: {
    isChainIdSupported: (chainId: Hex) => boolean;
  },
) => {
  const { supportedScopes } = bucketScopesBySupport(scopes, {
    isChainIdSupported,
  });

  return supportedScopes;
};
