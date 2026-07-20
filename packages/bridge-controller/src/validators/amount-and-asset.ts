import {
  type,
  optional,
  nullable,
  union,
  string,
  Infer,
} from '@metamask/superstruct';

import { BridgeAssetV2Schema } from './bridge-asset';
import { NumberStringSchema, FloatStringSchema } from './number';

export const AmountsAndAssetSchema = type({
  amount: NumberStringSchema,
  normalizedAmount: optional(FloatStringSchema),
  asset: BridgeAssetV2Schema,
  // TODO remove string and fix usd in backend
  usd: optional(nullable(union([FloatStringSchema, string()]))),
  valueInCurrency: optional(nullable(FloatStringSchema)),
});
export type AmountsAndAsset = Infer<typeof AmountsAndAssetSchema>;
