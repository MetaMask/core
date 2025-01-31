import { NetworkStatus } from '@metamask/network-controller';

import type {
  MultichainNetworkConfiguration,
  MultichainNetworkMetadata,
} from './MultichainNetworkController';
import { BtcScope, SolScope } from '@metamask/keyring-api';


export const btcNativeAsset = `${BtcScope.Mainnet}/slip44:0`;
export const solNativeAsset = `${SolScope.Mainnet}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`;

export const multichainNetworkConfigurations: Record<string, MultichainNetworkConfiguration> = {
 [BtcScope.Mainnet] : {
    chainId: BtcScope.Mainnet,

    name: 'Bitcoin Mainnet',

    blockExplorerUrls: [],

    nativeCurrency: btcNativeAsset,

    isEvm: false,
  },
  [SolScope.Mainnet]: {
    chainId: SolScope.Mainnet,

    name: 'Solana Mainnet',

    blockExplorerUrls: [],

    nativeCurrency: solNativeAsset,

    isEvm: false,
  },
};

export const networksMetadata: Record<string, MultichainNetworkMetadata> = {
  [BtcScope.Mainnet]: {
    features: [],
    status: NetworkStatus.Available,
  },
  [SolScope.Mainnet]: {
    features: [],
    status: NetworkStatus.Available,
  },
};
