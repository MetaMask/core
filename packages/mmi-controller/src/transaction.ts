export enum TransactionStatus {
  /**
   * A new transaction that the user has not approved or rejected
   */
  unapproved = 'unapproved',
  /**
   * The user has approved the transaction in the MetaMask UI
   */
  approved = 'approved',
  /**
   * The user has rejected the transaction in the MetaMask UI
   */
  rejected = 'rejected',
  /**
   * The transaction has been signed
   */
  signed = 'signed',
  /**
   * The transaction has been submitted to network
   */
  submitted = 'submitted',
  /**
   * The transaction has failed for some reason
   */
  failed = 'failed',
  /**
   * The transaction was dropped due to a tx with same nonce being accepted
   */
  dropped = 'dropped',
  /**
   * The transaction was confirmed by the network
   */
  confirmed = 'confirmed',
  /**
   * The transaction has been signed and is waiting to either be confirmed,
   * dropped or failed. This is a "fake" status that we use to group statuses
   * that are very similar from the user's perspective (approved,
   * signed, submitted). The only notable case where approve and signed are
   * different from user perspective is in hardware wallets where the
   * transaction is signed on an external device. Otherwise signing happens
   * transparently to users.
   */
  pending = 'pending',
}

export const FINALIZED_TRANSACTION_STATUSES = [
  TransactionStatus.rejected,
  TransactionStatus.failed,
  TransactionStatus.dropped,
  TransactionStatus.confirmed,
];

export const CHAIN_IDS = {
  MAINNET: '0x1',
  GOERLI: '0x5',
  LOCALHOST: '0x539',
  BSC: '0x38',
  BSC_TESTNET: '0x61',
  OPTIMISM: '0xa',
  OPTIMISM_TESTNET: '0x1a4',
  POLYGON: '0x89',
  POLYGON_TESTNET: '0x13881',
  AVALANCHE: '0xa86a',
  AVALANCHE_TESTNET: '0xa869',
  FANTOM: '0xfa',
  FANTOM_TESTNET: '0xfa2',
  CELO: '0xa4ec',
  ARBITRUM: '0xa4b1',
  HARMONY: '0x63564c40',
  PALM: '0x2a15c308d',
  SEPOLIA: '0xaa36a7',
  LINEA_TESTNET: '0xe704',
  AURORA: '0x4e454152',
  MOONBEAM: '0x504',
  MOONBEAM_TESTNET: '0x507',
  MOONRIVER: '0x505',
} as const;