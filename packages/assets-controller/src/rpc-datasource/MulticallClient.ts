import type {
  IMulticallClient,
  MulticallRequest,
  MulticallResponse,
  BalanceOfRequest,
  BalanceOfResponse,
} from './interfaces';
import type { Address, ChainId } from './types';

/**
 * Multicall3 contract addresses by chain ID.
 * Most chains use the same deterministic deployment address.
 */
export const MULTICALL3_ADDRESS_BY_CHAIN: Record<ChainId, Address> = {
  // Will be populated with chain-specific addresses
  // Most use: 0xcA11bde05977b3631167028862bE2a173976CA11
};

/**
 * MulticallClient configuration.
 */
export type MulticallClientConfig = {
  /** Maximum calls per batch (default: 300) */
  maxCallsPerBatch?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
};

/**
 * Provider interface (subset of ethers Web3Provider).
 */
export type Provider = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call(transaction: { to: string; data: string }): Promise<any>;
  getBalance(address: string): Promise<{ toString(): string }>;
};

/**
 * Function to get provider for a chain.
 */
export type GetProviderFunction = (chainId: ChainId) => Provider;

/**
 * MulticallClient - Multicall3 wrapper for batching contract calls.
 *
 * Provides efficient batching of ERC20 balanceOf calls and other
 * read operations using the Multicall3 aggregate3 function.
 */
export class MulticallClient implements IMulticallClient {
  readonly #getProvider: GetProviderFunction;

  readonly #config: Required<MulticallClientConfig>;

  constructor(getProvider: GetProviderFunction, config?: MulticallClientConfig) {
    this.#getProvider = getProvider;
    this.#config = {
      maxCallsPerBatch: config?.maxCallsPerBatch ?? 300,
      timeoutMs: config?.timeoutMs ?? 30000,
    };
  }

  isSupported(chainId: ChainId): boolean {
    return chainId in MULTICALL3_ADDRESS_BY_CHAIN;
  }

  getContractAddress(chainId: ChainId): Address | undefined {
    return MULTICALL3_ADDRESS_BY_CHAIN[chainId];
  }

  async aggregate3(
    _chainId: ChainId,
    _calls: MulticallRequest[],
  ): Promise<MulticallResponse[]> {
    // TODO: Implement aggregate3 call
    // 1. Get provider for chain
    // 2. Encode aggregate3 call
    // 3. Execute and decode results
    throw new Error('Not implemented');
  }

  async batchBalanceOf(
    _chainId: ChainId,
    _requests: BalanceOfRequest[],
  ): Promise<BalanceOfResponse[]> {
    // TODO: Implement batched balanceOf
    // 1. Build balanceOf calls for each request
    // 2. Execute via aggregate3
    // 3. Decode and return results
    throw new Error('Not implemented');
  }

  async batchNativeBalance(
    _chainId: ChainId,
    _accounts: Address[],
  ): Promise<Record<Address, string>> {
    // TODO: Implement batched native balance fetch
    // 1. Use Multicall3.getEthBalance for each account
    // 2. Execute via aggregate3
    // 3. Return results
    throw new Error('Not implemented');
  }
}
