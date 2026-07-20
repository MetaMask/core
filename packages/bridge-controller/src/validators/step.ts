import { type, enums, optional, pick } from '@metamask/superstruct';

import { AmountsAndAssetSchema } from './amount-and-asset';
import { BridgeAssetSchema, ChainIdSchema } from './bridge-asset';

export enum ActionTypes {
  BRIDGE = 'bridge',
  SWAP = 'swap',
  REFUEL = 'refuel',
}

export const StepSchema = type({
  action: enums(Object.values(ActionTypes)),
  srcChainId: ChainIdSchema,
  destChainId: optional(ChainIdSchema),
  srcAsset: optional(BridgeAssetSchema),
  destAsset: optional(BridgeAssetSchema),
});

export const RefuelDataSchema = StepSchema;

export const StepSchemaV2 = type({
  action: enums(Object.values(ActionTypes)),
  src: pick(AmountsAndAssetSchema, ['asset']),
  dest: pick(AmountsAndAssetSchema, ['asset']),
});
