import type { GetSupportedNetworksResponse } from '../types';

export const MOCK_GET_SUPPORTED_NETWORKS_RESPONSE: GetSupportedNetworksResponse =
  {
    fullSupport: [1, 137, 56, 59144, 8453, 10, 42161, 534352],
    partialSupport: {
      balances: [59141, 42220, 43114],
    },
  };
