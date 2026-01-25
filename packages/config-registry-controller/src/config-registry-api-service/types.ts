import {
  array,
  assert,
  boolean,
  number,
  optional,
  string,
  type,
} from '@metamask/superstruct';

const RpcEndpointSchema = type({
  url: string(),
  type: string(),
  networkClientId: string(),
  failoverUrls: array(string()),
});

export const NetworkConfigSchema = type({
  chainId: string(),
  name: string(),
  nativeCurrency: string(),
  rpcEndpoints: array(RpcEndpointSchema),
  blockExplorerUrls: array(string()),
  defaultRpcEndpointIndex: number(),
  defaultBlockExplorerUrlIndex: number(),
  lastUpdatedAt: optional(number()),
  networkImageUrl: optional(string()),
  nativeTokenImageUrl: optional(string()),
  isActive: boolean(),
  isTestnet: boolean(),
  isDefault: boolean(),
  isFeatured: boolean(),
  isDeprecated: boolean(),
  priority: number(),
  isDeletable: boolean(),
});

export const RegistryConfigApiResponseSchema = type({
  data: type({
    version: string(),
    timestamp: number(),
    networks: array(NetworkConfigSchema),
  }),
});

export type NetworkConfig = {
  chainId: string;
  name: string;
  nativeCurrency: string;
  rpcEndpoints: {
    url: string;
    type: string;
    networkClientId: string;
    failoverUrls: string[];
  }[];
  blockExplorerUrls: string[];
  defaultRpcEndpointIndex: number;
  defaultBlockExplorerUrlIndex: number;
  lastUpdatedAt?: number;
  networkImageUrl?: string;
  nativeTokenImageUrl?: string;
  isActive: boolean;
  isTestnet: boolean;
  isDefault: boolean;
  isFeatured: boolean;
  isDeprecated: boolean;
  priority: number;
  isDeletable: boolean;
};

export type RegistryConfigApiResponse = {
  data: {
    version: string;
    timestamp: number;
    networks: NetworkConfig[];
  };
};

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
    }
  | {
      modified: true;
      data: RegistryConfigApiResponse;
      etag?: string;
    };
