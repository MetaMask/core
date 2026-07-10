import { type, string, enums, assert } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

export enum TokenFeatureType {
  MALICIOUS = 'Malicious',
  WARNING = 'Warning',
  INFO = 'Info',
  BENIGN = 'Benign',
}

export const TokenFeatureSchema = type({
  feature_id: string(),
  type: enums(Object.values(TokenFeatureType)),
  description: string(),
});

export const validateTokenFeature = (
  data: unknown,
): data is Infer<typeof TokenFeatureSchema> => {
  assert(data, TokenFeatureSchema);
  return true;
};
