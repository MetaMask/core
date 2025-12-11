import type { ServicePolicy } from '@metamask/controller-utils';

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

export type FetchConfigOptions = {
  etag?: string;
};

export type FetchConfigResult = {
  data: RegistryConfigApiResponse;
  etag?: string;
  notModified: boolean;
};

export type AbstractConfigRegistryApiService = Partial<
  Pick<ServicePolicy, 'onBreak' | 'onDegraded'>
> & {
  fetchConfig(options?: FetchConfigOptions): Promise<FetchConfigResult>;
};
