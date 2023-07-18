import { Bytes } from './bytes';
import { Hex } from './hex';

export type Transaction =
  | LegacyTransaction
  | EIP2930Transaction
  | EIP1559Transaction;

export type SignedTransaction = Transaction & Signature;

export type Signature = {
  /**
   * EC signature parameter
   * 32 bytes long sequence.
   */
  r: Bytes;

  /**
   * EC signature parameter
   * Signature proof.
   * 32 bytes long sequence
   */
  s: Bytes;

  /**
   * Recovery identifier. It can be either 0x1b or 0x1c
   * 1 byte long sequence
   */
  yParity: Bytes;
};

/**
 * Base Ethereum Transaction
 */
export type BaseTransaction = {
  /**
   * Sequentially incrementing counter which indicates the transaction
   * number from the account
   */
  nonce: Bytes;

  /**
   * The address of the sender, that will be signing the transaction
   */
  from: Hex | Uint8Array;

  /**
   * The receiving address.
   * If an externally-owned account, the transaction will transfer value.
   * If a contract account, the transaction will execute the contract code.
   */
  to: Hex | Uint8Array;

  /**
   * The amount of Ether sent.
   */
  value: Bytes;

  /**
   * Maximum amount of gas units that this transaction can consume.
   */
  gasLimit: Bytes;

  /**
   * Arbitrary data.
   */
  data?: Bytes;
};

/**
 * Typed Ethereum Transaction
 */
export type TypedTransaction = BaseTransaction & {
  /**
   * Transaction type.
   */
  type: number;
};

/**
 * Ethereum Legacy Transaction
 * Reference: https://ethereum.org/en/developers/docs/transactions/
 */
export type LegacyTransaction = BaseTransaction & {
  /**
   * Transaction's gas price.
   */
  gasPrice: Bytes | null;
};

/**
 * EIP-2930 Transaction: Optional Access Lists
 * Reference: https://eips.ethereum.org/EIPS/eip-2930
 */
export type EIP2930Transaction = TypedTransaction & {
  /**
   * Transaction type.
   */
  type: 1;

  /**
   * Transaction chain ID
   */
  chainId: Bytes;

  /**
   * List of addresses and storage keys that the transaction plans to access
   */
  accessList:
    | { address: Hex; storageKeys: Hex[] }[]
    | { address: Uint8Array; storageKeys: Uint8Array[] }[];
};

/**
 * EIP-1559 Transaction: Fee market change for ETH 1.0 chain (Type-2)
 *
 * Reference: https://eips.ethereum.org/EIPS/eip-1559
 */
export type EIP1559Transaction = TypedTransaction & {
  /**
   * Transaction type.
   */
  type: 2;

  /**
   * Maximum fee to give to the miner
   */
  maxPriorityFeePerGas: Bytes;

  /**
   * Maximum total fee
   */
  maxFeePerGas: Bytes;
};
