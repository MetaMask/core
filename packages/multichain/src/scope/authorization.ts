import type { Json } from '@metamask/utils';

import { normalizeAndMergeScopes } from './transform';
import type {
  ExternalScopesObject,
  ExternalScopeString,
  InternalScopesObject,
} from './types';
import { validateScopes } from './validation';

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

export const validateAndNormalizeScopes = (
  requiredScopes: ExternalScopesObject,
  optionalScopes: ExternalScopesObject,
): {
  normalizedRequiredScopes: InternalScopesObject;
  normalizedOptionalScopes: InternalScopesObject;
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
