import {
  string,
  boolean,
  number,
  type,
  is,
  optional,
  union,
  object,
  enums,
} from '@metamask/superstruct';

import { BridgeId, type StatusResponse } from '../types';

const EmptyObjectSchema = object({});

export const validateStatusResponse = (
  data: unknown,
): data is StatusResponse => {
  if (!data) {
    return false;
  }

  const ChainIdSchema = union([number(), string()]);

  const TokenSchema = type({
    chainId: optional(ChainIdSchema),
    address: optional(string()),
    symbol: optional(string()),
    name: optional(string()),
    decimals: optional(number()),
    coinKey: optional(string()),
    logoURI: optional(string()),
    icon: optional(string()),
    priceUSD: optional(string()),
  });

  const SrcChainSchema = type({
    chainId: ChainIdSchema,
    txHash: optional(string()),
    amount: optional(string()),
    token: optional(union([EmptyObjectSchema, TokenSchema])),
  });

  const DestChainStatusSchema = type({
    chainId: ChainIdSchema,
    txHash: optional(string()),
    amount: optional(string()),
    token: optional(union([EmptyObjectSchema, TokenSchema])),
  });

  const RefuelStatusResponseSchema = type({
    status: string(),
    bridge: optional(string()),
    srcChain: SrcChainSchema,
    destChain: optional(DestChainStatusSchema),
    isExpectedToken: optional(boolean()),
    isUnrecognizedRouterAddress: optional(boolean()),
  });

  const StatusResponseSchema = type({
    status: string(),
    srcChain: SrcChainSchema,
    destChain: optional(DestChainStatusSchema),
    bridge: optional(enums(Object.values(BridgeId))),
    isExpectedToken: optional(boolean()),
    isUnrecognizedRouterAddress: optional(boolean()),
    refuel: optional(RefuelStatusResponseSchema),
  });

  return is(data, StatusResponseSchema);
};
