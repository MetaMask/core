import type { Address } from './core';

/**
 * Balance request for batch balance fetching.
 */
export type BalanceOfRequest = {
  /** Token contract address (zero address for native) */
  tokenAddress: Address;
  /** Account address to check balance for */
  accountAddress: Address;
};

/**
 * Balance response from batch balance fetching.
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
