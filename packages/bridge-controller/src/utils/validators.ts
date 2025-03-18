import { isValidHexAddress } from '@metamask/controller-utils';
import {
  string,
  boolean,
  number,
  type,
  is,
  record,
  array,
  nullable,
  optional,
  enums,
  define,
  union,
} from '@metamask/superstruct';
import { isStrictHexString } from '@metamask/utils';

import type { BridgeAsset, FeatureFlagResponse, QuoteResponse } from '../types';
import { ActionTypes, BridgeFlag, FeeType } from '../types';

const HexAddressSchema = define('HexAddress', (v: unknown) =>
  isValidHexAddress(v as string, { allowNonPrefixed: false }),
);

const HexStringSchema = define('HexString', (v: unknown) =>
  isStrictHexString(v as string),
);

export const truthyString = (s: string) => Boolean(s?.length);
const TruthyDigitStringSchema = define(
  'TruthyDigitString',
  (v: unknown) =>
    truthyString(v as string) && Boolean((v as string).match(/^\d+$/u)),
);

const ChainIdSchema = number();

const BridgeAssetSchema = type({
  chainId: ChainIdSchema,
  address: string(),
  assetId: string(),
  symbol: string(),
  name: string(),
  decimals: number(),
  icon: optional(string()),
  iconUrl: optional(string()),
});

export const validateFeatureFlagsResponse = (
  data: unknown,
): data is FeatureFlagResponse => {
  const ChainConfigurationSchema = type({
    isActiveSrc: boolean(),
    isActiveDest: boolean(),
  });

  const ConfigSchema = type({
    refreshRate: number(),
    maxRefreshCount: number(),
    support: boolean(),
    chains: record(string(), ChainConfigurationSchema),
  });

  // Create schema for FeatureFlagResponse
  const FeatureFlagResponseSchema = type({
    [BridgeFlag.EXTENSION_CONFIG]: ConfigSchema,
    [BridgeFlag.MOBILE_CONFIG]: ConfigSchema,
  });

  return is(data, FeatureFlagResponseSchema);
};

export const validateSwapsTokenObject = (
  data: unknown,
): data is BridgeAsset => {
  return is(data, BridgeAssetSchema);
};

export const validateQuoteResponse = (data: unknown): data is QuoteResponse => {
  const FeeDataSchema = type({
    amount: TruthyDigitStringSchema,
    asset: BridgeAssetSchema,
  });

  const ProtocolSchema = type({
    name: string(),
    displayName: optional(string()),
    icon: optional(string()),
  });

  const StepSchema = type({
    action: enums(Object.values(ActionTypes)),
    srcChainId: ChainIdSchema,
    destChainId: optional(ChainIdSchema),
    srcAsset: BridgeAssetSchema,
    destAsset: BridgeAssetSchema,
    srcAmount: string(),
    destAmount: string(),
    protocol: ProtocolSchema,
  });

  const RefuelDataSchema = StepSchema;

  const QuoteSchema = type({
    requestId: string(),
    srcChainId: ChainIdSchema,
    srcAsset: BridgeAssetSchema,
    srcTokenAmount: string(),
    destChainId: ChainIdSchema,
    destAsset: BridgeAssetSchema,
    destTokenAmount: string(),
    feeData: record(enums(Object.values(FeeType)), FeeDataSchema),
    bridgeId: string(),
    bridges: array(string()),
    steps: array(StepSchema),
    refuel: optional(RefuelDataSchema),
  });

  const TxDataSchema = type({
    chainId: number(),
    to: HexAddressSchema,
    from: HexAddressSchema,
    value: HexStringSchema,
    data: HexStringSchema,
    gasLimit: nullable(number()),
  });

  const QuoteResponseSchema = type({
    quote: QuoteSchema,
    approval: optional(TxDataSchema),
    trade: union([TxDataSchema, string()]),
    estimatedProcessingTimeInSeconds: number(),
  });

  return is(data, QuoteResponseSchema);
};
