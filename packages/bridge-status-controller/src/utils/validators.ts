import { StatusTypes, BridgeAssetSchema } from '@metamask/bridge-controller';
import type { Infer } from '@metamask/superstruct';
import {
  string,
  boolean,
  number,
  optional,
  enums,
  union,
  type,
  assert,
  array,
  is,
} from '@metamask/superstruct';

const ChainIdSchema = number();

const EmptyObjectSchema = type({});

const SrcChainStatusSchema = type({
  chainId: ChainIdSchema,
  /**
   * The txHash of the transaction on the source chain.
   * This might be undefined for smart transactions (STX)
   */
  txHash: optional(string()),
  /**
   * The atomic amount of the token sent minus fees on the source chain
   */
  amount: optional(string()),
  token: optional(union([EmptyObjectSchema, BridgeAssetSchema])),
});

const DestChainStatusSchema = type({
  chainId: ChainIdSchema,
  txHash: optional(string()),
  /**
   * The atomic amount of the token received on the destination chain
   */
  amount: optional(string()),
  token: optional(union([EmptyObjectSchema, BridgeAssetSchema])),
});

const RefuelStatusResponseSchema = type({});

export const StatusResponseSchema = type({
  status: enums(Object.values(StatusTypes)),
  srcChain: SrcChainStatusSchema,
  destChain: optional(DestChainStatusSchema),
  bridge: optional(string()),
  isExpectedToken: optional(boolean()),
  isUnrecognizedRouterAddress: optional(boolean()),
  refuel: optional(RefuelStatusResponseSchema),
});

export const validateBridgeStatusResponse = (
  data: unknown,
): data is Infer<typeof StatusResponseSchema> => {
  assert(data, StatusResponseSchema);
  return true;
};

export enum IntentOrderStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export type IntentOrder = {
  id: string;
  status: IntentOrderStatus;
  txHash?: string;
  metadata: {
    txHashes?: string[] | string;
  };
};

export const IntentOrderResponseSchema = type({
  id: string(),
  status: enums(Object.values(IntentOrderStatus)),
  txHash: optional(string()),
  metadata: type({
    txHashes: optional(union([array(string()), string()])),
  }),
});

export const validateIntentOrderResponse = (
  data: unknown,
): data is Infer<typeof IntentOrderResponseSchema> => {
  return is(data, IntentOrderResponseSchema);
};
