import type {
  IBalanceFetcher,
  IMulticallClient,
  BalanceFetchOptions,
  BalanceFetchResult,
} from './interfaces';
import type {
  AccountId,
  Address,
  ChainId,
  UserTokensState,
} from './types';

/**
 * BalanceFetcher configuration.
 */
export type BalanceFetcherConfig = {
  /** Default batch size for balance fetching */
  defaultBatchSize?: number;
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;
  /** Include native token by default */
  includeNativeByDefault?: boolean;
  /** Include staked balance by default */
  includeStakedByDefault?: boolean;
};

/**
 * BalanceFetcher - Fetches token balances for an account.
 *
 * Uses the user's imported + detected tokens list and
 * Multicall3 to batch balanceOf calls for efficiency.
 */
export class BalanceFetcher implements IBalanceFetcher {
  readonly #multicallClient: IMulticallClient;

  readonly #config: Required<BalanceFetcherConfig>;

  #getUserTokensState: (() => UserTokensState) | undefined;

  constructor(
    multicallClient: IMulticallClient,
    config?: BalanceFetcherConfig,
  ) {
    this.#multicallClient = multicallClient;
    this.#config = {
      defaultBatchSize: config?.defaultBatchSize ?? 100,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 30000,
      includeNativeByDefault: config?.includeNativeByDefault ?? true,
      includeStakedByDefault: config?.includeStakedByDefault ?? false,
    };
  }

  setUserTokensStateGetter(getUserTokensState: () => UserTokensState): void {
    this.#getUserTokensState = getUserTokensState;
  }

  getTokensToFetch(chainId: ChainId, accountAddress: Address): Address[] {
    // TODO: Implement
    // 1. Get imported tokens for account on chain
    // 2. Get detected tokens for account on chain
    // 3. Merge and deduplicate
    // 4. Return token addresses
    const _userTokensState = this.#getUserTokensState?.();
    const _chainId = chainId;
    const _accountAddress = accountAddress;
    return [];
  }

  async fetchBalances(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: BalanceFetchOptions,
  ): Promise<BalanceFetchResult> {
    const tokenAddresses = this.getTokensToFetch(chainId, accountAddress);
    return this.fetchBalancesForTokens(
      chainId,
      accountId,
      accountAddress,
      tokenAddresses,
      options,
    );
  }

  async fetchBalancesForTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    _tokenAddresses: Address[],
    options?: BalanceFetchOptions,
  ): Promise<BalanceFetchResult> {
    // TODO: Implement
    // 1. Build balance requests
    // 2. Optionally add native token
    // 3. Optionally add staked balance
    // 4. Batch via multicall
    // 5. Build AssetBalance objects
    // 6. Return result
    const _options = options ?? {};
    const _multicallClient = this.#multicallClient;

    return {
      chainId,
      accountId,
      accountAddress,
      balances: [],
      failedAddresses: [],
      timestamp: Date.now(),
    };
  }
}
