import { type, enums, optional } from '@metamask/superstruct';

import { BridgeAssetSchema } from './bridge-asset';

export enum ActionTypes {
  BRIDGE = 'bridge',
  SWAP = 'swap',
  REFUEL = 'refuel',
}

export const StepSchema = type({
  action: enums(Object.values(ActionTypes)),
  srcAsset: optional(BridgeAssetSchema),
  destAsset: optional(BridgeAssetSchema),
});

export const RefuelDataSchema = StepSchema;
