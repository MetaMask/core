import type { ChainId } from './core.js';

/**
 * Minimal provider interface for RPC calls.
 */
export type Provider = {
  call(transaction: { to: string; data: string }): Promise<string>;
  getBalance(address: string): Promise<{ toString(): string }>;
};

/**
 * Function to get provider for a specific chain.
 */
export type GetProviderFunction = (chainId: ChainId) => Provider;
