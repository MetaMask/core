import { NetworkStatus } from '@metamask/network-controller';

import type {
  MultichainNetworkConfiguration,
  MultichainNetworkMetadata,
} from './MultichainNetworkController';

export const bitcoinCaip2ChainId = 'bip122:000000000019d6689c085ae165831e93';
export const solanaCaip2ChainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

export const multichainNetworkConfigurations: Record<string, MultichainNetworkConfiguration> = {
  bitcoinCaip2ChainId: {
    chainId: bitcoinCaip2ChainId,

    name: 'Bitcoin Mainnet',

    blockExplorerUrls: [],

    nativeCurrency: 'BTC',

    isEvm: false,
  },
  solanaCaip2ChainId: {
    chainId: solanaCaip2ChainId,

    name: 'Solana Mainnet',

    blockExplorerUrls: [],

    nativeCurrency: 'SOL',

    isEvm: false,
  },
};

export const networksMetadata: Record<string, MultichainNetworkMetadata> = {
  bitcoinCaip2ChainId: {
    features: [],
    status: NetworkStatus.Available,
  },
  solanaCaip2ChainId: {
    features: [],
    status: NetworkStatus.Available,
  },
};
