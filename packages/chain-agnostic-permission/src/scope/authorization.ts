import type { CaipChainId, CaipNamespace, Hex, Json } from '@metamask/utils';

import { bucketScopesBySupport } from './filter';
import { normalizeAndMergeScopes } from './transform';
import type {
  ExternalScopesObject,
  ExternalScopeString,
  NormalizedScopesObject,
} from './types';
import { getValidScopes } from './validation';
import { parseScopeString } from './types';
/**
 * Represents the parameters of a [CAIP-25](https://chainagnostic.org/CAIPs/caip-25) request.
 */
export type Caip25Authorization = (
  | {
      requiredScopes: ExternalScopesObject;
      optionalScopes?: ExternalScopesObject;
    }
  | {
      requiredScopes?: ExternalScopesObject;
      optionalScopes: ExternalScopesObject;
    }
) & {
  sessionProperties?: Record<string, Json>;
  scopedProperties?: Record<ExternalScopeString, Json>;
};

/**
 * Validates and normalizes a set of scopes according to the [CAIP-217](https://chainagnostic.org/CAIPs/caip-217) spec.
 *
 * @param requiredScopes - The required scopes to validate and normalize.
 * @param optionalScopes - The optional scopes to validate and normalize.
 * @returns An object containing the normalized required scopes and normalized optional scopes.
 */
export const validateAndNormalizeScopes = (
  requiredScopes: ExternalScopesObject,
  optionalScopes: ExternalScopesObject,
): {
  normalizedRequiredScopes: NormalizedScopesObject;
  normalizedOptionalScopes: NormalizedScopesObject;
} => {
  const { validRequiredScopes, validOptionalScopes } = getValidScopes(
    requiredScopes,
    optionalScopes,
  );

  const normalizedRequiredScopes = normalizeAndMergeScopes(validRequiredScopes);
  const normalizedOptionalScopes = normalizeAndMergeScopes(validOptionalScopes);

  return {
    normalizedRequiredScopes,
    normalizedOptionalScopes,
  };
};

/**
 * Groups a NormalizedScopesObject into three separate
 * NormalizedScopesObjects for supported scopes,
 * supportable scopes, and unsupportable scopes.
 *
 * @param scopes - The NormalizedScopesObject to group.
 * @param hooks - The hooks.
 * @param hooks.isEvmChainIdSupported - A helper that returns true if an eth chainId is currently supported by the wallet.
 * @param hooks.isEvmChainIdSupportable - A helper that returns true if an eth chainId could be supported by the wallet.
 * @param hooks.isNonEvmScopeSupported - A predicate that determines if an non EVM scopeString is supported.
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 * @returns an object with three NormalizedScopesObjects separated by support.
 */
export const bucketScopes = (
  scopes: NormalizedScopesObject,
  {
    isEvmChainIdSupported,
    isEvmChainIdSupportable,
    isNonEvmScopeSupported,
    getNonEvmSupportedMethods,
  }: {
    isEvmChainIdSupported: (chainId: Hex) => boolean;
    isEvmChainIdSupportable: (chainId: Hex) => boolean;
    isNonEvmScopeSupported: (scope: CaipChainId) => boolean;
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
  },
): {
  supportedScopes: NormalizedScopesObject;
  supportableScopes: NormalizedScopesObject;
  unsupportableScopes: NormalizedScopesObject;
} => {
  const { supportedScopes, unsupportedScopes: maybeSupportableScopes } =
    bucketScopesBySupport(scopes, {
      isEvmChainIdSupported,
      isNonEvmScopeSupported,
      getNonEvmSupportedMethods,
    });

  const {
    supportedScopes: supportableScopes,
    unsupportedScopes: unsupportableScopes,
  } = bucketScopesBySupport(maybeSupportableScopes, {
    isEvmChainIdSupported: isEvmChainIdSupportable,
    isNonEvmScopeSupported,
    getNonEvmSupportedMethods,
  });

  return { supportedScopes, supportableScopes, unsupportableScopes };
};

/**
 * Checks if a given CAIP namespace is present in a NormalizedScopesObject.
 *
 * @param scopesObject - The NormalizedScopesObject to check.
 * @param caipNamespace - The CAIP namespace to check for.
 * @returns true if the CAIP namespace is present in the NormalizedScopesObject, false otherwise.
 */
export function isNamespaceInScopesObject(
  scopesObject: NormalizedScopesObject,
  caipNamespace: CaipNamespace,
) {
  return Object.keys(scopesObject).some((scope) => {
    const { namespace } = parseScopeString(scope);
    return namespace === caipNamespace;
  });
}
