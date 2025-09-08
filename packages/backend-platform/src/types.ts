
/**
 * Basic transaction information
 */
export type Transaction = {
  /** Transaction hash */
  hash: string;
  /** Chain identifier in CAIP-2 format (e.g., "eip155:1") */
  chain: string;
  /** Transaction status */
  status: string;
  /** Timestamp when the transaction was processed */
  timestamp: number;
  /** Address that initiated the transaction */
  from: string;
  /** Address that received the transaction */
  to: string;
};

/**
 * Asset information for balance updates
 */
export type Asset = {
  /** Whether the asset is fungible */
  fungible: boolean;
  /** Asset type in CAIP format (e.g., "eip155:1/erc20:0x...") */
  type: string;
  /** Asset unit/symbol (e.g., "USDT", "ETH") */
  unit: string;
};

/**
 * Balance information
 */
export type Balance = {
  /** Balance amount as string */
  amount: string;
  /** Optional error message */
  error?: string;
};

/**
 * Transfer information
 */
export type Transfer = {
  /** Address sending the transfer */
  from: string;
  /** Address receiving the transfer */
  to: string;
  /** Transfer amount as string */
  amount: string;
};

/**
 * Balance update information for a specific asset
 */
export type BalanceUpdate = {
  /** Asset information */
  asset: Asset;
  /** Post-transaction balance */
  postBalance: Balance;
  /** List of transfers for this asset */
  transfers: Transfer[];
};

/**
 * Complete transaction/balance update message
 */
export type Message = {
  /** Account address */
  address: string;
  /** Transaction information */
  tx: Transaction;
  /** Array of balance updates for different assets */
  updates: BalanceUpdate[];
};
