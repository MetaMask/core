import type {
  IMulticallClient,
  ITokenDetector,
  TokenDetectionOptions,
  TokenDetectionResult,
} from './interfaces';
import type {
  AccountId,
  Address,
  ChainId,
  TokenListState,
  UserTokensState,
} from './types';

/**
 * TokenDetector configuration.
 */
export type TokenDetectorConfig = {
  /** Default batch size for detection */
  defaultBatchSize?: number;
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number;
};

/**
 * TokenDetector - Detects new ERC-20 tokens for an account.
 *
 * Uses the token list to determine which contracts to check,
 * filters out already imported/detected tokens, and uses
 * Multicall3 to batch balanceOf calls for efficiency.
 */
export class TokenDetector implements ITokenDetector {
  readonly #multicallClient: IMulticallClient;

  readonly #config: Required<TokenDetectorConfig>;

  #getTokenListState: (() => TokenListState) | undefined;

  #getUserTokensState: (() => UserTokensState) | undefined;

  constructor(
    multicallClient: IMulticallClient,
    config?: TokenDetectorConfig,
  ) {
    this.#multicallClient = multicallClient;
    this.#config = {
      defaultBatchSize: config?.defaultBatchSize ?? 100,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 30000,
    };
  }

  setTokenListStateGetter(getTokenListState: () => TokenListState): void {
    this.#getTokenListState = getTokenListState;
  }

  setUserTokensStateGetter(getUserTokensState: () => UserTokensState): void {
    this.#getUserTokensState = getUserTokensState;
  }

  getTokensToCheck(chainId: ChainId, accountAddress: Address): Address[] {
    // TODO: Implement
    // 1. Get all tokens from token list for chain
    // 2. Get already imported/detected tokens for account
    // 3. Filter out already known tokens
    // 4. Return remaining addresses to check
    const _tokenListState = this.#getTokenListState?.();
    const _userTokensState = this.#getUserTokensState?.();
    const _chainId = chainId;
    const _accountAddress = accountAddress;
    return [];
  }

  async detectTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: TokenDetectionOptions,
  ): Promise<TokenDetectionResult> {
    // TODO: Implement
    // 1. Get tokens to check
    // 2. Batch balanceOf calls via multicall
    // 3. Filter tokens with non-zero balance
    // 4. Build Asset objects for detected tokens
    // 5. Return result
    const _options = options ?? {};
    const _multicallClient = this.#multicallClient;

    return {
      chainId,
      accountId,
      accountAddress,
      detectedAssets: [],
      zeroBalanceAddresses: [],
      failedAddresses: [],
      timestamp: Date.now(),
    };
  }
}
