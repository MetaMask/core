import type { Hex } from '@metamask/utils';

import { bucketScopesBySupport } from './filter';
import type { ExternalScopesObject, ScopesObject } from './scope';
import { flattenMergeScopes } from './transform';
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

export const validateAndFlattenScopes = (
  requiredScopes: ExternalScopesObject,
  optionalScopes: ExternalScopesObject,
): {
  flattenedRequiredScopes: ScopesObject;
  flattenedOptionalScopes: ScopesObject;
} => {
  const { validRequiredScopes, validOptionalScopes } = validateScopes(
    requiredScopes,
    optionalScopes,
  );

  const flattenedRequiredScopes = flattenMergeScopes(validRequiredScopes);
  const flattenedOptionalScopes = flattenMergeScopes(validOptionalScopes);

  return {
    flattenedRequiredScopes,
    flattenedOptionalScopes,
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
