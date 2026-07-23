import { type, enums, optional } from '@metamask/superstruct';

import { BridgeAssetSchema, ChainIdSchema } from './bridge-asset.js';

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
