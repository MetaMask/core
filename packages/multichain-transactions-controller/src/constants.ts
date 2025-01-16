import { BtcAccountType, SolAccountType } from '@metamask/keyring-api';

/**
 * The network identifiers for supported networks in CAIP-2 format.
 * Note: This is a temporary workaround until we have a more robust
 * solution for network identifiers.
 */
export enum MultichainNetwork {
  Bitcoin = 'bip122:000000000019d6689c085ae165831e93',
  BitcoinTestnet = 'bip122:000000000933ea01ad0ee984209779ba',
  Solana = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  SolanaDevnet = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  SolanaTestnet = 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
}

export enum MultichainNativeAsset {
  Bitcoin = `${MultichainNetwork.Bitcoin}/slip44:0`,
  BitcoinTestnet = `${MultichainNetwork.BitcoinTestnet}/slip44:0`,
  Solana = `${MultichainNetwork.Solana}/slip44:501`,
  SolanaDevnet = `${MultichainNetwork.SolanaDevnet}/slip44:501`,
  SolanaTestnet = `${MultichainNetwork.SolanaTestnet}/slip44:501`,
}

const BITCOIN_AVG_BLOCK_TIME = 10 * 60 * 1000; // 10 minutes in milliseconds
const SOLANA_TRANSACTIONS_UPDATE_TIME = 7000; // 7 seconds
const BTC_TRANSACTIONS_UPDATE_TIME = BITCOIN_AVG_BLOCK_TIME / 2;

export const TRANSACTIONS_CHECK_INTERVALS = {
  // NOTE: We set an interval of half the average block time for bitcoin
  // to mitigate when our interval is de-synchronized with the actual block time.
  [BtcAccountType.P2wpkh]: BTC_TRANSACTIONS_UPDATE_TIME,
  [SolAccountType.DataAccount]: SOLANA_TRANSACTIONS_UPDATE_TIME,
};

/**
 * Maps network identifiers to their corresponding native asset types.
 * Each network is mapped to an array containing its native asset for consistency.
 */
export const NETWORK_ASSETS_MAP: Record<string, MultichainNativeAsset[]> = {
  [MultichainNetwork.Solana]: [MultichainNativeAsset.Solana],
  [MultichainNetwork.SolanaTestnet]: [MultichainNativeAsset.SolanaTestnet],
  [MultichainNetwork.SolanaDevnet]: [MultichainNativeAsset.SolanaDevnet],
  [MultichainNetwork.Bitcoin]: [MultichainNativeAsset.Bitcoin],
  [MultichainNetwork.BitcoinTestnet]: [MultichainNativeAsset.BitcoinTestnet],
};
