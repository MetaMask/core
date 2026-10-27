import type { Infer, Struct } from '@metamask/superstruct';
import {
  array,
  boolean,
  literal,
  nullable,
  number,
  optional,
  record,
  string,
  type,
  union,
} from '@metamask/superstruct';
import { CaipChainIdStruct, StrictHexStruct } from '@metamask/utils';

const AssetSchema = type({
  assetId: string(),
  imageUrl: string(),
  name: string(),
  symbol: string(),
  decimals: number(),
  coingeckoCoinId: optional(string()),
});

const AssetsSchema = type({
  listUrl: optional(string()),
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
  isAutoEnabled: optional(boolean()),
  priority: number(),
});

const NetworkContractsSchema = type({
  multicall3: optional(StrictHexStruct),
});

/**
 * Schema for a single chain in the CAIP-2 config registry API response.
 * chainId is in CAIP-2 format (e.g. "eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp").
 */
export const RegistryNetworkConfigSchema = type({
  chainId: CaipChainIdStruct,
  name: string(),
  imageUrl: string(),
  coingeckoPlatformId: string(),
  geckoTerminalPlatformId: optional(string()),
  assets: AssetsSchema,
  rpcProviders: RpcProvidersSchema,
  blockExplorerUrls: BlockExplorerUrlsSchema,
  config: ChainConfigSchema,
  contracts: optional(NetworkContractsSchema),
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

/**
 * Schema for the events-config API response.
 * Maps event names to their allowed analytics purposes.
 */
export const RegistryEventsConfigApiResponseSchema = type({
  data: type({
    schemaVersion: string(),
    version: string(),
    timestamp: number(),
    events: record(string(), array(string())),
  }),
});

export type RegistryEventsConfigApiResponse = Infer<
  typeof RegistryEventsConfigApiResponseSchema
>;

export type RegistryEventsConfig = RegistryEventsConfigApiResponse['data'];

function createFetchResultStruct<Data>(dataStruct: Struct<Data, unknown>) {
  return union([
    type({
      modified: literal(false),
      etag: nullable(string()),
      data: nullable(dataStruct),
    }),
    type({
      modified: literal(true),
      etag: nullable(string()),
      data: dataStruct,
    }),
  ]);
}

export const FetchConfigResultStruct = createFetchResultStruct(
  RegistryConfigApiResponseSchema,
);

export const FetchEventsConfigResultStruct = createFetchResultStruct(
  RegistryEventsConfigApiResponseSchema,
);

export type FetchConfigOptions = {
  etag?: string;
};

export type FetchConfigResult =
  | {
      modified: false;
      etag: string | null;
      /**
       * Cached data from the service when available (e.g. after a previous
       * successful fetch). `null` when the service has no cache yet.
       */
      data: RegistryConfigApiResponse | null;
    }
  | {
      modified: true;
      data: RegistryConfigApiResponse;
      etag: string | null;
    };

export type FetchEventsConfigResult =
  | {
      modified: false;
      etag: string | null;
      data: RegistryEventsConfigApiResponse | null;
    }
  | {
      modified: true;
      data: RegistryEventsConfigApiResponse;
      etag: string | null;
    };
