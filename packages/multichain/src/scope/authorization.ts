import type { Hex } from '@metamask/utils';

import { bucketScopesBySupport } from './filter';
import { normalizeAndMergeScopes } from './transform';
import type { ExternalScopesObject, ScopesObject } from './types';
import { validateScopes } from './validation';

export type Caip25Authorization =
  | {
      requiredScopes: ExternalScopesObject;
      optionalScopes?: ExternalScopesObject;
      sessionProperties?: Record<string, unknown>;
    }
  | ({
      requiredScopes?: ExternalScopesObject;
      optionalScopes: ExternalScopesObject;
    } & {
      sessionProperties?: Record<string, unknown>;
    });

export const validateAndNormalizeScopes = (
  requiredScopes: ExternalScopesObject,
  optionalScopes: ExternalScopesObject,
): {
  normalizedRequiredScopes: ScopesObject;
  normalizedOptionalScopes: ScopesObject;
} => {
  const { validRequiredScopes, validOptionalScopes } = validateScopes(
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
  scopes: ScopesObject,
  {
    isChainIdSupported,
    isChainIdSupportable,
  }: {
    isChainIdSupported: (chainId: Hex) => boolean;
    isChainIdSupportable: (chainId: Hex) => boolean;
  },
): {
  supportedScopes: ScopesObject;
  supportableScopes: ScopesObject;
  unsupportableScopes: ScopesObject;
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
