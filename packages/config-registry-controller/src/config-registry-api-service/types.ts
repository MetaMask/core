import type { Infer } from '@metamask/superstruct';
import {
  array,
  assert,
  boolean,
  number,
  optional,
  string,
  type,
} from '@metamask/superstruct';

const AssetSchema = type({
  assetId: string(),
  imageUrl: string(),
  name: string(),
  symbol: string(),
  decimals: number(),
  coingeckoCoinId: string(),
});

const AssetsSchema = type({
  listUrl: string(),
  native: AssetSchema,
  governance: optional(AssetSchema),
});

const RpcProviderSchema = type({
  url: string(),
  type: string(),
  networkClientId: string(),
});

const RpcProvidersSchema = type({
  default: RpcProviderSchema,
  fallbacks: array(string()),
});

const BlockExplorerUrlsSchema = type({
  default: string(),
  fallbacks: array(string()),
});

const ChainConfigSchema = type({
  isActive: boolean(),
  isTestnet: boolean(),
  isDefault: boolean(),
  isFeatured: boolean(),
  isDeprecated: boolean(),
  isDeletable: boolean(),
  priority: number(),
});

/**
 * Schema for a single chain in the CAIP-2 config registry API response.
 * chainId is in CAIP-2 format (e.g. "eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp").
 */
export const RegistryNetworkConfigSchema = type({
  chainId: string(),
  name: string(),
  imageUrl: string(),
  coingeckoPlatformId: string(),
  geckoTerminalPlatformId: optional(string()),
  assets: AssetsSchema,
  rpcProviders: RpcProvidersSchema,
  blockExplorerUrls: BlockExplorerUrlsSchema,
  config: ChainConfigSchema,
});

/**
 * Top-level API response shape. Uses `data.chains` (CAIP-2) and `data.version`.
 */
export const RegistryConfigApiResponseSchema = type({
  data: type({
    version: string(),
    timestamp: number(),
    chains: array(RegistryNetworkConfigSchema),
  }),
});

export type RegistryNetworkConfig = Infer<typeof RegistryNetworkConfigSchema>;

export type RegistryConfigApiResponse = Infer<
  typeof RegistryConfigApiResponseSchema
>;

export function validateRegistryConfigApiResponse(
  data: unknown,
): asserts data is RegistryConfigApiResponse {
  assert(data, RegistryConfigApiResponseSchema);
}

export type FetchConfigOptions = {
  etag?: string;
};

export type FetchConfigResult =
  | {
      modified: false;
      etag?: string;
      /**
       * Cached data from the service when available (e.g. after a previous
       * successful fetch). Omitted when the service has no cache yet.
       */
      data?: RegistryConfigApiResponse;
    }
  | {
      modified: true;
      data: RegistryConfigApiResponse;
      etag?: string;
    };
