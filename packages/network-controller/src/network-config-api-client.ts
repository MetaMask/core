import { Injectable } from '@nestjs/common';
import { createLogger } from '@codefi/observability';

export interface NetworkConfigApiService {
  fetchNetworkConfigurations(options: {
    version?: string;
    client?: string;
  }): Promise<NetworkConfigResponse>;

  fetchNetworkIcons(options: {
    chainId?: string;
    version?: string;
  }): Promise<NetworkIconsResponse>;
}

export interface NetworkConfiguration {
  chainId: string;
  name: string;
  nativeCurrency: string;
  rpcEndpoints: RpcEndpoint[];
  blockExplorerUrls: string[];
  defaultRpcEndpointIndex: number;
  defaultBlockExplorerUrlIndex?: number;
  iconUrl?: string;
  status: 'active' | 'deprecated' | 'testnet';
  lastUpdatedAt: number;
}

export interface RpcEndpoint {
  url: string;
  type: 'infura' | 'custom';
  name?: string;
  failoverUrls?: string[];
  networkClientId: string;
}

export interface NetworkIcon {
  chainId: string;
  iconUrl: string;
  altText?: string;
}

export interface NetworkConfigResponse {
  version: string;
  timestamp: number;
  networks: NetworkConfiguration[];
}

export interface NetworkIconsResponse {
  version: string;
  timestamp: number;
  icons: NetworkIcon[];
}

@Injectable()
export class NetworkConfigApiClient implements NetworkConfigApiService {
  private logger = createLogger('NetworkConfigApiClient');
  private baseUrl: string;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.CLIENT_CONFIG_API_URL || 'http://localhost:3000';
  }

  async fetchNetworkConfigurations(options: {
    version?: string;
    client?: string;
  }): Promise<NetworkConfigResponse> {
    const cacheKey = `config:${options.version || 'latest'}:${options.client || 'default'}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.info('Returning cached network configurations');
      return cached.data;
    }

    try {
      const params = new URLSearchParams();
      if (options.version) params.append('version', options.version);
      if (options.client) params.append('client', options.client);

      const url = `${this.baseUrl}/network-config?${params.toString()}`;

      this.logger.info('Fetching network configurations from API', { url });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: NetworkConfigResponse = await response.json();

      // Cache the response
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });

      this.logger.info('Successfully fetched network configurations', {
        version: data.version,
        networkCount: data.networks.length,
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to fetch network configurations', {
        error: error.message,
        options,
      });
      throw error;
    }
  }

  async fetchNetworkIcons(options: {
    chainId?: string;
    version?: string;
  }): Promise<NetworkIconsResponse> {
    const cacheKey = `icons:${options.version || 'latest'}:${options.chainId || 'all'}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.info('Returning cached network icons');
      return cached.data;
    }

    try {
      const params = new URLSearchParams();
      if (options.version) params.append('version', options.version);
      if (options.chainId) params.append('chainId', options.chainId);

      const url = `${this.baseUrl}/network-config/icons?${params.toString()}`;

      this.logger.info('Fetching network icons from API', { url });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: NetworkIconsResponse = await response.json();

      // Cache the response
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });

      this.logger.info('Successfully fetched network icons', {
        version: data.version,
        iconCount: data.icons.length,
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to fetch network icons', {
        error: error.message,
        options,
      });
      throw error;
    }
  }

  // Method to clear cache (useful for testing or manual cache invalidation)
  clearCache(): void {
    this.cache.clear();
    this.logger.info('Network config cache cleared');
  }

  // Method to get cache statistics
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
