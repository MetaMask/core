import type { CaipAssetType } from '@metamask/utils';

import type { MulticallClient } from '../clients';
import type {
  AccountId,
  Address,
  AssetBalance,
  BalanceFetchOptions,
  BalanceFetchResult,
  BalanceOfRequest,
  BalanceOfResponse,
  ChainId,
  TokenFetchInfo,
  UserToken,
  UserTokensState,
} from '../types';
import { reduceInBatchesSerially } from '../utils';

const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;

export type BalanceFetcherConfig = {
  defaultBatchSize?: number;
  defaultTimeoutMs?: number;
  includeNativeByDefault?: boolean;
};

export class BalanceFetcher {
  readonly #multicallClient: MulticallClient;

  readonly #config: Required<BalanceFetcherConfig>;

  #getUserTokensState: (() => UserTokensState) | undefined;

  constructor(multicallClient: MulticallClient, config?: BalanceFetcherConfig) {
    this.#multicallClient = multicallClient;
    this.#config = {
      defaultBatchSize: config?.defaultBatchSize ?? 300,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 30000,
      includeNativeByDefault: config?.includeNativeByDefault ?? true,
    };
  }

  setUserTokensStateGetter(getUserTokensState: () => UserTokensState): void {
    this.#getUserTokensState = getUserTokensState;
  }

  getTokensToFetch(
    chainId: ChainId,
    accountAddress: Address,
  ): TokenFetchInfo[] {
    const userTokensState = this.#getUserTokensState?.();

    if (!userTokensState) {
      return [];
    }

    const tokenMap = new Map<string, TokenFetchInfo>();

    const addToken = (token: UserToken): void => {
      const lowerAddress = token.address.toLowerCase();
      if (!tokenMap.has(lowerAddress)) {
        tokenMap.set(lowerAddress, {
          address: token.address,
          decimals: token.decimals,
          symbol: token.symbol,
        });
      }
    };

    const importedTokens =
      userTokensState.allTokens[chainId]?.[accountAddress] ?? [];
    for (const token of importedTokens) {
      addToken(token);
    }

    const detectedTokens =
      userTokensState.allDetectedTokens[chainId]?.[accountAddress] ?? [];
    for (const token of detectedTokens) {
      addToken(token);
    }

    return Array.from(tokenMap.values());
  }

  async fetchBalances(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    options?: BalanceFetchOptions,
  ): Promise<BalanceFetchResult> {
    const tokens = this.getTokensToFetch(chainId, accountAddress);
    const tokenAddresses = tokens.map((token) => token.address);

    return this.fetchBalancesForTokens(
      chainId,
      accountId,
      accountAddress,
      tokenAddresses,
      options,
      tokens,
    );
  }

  async fetchBalancesForTokens(
    chainId: ChainId,
    accountId: AccountId,
    accountAddress: Address,
    tokenAddresses: Address[],
    options?: BalanceFetchOptions,
    tokenInfos?: TokenFetchInfo[],
  ): Promise<BalanceFetchResult> {
    const batchSize = options?.batchSize ?? this.#config.defaultBatchSize;
    const includeNative =
      options?.includeNative ?? this.#config.includeNativeByDefault;
    const timestamp = Date.now();

    const tokenInfoMap = new Map<string, TokenFetchInfo>();
    if (tokenInfos) {
      for (const info of tokenInfos) {
        tokenInfoMap.set(info.address.toLowerCase(), info);
      }
    }

    const balanceRequests: BalanceOfRequest[] = [];

    if (includeNative) {
      balanceRequests.push({
        tokenAddress: ZERO_ADDRESS,
        accountAddress,
      });
    }

    for (const tokenAddress of tokenAddresses) {
      balanceRequests.push({
        tokenAddress,
        accountAddress,
      });
    }

    if (balanceRequests.length === 0) {
      return {
        chainId,
        accountId,
        accountAddress,
        balances: [],
        failedAddresses: [],
        timestamp,
      };
    }

    type FetchAccumulator = {
      balances: AssetBalance[];
      failedAddresses: Address[];
    };

    const result = await reduceInBatchesSerially<
      BalanceOfRequest,
      FetchAccumulator
    >({
      values: balanceRequests,
      batchSize,
      initialResult: {
        balances: [],
        failedAddresses: [],
      },
      eachBatch: async (workingResult, batch) => {
        const responses = await this.#multicallClient.batchBalanceOf(
          chainId,
          batch,
        );

        return this.#processBalanceResponses(
          responses,
          workingResult as FetchAccumulator,
          chainId,
          accountId,
          timestamp,
          tokenInfoMap,
        );
      },
    });

    return {
      chainId,
      accountId,
      accountAddress,
      ...result,
      timestamp,
    };
  }

  #processBalanceResponses(
    responses: BalanceOfResponse[],
    accumulator: {
      balances: AssetBalance[];
      failedAddresses: Address[];
    },
    chainId: ChainId,
    accountId: AccountId,
    timestamp: number,
    tokenInfoMap: Map<string, TokenFetchInfo>,
  ): {
    balances: AssetBalance[];
    failedAddresses: Address[];
  } {
    const { balances, failedAddresses } = accumulator;

    for (const response of responses) {
      if (!response.success) {
        failedAddresses.push(response.tokenAddress);
        continue;
      }

      const balance = response.balance ?? '0';
      const tokenInfo = tokenInfoMap.get(response.tokenAddress.toLowerCase());
      const decimals = tokenInfo?.decimals ?? 18;
      const formattedBalance = this.#formatBalance(balance, decimals);

      const chainIdDecimal = parseInt(chainId, 16);
      const isNative =
        response.tokenAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
      const assetId: CaipAssetType = isNative
        ? (`eip155:${chainIdDecimal}/slip44:60` as CaipAssetType)
        : (`eip155:${chainIdDecimal}/erc20:${response.tokenAddress.toLowerCase()}` as CaipAssetType);

      balances.push({
        assetId,
        accountId,
        chainId,
        balance,
        formattedBalance,
        decimals,
        timestamp,
      });
    }

    return { balances, failedAddresses };
  }

  #formatBalance(rawBalance: string, decimals: number): string {
    if (rawBalance === '0') {
      return '0';
    }

    try {
      const balanceBigInt = BigInt(rawBalance);
      const divisor = BigInt(10 ** decimals);

      const integerPart = balanceBigInt / divisor;
      const remainder = balanceBigInt % divisor;
      const fractionalStr = remainder.toString().padStart(decimals, '0');
      const trimmedFractional = fractionalStr.replace(/0+$/u, '');

      if (trimmedFractional === '') {
        return integerPart.toString();
      }

      return `${integerPart}.${trimmedFractional}`;
    } catch {
      return rawBalance;
    }
  }
}
