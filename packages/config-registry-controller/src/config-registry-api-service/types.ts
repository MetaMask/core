import type { Infer } from '@metamask/superstruct';
import {
  array,
  assert,
  boolean,
  number,
  object,
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

export const RegistryNetworkConfigSchema = type({
  network: object({
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
  }),
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
    networks: array(RegistryNetworkConfigSchema),
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
    }
  | {
      modified: true;
      data: RegistryConfigApiResponse;
      etag?: string;
    };
