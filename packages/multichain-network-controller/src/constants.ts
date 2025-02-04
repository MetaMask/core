import { BtcScopes, SolScopes } from '@metamask/keyring-api';
import { NetworkStatus } from '@metamask/network-controller';

import type {
  MultichainNetworkConfiguration,
  MultichainNetworkMetadata,
} from './MultichainNetworkController';

export const btcNativeAsset = `${BtcScopes.Mainnet}/slip44:0`;
export const solNativeAsset = `${SolScopes.Mainnet}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;

export const multichainNetworkConfigurations: Record<
  string,
  MultichainNetworkConfiguration
> = {
  [BtcScopes.Mainnet]: {
    chainId: BtcScopes.Mainnet,

    name: 'Bitcoin Mainnet',

    blockExplorerUrls: [],

    nativeCurrency: btcNativeAsset,

    isEvm: false,
  },
  [SolScopes.Mainnet]: {
    chainId: SolScopes.Mainnet,

    name: 'Solana Mainnet',

    blockExplorerUrls: [],

    nativeCurrency: solNativeAsset,

    isEvm: false,
  },
};

export const networksMetadata: Record<string, MultichainNetworkMetadata> = {
  [BtcScopes.Mainnet]: {
    features: [],
    status: NetworkStatus.Available,
  },
  [SolScopes.Mainnet]: {
    features: [],
    status: NetworkStatus.Available,
  },
};
