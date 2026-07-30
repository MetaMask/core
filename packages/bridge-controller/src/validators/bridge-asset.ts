import {
  number,
  type,
  string,
  optional,
  nullable,
  is,
  intersection,
  enums,
  array,
  boolean,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { CaipAssetTypeStruct } from '@metamask/utils';

export const ChainIdSchema = number();

export const MinimalAssetSchema = type({
  /**
   * Case-sensitive for non-EVM chains, case-insensitive for EVM chains
   */
  assetId: CaipAssetTypeStruct,
  /**
   * The symbol of token object
   */
  symbol: string(),
  /**
   * The name for the network
   */
  name: string(),
  decimals: number(),
});

export type MinimalAsset = Infer<typeof MinimalAssetSchema>;

export enum BridgeAssetSecurityDataType {
  INFO = 'Info',
  BENIGN = 'Benign',
  VERIFIED = 'Verified',
  WARNING = 'Warning',
  SPAM = 'Spam',
  MALICIOUS = 'Malicious',
}

const BridgeAssetSecurityData = type({
  isVerified: optional(boolean()),
  securityData: optional(
    type({
      type: enums(Object.values(BridgeAssetSecurityDataType)),
      metadata: optional(
        type({
          features: array(
            type({
              featureId: string(),
              type: enums(Object.values(BridgeAssetSecurityDataType)),
              description: string(),
            }),
          ),
        }),
      ),
    }),
  ),
});

export const BridgeAssetV2Schema = intersection([
  MinimalAssetSchema,
  BridgeAssetSecurityData,
  type({
    /**
     * URL for token icon
     */
    iconUrl: nullable(optional(string())),
    noFee: optional(
      type({
        isDestination: nullable(optional(boolean())),
        isSource: nullable(optional(boolean())),
      }),
    ),
  }),
]);
export type BridgeAssetV2 = Infer<typeof BridgeAssetV2Schema>;

export const BridgeAssetSchema = type({
  /**
   * The chainId of the token
   */
  chainId: ChainIdSchema,
  /**
   * An address that the metaswap-api recognizes as the default token
   */
  address: string(),
  /**
   * The assetId of the token
   */
  assetId: CaipAssetTypeStruct,
  /**
   * The symbol of token object
   */
  symbol: string(),
  /**
   * The name for the network
   */
  name: string(),
  decimals: number(),
  /**
   * URL for token icon
   */
  icon: optional(nullable(string())),
  /**
   * URL for token icon
   */
  iconUrl: optional(nullable(string())),
});

/**
 * This is the interface for the asset object returned by the bridge-api
 * This type is used in the QuoteResponse and in the fetchBridgeTokens response
 *
 * @deprecated Avoid introducing new code that uses this function. Use BridgeAssetV2 instead
 */
export type BridgeAsset = Infer<typeof BridgeAssetSchema>;

/**
 * Validates a token object from the bridge-api
 *
 * @deprecated Avoid introducing new code that uses this function. Use BridgeAssetV2 instead
 *
 * @param data - The data to validate
 * @returns Whether the data satisfies the {@link BridgeAssetSchema}
 */
export const validateBridgeAsset = (
  data: unknown,
): data is Infer<typeof BridgeAssetSchema> => {
  return is(data, BridgeAssetSchema);
};

/* istanbul ignore next */
export const validateBridgeAssetV2 = (
  data: unknown,
): data is Infer<typeof BridgeAssetV2Schema> => {
  return is(data, BridgeAssetV2Schema);
};
