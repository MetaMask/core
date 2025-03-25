import {
  string,
  boolean,
  number,
  type,
  is,
  optional,
  enums,
} from '@metamask/superstruct';

import { type StatusResponse } from '../types';

export const validateStatusResponse = (
  data: unknown,
): data is StatusResponse => {
  if (!data) {
    return false;
  }

  const TokenSchema = type({
    chainId: optional(number()),
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
    chainId: number(),
    txHash: string(),
    amount: optional(string()),
    token: optional(TokenSchema),
  });

  const DestChainStatusSchema = type({
    chainId: string(),
    txHash: optional(string()),
    amount: optional(string()),
    token: optional(TokenSchema),
  });

  const RefuelStatusResponseSchema = type({
    status: string(),
    txHash: optional(string()),
    amount: optional(string()),
    token: optional(TokenSchema),
  });

  const StatusResponseSchema = type({
    status: string(),
    bridge: optional(string()),
    srcChain: SrcChainSchema,
    destChain: DestChainStatusSchema,
    isExpectedToken: optional(boolean()),
    isUnrecognizedRouterAddress: optional(boolean()),
    refuel: optional(RefuelStatusResponseSchema),
  });

  return is(data, StatusResponseSchema);
};
