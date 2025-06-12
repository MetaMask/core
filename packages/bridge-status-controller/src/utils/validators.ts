import { StatusTypes } from '@metamask/bridge-controller';
import {
  object,
  string,
  boolean,
  number,
  optional,
  enums,
  union,
  type,
  nullable,
  assert,
  StructError,
} from '@metamask/superstruct';

export const validateBridgeStatusResponse = (data: unknown) => {
  const ChainIdSchema = union([number(), string()]);

  const AssetSchema = type({
    chainId: ChainIdSchema,
    address: string(),
    symbol: string(),
    name: string(),
    decimals: number(),
    icon: optional(nullable(string())),
  });

  const EmptyObjectSchema = object({});

  const SrcChainStatusSchema = type({
    chainId: ChainIdSchema,
    txHash: optional(string()),
    amount: optional(string()),
    token: optional(union([EmptyObjectSchema, AssetSchema])),
  });

  const DestChainStatusSchema = type({
    chainId: ChainIdSchema,
    txHash: optional(string()),
    amount: optional(string()),
    token: optional(union([EmptyObjectSchema, AssetSchema])),
  });

  const RefuelStatusResponseSchema = object();

  const StatusResponseSchema = type({
    status: enums(Object.values(StatusTypes)),
    srcChain: SrcChainStatusSchema,
    destChain: optional(DestChainStatusSchema),
    bridge: optional(string()),
    isExpectedToken: optional(boolean()),
    isUnrecognizedRouterAddress: optional(boolean()),
    refuel: optional(RefuelStatusResponseSchema),
  });

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
