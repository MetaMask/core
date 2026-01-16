import type { Hex } from '@metamask/utils';

import type { Address } from './core';

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
