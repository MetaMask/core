/**
 * @type TransactionMeta
 *
 * TransactionMeta representation
 * @property error - Synthesized error information for failed transactions
 * @property id - Generated UUID associated with this transaction
 * @property networkID - Network code as per EIP-155 for this transaction
 * @property origin - Origin this transaction was sent from
 * @property deviceConfirmedOn - string to indicate what device the transaction was confirmed
 * @property rawTx - Hex representation of the underlying transaction
 * @property status - String status of this transaction
 * @property time - Timestamp associated with this transaction
 * @property toSmartContract - Whether transaction recipient is a smart contract
 * @property transaction - Underlying Transaction object
 * @property transactionHash - Hash of a successful transaction
 * @property blockNumber - Number of the block where the transaction has been included
 */
export type TransactionMeta =
  | ({
      status: Exclude<TransactionStatus, TransactionStatus.failed>;
    } & TransactionMetaBase)
  | ({ status: TransactionStatus.failed; error: Error } & TransactionMetaBase);

type TransactionMetaBase = {
  isTransfer?: boolean;
  transferInformation?: {
    symbol: string;
    contractAddress: string;
    decimals: number;
  };
  id: string;
  networkID?: string;
  chainId?: string;
  origin?: string;
  rawTx?: string;
  time: number;
  toSmartContract?: boolean;
  transaction: Transaction;
  transactionHash?: string;
  blockNumber?: string;
  deviceConfirmedOn?: WalletDevice;
  verifiedOnBlockchain?: boolean;

  /**
   * The initial gas values set when the transaction was first created.
   */
  defaultGasEstimates?: DefaultGasEstimates;

  /**
   * The original gas estimation of the transaction.
   */
  originalGasEstimate?: string;

  /**
   * Response from security validator.
   */
  securityAlertResponse?: Record<string, unknown>;

  /**
   * If the gas estimation fails, an object containing error and block information.
   */
  simulationFails?: {
    reason?: string;
    errorKey?: string;
    debug: {
      blockNumber?: string;
      blockGasLimit?: string;
    };
  };

  /**
   * Estimate level user selected.
   */
  userFeeLevel?: string;
};

/**
 * The status of the transaction. Each status represents the state of the transaction internally
 * in the wallet. Some of these correspond with the state of the transaction on the network, but
 * some are wallet-specific.
 */
export enum TransactionStatus {
  approved = 'approved',
  cancelled = 'cancelled',
  confirmed = 'confirmed',
  failed = 'failed',
  rejected = 'rejected',
  signed = 'signed',
  submitted = 'submitted',
  unapproved = 'unapproved',
}

/**
 * Options for wallet device.
 */
export enum WalletDevice {
  MM_MOBILE = 'metamask_mobile',
  MM_EXTENSION = 'metamask_extension',
  OTHER = 'other_device',
}

/**
 * @type Transaction
 *
 * Transaction representation
 * @property chainId - Network ID as per EIP-155
 * @property data - Data to pass with this transaction
 * @property from - Address to send this transaction from
 * @property gas - Gas to send with this transaction
 * @property gasPrice - Price of gas with this transaction
 * @property gasUsed - Gas used in the transaction
 * @property nonce - Unique number to prevent replay attacks
 * @property to - Address to send this transaction to
 * @property value - Value associated with this transaction
 */
export interface Transaction {
  chainId?: number;
  data?: string;
  from: string;
  gas?: string;
  gasPrice?: string;
  gasUsed?: string;
  nonce?: string;
  to?: string;
  value?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  estimatedBaseFee?: string;
  estimateGasError?: string;
  type?: string;
}

/**
 * The configuration required to fetch transaction data from a RemoteTransactionSource.
 */
export interface RemoteTransactionSourceRequest {
  /**
   * The address of the account to fetch transactions for.
   */
  address: string;

  /**
   * The chainId of the current network.
   */
  currentChainId: string;

  /**
   * The networkId of the current network.
   */
  currentNetworkId: string;

  /**
   * Block number to start fetching transactions from.
   */
  fromBlock?: number;

  /**
   * Maximum number of transactions to retrieve.
   */
  limit?: number;
}

/**
 * An object capable of fetching transaction data from a remote source.
 * Used by the IncomingTransactionHelper to retrieve remote transaction data.
 */
export interface RemoteTransactionSource {
  /**
   * @param chainId - The chainId of the current network.
   * @param networkId - The networkId of the current network.
   * @returns Whether the remote transaction source supports the specified network.
   */
  isSupportedNetwork: (chainId: string, networkId: string) => boolean;

  /**
   * @returns An array of additional keys to use when caching the last fetched block number.
   */
  getLastBlockVariations?: () => string[];

  /**
   * @param request - A request object containing data such as the address and chain ID.
   * @returns An array of transaction metadata for the retrieved transactions.
   */
  fetchTransactions: (
    request: RemoteTransactionSourceRequest,
  ) => Promise<TransactionMeta[]>;
}

/**
 * Specifies the shape of the base transaction parameters.
 * Added in EIP-2718.
 */
export enum TransactionEnvelopeType {
  /**
   * A legacy transaction, the very first type.
   */
  legacy = '0x0',

  /**
   * EIP-2930 defined the access list transaction type that allowed for
   * specifying the state that a transaction would act upon in advance and
   * theoretically save on gas fees.
   */
  accessList = '0x1',

  /**
   * The type introduced comes from EIP-1559, Fee Market describes the addition
   * of a baseFee to blocks that will be burned instead of distributed to
   * miners. Transactions of this type have both a maxFeePerGas (maximum total
   * amount in gwei per gas to spend on the transaction) which is inclusive of
   * the maxPriorityFeePerGas (maximum amount of gwei per gas from the
   * transaction fee to distribute to miner).
   */
  feeMarket = '0x2',
}

/**
 * The source of the gas fee parameters on a transaction.
 */
export enum UserFeeLevel {
  CUSTOM = 'custom',
  DAPP_SUGGESTED = 'dappSuggested',
  MEDIUM = 'medium',
}

/**
 * Initial gas values set when the transaction was first created.
 */
export type DefaultGasEstimates = {
  /**
   * Source of the gas fee values, such as `dappSuggested` or `medium`.
   */
  estimateType?: string;

  /**
   * Maxmimum number of units of gas to use for this transaction.
   */
  gas?: string;

  /**
   * Price per gas for legacy transactions.
   */
  gasPrice?: string;

  /**
   * Maximum amount per gas to pay for the transaction, including the priority fee.
   */
  maxFeePerGas?: string;

  /**
   * Maximum amount per gas to give to validator as incentive.
   */
  maxPriorityFeePerGas?: string;
};
