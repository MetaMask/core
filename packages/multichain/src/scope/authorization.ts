import type { Hex, Json } from '@metamask/utils';

import { bucketScopesBySupport } from './filter';
import { normalizeAndMergeScopes } from './transform';
import type {
  ExternalScopesObject,
  ExternalScopeString,
  NormalizedScopesObject,
} from './types';
import { getValidScopes } from './validation';

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

export const bucketScopes = (
  scopes: NormalizedScopesObject,
  {
    isChainIdSupported,
    isChainIdSupportable,
  }: {
    isChainIdSupported: (chainId: Hex) => boolean;
    isChainIdSupportable: (chainId: Hex) => boolean;
  },
): {
  supportedScopes: NormalizedScopesObject;
  supportableScopes: NormalizedScopesObject;
  unsupportableScopes: NormalizedScopesObject;
} => {
  const { supportedScopes, unsupportedScopes: maybeSupportableScopes } =
    bucketScopesBySupport(scopes, {
      isChainIdSupported,
    });

  const {
    supportedScopes: supportableScopes,
    unsupportedScopes: unsupportableScopes,
  } = bucketScopesBySupport(maybeSupportableScopes, {
    isChainIdSupported: isChainIdSupportable,
  });

  return { supportedScopes, supportableScopes, unsupportableScopes };
};
