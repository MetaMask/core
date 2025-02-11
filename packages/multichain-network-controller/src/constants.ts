import { BtcScope, SolScope } from '@metamask/keyring-api';
import { NetworkStatus } from '@metamask/network-controller';

import type {
  MultichainNetworkConfiguration,
  MultichainNetworkMetadata,
} from './MultichainNetworkController';

export const BTC_NATIVE_ASSET = `${BtcScope.Mainnet}/slip44:0`;
export const SOL_NATIVE_ASSET = `${SolScope.Mainnet}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;

export const AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS: Record<
  string,
  MultichainNetworkConfiguration
> = {
  [BtcScope.Mainnet]: {
    chainId: BtcScope.Mainnet,
    name: 'Bitcoin Mainnet',
    blockExplorers: {
      urls: ['https://blockstream.info'],
      defaultIndex: 0,
    },
    nativeCurrency: BTC_NATIVE_ASSET,
    isEvm: false,
  },
  [SolScope.Mainnet]: {
    chainId: SolScope.Mainnet,
    name: 'Solana Mainnet',
    blockExplorers: {
      urls: ['https://explorer.solana.com'],
      defaultIndex: 0,
    },
    nativeCurrency: SOL_NATIVE_ASSET,
    isEvm: false,
  },
};

export const NETWORKS_METADATA: Record<string, MultichainNetworkMetadata> = {
  [BtcScope.Mainnet]: {
    features: [],
    status: NetworkStatus.Available,
  },
  [SolScope.Mainnet]: {
    features: [],
    status: NetworkStatus.Available,
  },
};
