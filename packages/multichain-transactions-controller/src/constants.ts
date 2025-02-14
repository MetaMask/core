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
