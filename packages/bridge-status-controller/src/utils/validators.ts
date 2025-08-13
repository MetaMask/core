import { StatusTypes, BridgeAssetSchema } from '@metamask/bridge-controller';
import {
  object,
  string,
  boolean,
  number,
  optional,
  enums,
  union,
  type,
  assert,
  StructError,
} from '@metamask/superstruct';

const ChainIdSchema = number();

const EmptyObjectSchema = object({});

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

export const validateBridgeStatusResponse = (data: unknown) => {
  const validationFailures: { [path: string]: string } = {};
  try {
    assert(data, StatusResponseSchema);
  } catch (error) {
    if (error instanceof StructError) {
      error.failures().forEach(({ branch, path, message }) => {
        const pathString = path?.join('.') || 'unknown';
        validationFailures[pathString] =
          `[${branch?.[0]?.bridge || 'unknown'}] ${message}`;
      });
    }
    throw error;
  } finally {
    if (Object.keys(validationFailures).length > 0) {
      console.error(`Bridge status validation failed`, validationFailures);
    }
  }
};
