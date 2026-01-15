import type { Hex } from '@metamask/utils';

import type { Address, ChainId } from '../types';

/**
 * Single call in a multicall batch.
 */
export type MulticallRequest = {
  /** Target contract address */
  target: Address;
  /** Whether this call can fail without failing the batch */
  allowFailure: boolean;
  /** Encoded call data */
  callData: Hex;
};

/**
 * Result of a single call in a multicall batch.
 */
export type MulticallResponse = {
  /** Whether the call succeeded */
  success: boolean;
  /** Returned data (encoded) */
  returnData: Hex;
};

/**
 * Balance request for multicall.
 */
export type BalanceOfRequest = {
  /** Token contract address (zero address for native) */
  tokenAddress: Address;
  /** Account address to check balance for */
  accountAddress: Address;
};

/**
 * Balance response from multicall.
 */
export type BalanceOfResponse = {
  /** Token contract address */
  tokenAddress: Address;
  /** Account address */
  accountAddress: Address;
  /** Whether the call succeeded */
  success: boolean;
  /** Balance as string (raw value) */
  balance?: string;
};

/**
 * Multicall3 client interface.
 *
 * Wraps the Multicall3 contract for batching multiple
 * contract calls into a single RPC request.
 */
export type IMulticallClient = {
  /**
   * Check if Multicall3 is supported on this chain.
   *
   * @param chainId - Chain ID to check.
   * @returns True if Multicall3 is available.
   */
  isSupported(chainId: ChainId): boolean;

  /**
   * Get the Multicall3 contract address for a chain.
   *
   * @param chainId - Chain ID.
   * @returns Contract address or undefined if not supported.
   */
  getContractAddress(chainId: ChainId): Address | undefined;

  /**
   * Execute a batch of calls using aggregate3.
   *
   * @param chainId - Chain ID to execute on.
   * @param calls - Array of calls to execute.
   * @returns Array of results.
   */
  aggregate3(
    chainId: ChainId,
    calls: MulticallRequest[],
  ): Promise<MulticallResponse[]>;

  /**
   * Batch fetch ERC20 balances for multiple token/account pairs.
   *
   * @param chainId - Chain ID.
   * @param requests - Array of balance requests.
   * @returns Array of balance responses.
   */
  batchBalanceOf(
    chainId: ChainId,
    requests: BalanceOfRequest[],
  ): Promise<BalanceOfResponse[]>;

  /**
   * Batch fetch native token balances for multiple accounts.
   *
   * @param chainId - Chain ID.
   * @param accounts - Array of account addresses.
   * @returns Map of account address to balance.
   */
  batchNativeBalance(
    chainId: ChainId,
    accounts: Address[],
  ): Promise<Record<Address, string>>;
};
