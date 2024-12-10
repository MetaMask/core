import { BtcAccountType, SolAccountType } from '@metamask/keyring-api';

/**
 * The network identifiers for supported networks in CAIP-2 format.
 * Note: This is a temporary workaround until we have a more robust
 * solution for network identifiers.
 */
export enum MultichainNetworks {
  Bitcoin = 'bip122:000000000019d6689c085ae165831e93',
  BitcoinTestnet = 'bip122:000000000933ea01ad0ee984209779ba',
  Solana = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  SolanaDevnet = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  SolanaTestnet = 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
}

export enum MultichainNativeAssets {
  Bitcoin = `${MultichainNetworks.Bitcoin}/slip44:0`,
  BitcoinTestnet = `${MultichainNetworks.BitcoinTestnet}/slip44:0`,
  Solana = `${MultichainNetworks.Solana}/slip44:501`,
  SolanaDevnet = `${MultichainNetworks.SolanaDevnet}/slip44:501`,
  SolanaTestnet = `${MultichainNetworks.SolanaTestnet}/slip44:501`,
}

const BITCOIN_AVG_BLOCK_TIME = 10 * 60 * 1000; // 10 minutes in milliseconds
const SOLANA_AVG_BLOCK_TIME = 400; // 400 milliseconds

export const BALANCE_UPDATE_INTERVALS = {
  // NOTE: We set an interval of half the average block time for bitcoin
  // to mitigate when our interval is de-synchronized with the actual block time.
  [BtcAccountType.P2wpkh]: BITCOIN_AVG_BLOCK_TIME / 2,
  [SolAccountType.DataAccount]: SOLANA_AVG_BLOCK_TIME,
};

/**
 * Maps network identifiers to their corresponding native asset types.
 * Each network is mapped to an array containing its native asset for consistency.
 */
export const NETWORK_ASSETS_MAP: Record<string, MultichainNativeAssets[]> = {
  [MultichainNetworks.Solana]: [MultichainNativeAssets.Solana],
  [MultichainNetworks.SolanaTestnet]: [MultichainNativeAssets.SolanaTestnet],
  [MultichainNetworks.SolanaDevnet]: [MultichainNativeAssets.SolanaDevnet],
  [MultichainNetworks.Bitcoin]: [MultichainNativeAssets.Bitcoin],
  [MultichainNetworks.BitcoinTestnet]: [MultichainNativeAssets.BitcoinTestnet],
};
