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
  /*
   * The atomic amount of the asset
   * @example "1000000000000000000"
   */
  amount: NumberStringSchema,
  /*
   * The normalized amount of the asset
   * @example "1.5"
   */
  normalizedAmount: optional(FloatStringSchema),
  asset: BridgeAssetV2Schema,
  // TODO remove string and fix usd in backend
  usd: optional(nullable(union([FloatStringSchema, string()]))),
  /*
   * The value of the asset in the currency, calculated based on usd value
   * @example "0.15"
   */
  valueInCurrency: optional(nullable(FloatStringSchema)),
});
export type AmountsAndAsset = Infer<typeof AmountsAndAssetSchema>;
