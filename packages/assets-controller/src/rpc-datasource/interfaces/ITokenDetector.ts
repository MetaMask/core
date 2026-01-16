import type {
  AccountId,
  Address,
  Asset,
  AssetBalance,
  ChainId,
  TokenListState,
  UserTokensState,
} from '../types';

/**
 * Token detection result.
 */
export type TokenDetectionResult = {
  /** Chain ID */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Account address used for detection */
  accountAddress: Address;
  /** Newly detected tokens with non-zero balances */
  detectedAssets: Asset[];
  /** Balances for newly detected tokens */
  detectedBalances: AssetBalance[];
  /** Tokens that were checked but had zero balance */
  zeroBalanceAddresses: Address[];
  /** Tokens that failed to be checked */
  failedAddresses: Address[];
  /** Timestamp of detection */
  timestamp: number;
};

/**
 * Token detection options.
 */
export type TokenDetectionOptions = {
  /** Maximum number of tokens to check per batch */
  batchSize?: number;
  /** Timeout for detection in milliseconds */
  timeout?: number;
};

/**
 * Token detector interface.
 *
 * Responsible for detecting new ERC-20 tokens for an account
 * by checking balances against a known token list.
 */
export type ITokenDetector = {
  /**
   * Detect new tokens for an account on a specific chain.
   *
   * Uses the token list to determine which contracts to check,
   * filters out already imported/detected tokens, and uses
   * Multicall3 to batch balanceOf calls.
   *
   * @param chainId - Chain ID to detect tokens on.
   * @param accountId - Account ID to detect tokens for.
   * @param accountAddress - Account address to check balances for.
   * @param options - Optional detection options.
   * @returns Detection result with newly found tokens.
   */
  detectTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: TokenDetectionOptions,
  ): Promise<TokenDetectionResult>;

  /**
   * Get tokens to check from token list (excluding already known tokens).
   *
   * @param chainId - Chain ID.
   * @param accountAddress - Account address.
   * @returns Array of token addresses to check.
   */
  getTokensToCheck(chainId: ChainId, accountAddress: Address): Address[];

  /**
   * Set the token list state source.
   *
   * @param getTokenListState - Function to get current token list state.
   */
  setTokenListStateGetter(getTokenListState: () => TokenListState): void;

  /**
   * Set the user tokens state source.
   *
   * @param getUserTokensState - Function to get current user tokens state.
   */
  setUserTokensStateGetter(getUserTokensState: () => UserTokensState): void;
};
