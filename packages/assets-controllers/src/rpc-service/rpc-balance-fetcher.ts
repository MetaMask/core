import type { Web3Provider } from '@ethersproject/providers';
import {
  toChecksumHexAddress,
  safelyExecuteWithTimeout,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkClient } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';

import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from '../AssetsContractController';
import { shouldIncludeNativeToken } from '../constants';
import type { UnprocessedTokens } from '../multi-chain-accounts-service/api-balance-fetcher';
import { getTokenBalancesForMultipleAddresses } from '../multicall';
import type { TokensControllerState } from '../TokensController';

const RPC_TIMEOUT_MS = 30000;

export type ChainIdHex = Hex;
export type ChecksumAddress = Hex;

export type ProcessedBalance = {
  success: boolean;
  value?: BN;
  account: ChecksumAddress;
  token: ChecksumAddress;
  chainId: ChainIdHex;
};

export type BalanceFetchResult = {
  balances: ProcessedBalance[];
  unprocessedChainIds?: ChainIdHex[];
  unprocessedTokens?: UnprocessedTokens;
};

export type BalanceFetcher = {
  supports(chainId: ChainIdHex): boolean;
  fetch(input: {
    chainIds: ChainIdHex[];
    queryAllAccounts: boolean;
    selectedAccount: ChecksumAddress;
    allAccounts: InternalAccount[];
    unprocessedTokens?: UnprocessedTokens;
  }): Promise<BalanceFetchResult>;
};

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as ChecksumAddress;

const checksum = (addr: string): ChecksumAddress =>
  toChecksumHexAddress(addr) as ChecksumAddress;

export class RpcBalanceFetcher implements BalanceFetcher {
  readonly #getProvider: (chainId: ChainIdHex) => Web3Provider;

  readonly #getNetworkClient: (chainId: ChainIdHex) => NetworkClient;

  readonly #getTokensState: () => {
    allTokens: TokensControllerState['allTokens'];
    allDetectedTokens: TokensControllerState['allDetectedTokens'];
  };

  constructor(
    getProvider: (chainId: ChainIdHex) => Web3Provider,
    getNetworkClient: (chainId: ChainIdHex) => NetworkClient,
    getTokensState: () => {
      allTokens: TokensControllerState['allTokens'];
      allDetectedTokens: TokensControllerState['allDetectedTokens'];
    },
  ) {
    this.#getProvider = getProvider;
    this.#getNetworkClient = getNetworkClient;
    this.#getTokensState = getTokensState;
  }

  supports(): boolean {
    return true; // fallback – supports every chain
  }

  #getStakingContractAddress(chainId: ChainIdHex): string | undefined {
    return STAKING_CONTRACT_ADDRESS_BY_CHAINID[chainId];
  }

  async fetch({
    chainIds,
    queryAllAccounts,
    selectedAccount,
    allAccounts,
    unprocessedTokens,
  }: Parameters<BalanceFetcher['fetch']>[0]): Promise<BalanceFetchResult> {
    // Process all chains in parallel for better performance
    const chainProcessingPromises = chainIds.map(async (chainId) => {
      // if there are unprocessed tokens for a chain, it means the chain was partially processed.
      // because of this, we need to build distinct account <-> token groups to process
      const hasUnprocessedTokensForChain = queryAllAccounts
        ? Object.values(unprocessedTokens ?? {}).some((chainMap) =>
            Boolean(chainMap[chainId] && chainMap[chainId].length > 0),
          )
        : Boolean(
            unprocessedTokens?.[selectedAccount.toLowerCase()]?.[chainId] &&
            unprocessedTokens[selectedAccount.toLowerCase()][chainId].length >
              0,
          );

      const tokensState = this.#getTokensState();
      const { accountTokenGroups, includeNativeAndStaked } =
        hasUnprocessedTokensForChain
          ? buildUnprocessedAccountTokenGroupsStatic(
              chainId,
              queryAllAccounts,
              selectedAccount,
              unprocessedTokens as UnprocessedTokens,
            )
          : buildAccountTokenGroupsStatic(
              chainId,
              queryAllAccounts,
              selectedAccount,
              allAccounts,
              tokensState.allTokens,
              tokensState.allDetectedTokens,
            );

      if (!accountTokenGroups.length) {
        return [];
      }

      const provider = this.#getProvider(chainId);
      await this.#ensureFreshBlockData(chainId);

      // Skip native token fetching for chains that return arbitrary large numbers
      const includeNative = shouldIncludeNativeToken(chainId);

      const balanceResult = await safelyExecuteWithTimeout(
        async () => {
          return await getTokenBalancesForMultipleAddresses(
            accountTokenGroups,
            chainId,
            provider,
            // Skip native for Tempo chains
            includeNative && includeNativeAndStaked,
            includeNativeAndStaked,
          );
        },
        true,
        RPC_TIMEOUT_MS,
      );

      // If timeout or error occurred, return empty array for this chain
      if (!balanceResult) {
        return [];
      }

      const { tokenBalances, stakedBalances } = balanceResult;
      const chainResults: ProcessedBalance[] = [];

      if (includeNative && includeNativeAndStaked) {
        // Add native token entries for all addresses being processed
        const allAddressesForNative = new Set<string>();
        accountTokenGroups.forEach((group) => {
          allAddressesForNative.add(group.accountAddress);
        });

        // Ensure native token entries exist for all addresses
        allAddressesForNative.forEach((address) => {
          const nativeBalance = tokenBalances[ZERO_ADDRESS]?.[address] || null;
          chainResults.push({
            success: true,
            value: nativeBalance || new BN('0'),
            account: address as ChecksumAddress,
            token: ZERO_ADDRESS,
            chainId,
          });
        });
      }

      // Add other token balances
      Object.entries(tokenBalances).forEach(([tokenAddr, balances]) => {
        // Skip native token since we handled it explicitly above
        if (tokenAddr === ZERO_ADDRESS) {
          return;
        }
        Object.entries(balances).forEach(([acct, bn]) => {
          chainResults.push({
            success: bn !== null,
            value: bn,
            account: acct as ChecksumAddress,
            token: checksum(tokenAddr),
            chainId,
          });
        });
      });

      // Add staked balances for all addresses being processed
      const stakingContractAddress = this.#getStakingContractAddress(chainId);
      if (includeNativeAndStaked && stakingContractAddress) {
        // Get all unique addresses being processed for this chain
        const allAddresses = new Set<string>();
        accountTokenGroups.forEach((group) => {
          allAddresses.add(group.accountAddress);
        });

        // Add staked balance entry for each address
        const checksummedStakingAddress = checksum(stakingContractAddress);
        allAddresses.forEach((address) => {
          const stakedBalance = stakedBalances?.[address] ?? null;
          chainResults.push({
            success: true,
            value: stakedBalance ?? new BN('0'),
            account: address as ChecksumAddress,
            token: checksummedStakingAddress,
            chainId,
          });
        });
      }

      return chainResults;
    });

    // Wait for all chains to complete (or fail) and collect results
    const chainResultsArray = await Promise.allSettled(chainProcessingPromises);
    const results: ProcessedBalance[] = [];

    chainResultsArray.forEach((chainResult) => {
      if (chainResult.status === 'fulfilled') {
        results.push(...chainResult.value);
      }
    });

    return { balances: results };
  }

  /**
   * Ensures that the block tracker has the latest block data before performing multicall operations.
   * This is a temporary fix to ensure that the block number is up to date.
   *
   * @param chainId - The chain id to update block data for.
   */
  async #ensureFreshBlockData(chainId: Hex): Promise<void> {
    // Force fresh block data before multicall
    // TODO: This is a temporary fix to ensure that the block number is up to date.
    // We should remove this once we have a better solution for this on the block tracker controller.
    const networkClient = this.#getNetworkClient(chainId);
    await networkClient.blockTracker?.checkForLatestBlock?.();
  }
}

type AccountTokenGroup = {
  accountAddress: ChecksumAddress;
  tokenAddresses: ChecksumAddress[];
};

function buildAccountTokenGroups(
  queryAllAccounts: boolean,
  selectedAccount: ChecksumAddress,
  accountTokenMap: { [account: string]: string[] },
): AccountTokenGroup[] {
  const pairs: {
    accountAddress: ChecksumAddress;
    tokenAddress: ChecksumAddress;
  }[] = [];

  const add = ([account, tokens]: [string, string[]]): void => {
    const checksumAccount = checksum(account);
    const shouldInclude =
      queryAllAccounts || checksumAccount === checksum(selectedAccount);
    if (!shouldInclude) {
      return;
    }
    tokens.forEach((token: string) =>
      pairs.push({
        accountAddress: account as ChecksumAddress,
        tokenAddress: checksum(token),
      }),
    );
  };

  Object.entries(accountTokenMap).forEach(add);

  // group by account
  const map = new Map<ChecksumAddress, ChecksumAddress[]>();
  pairs.forEach(({ accountAddress, tokenAddress }) => {
    if (!map.has(accountAddress)) {
      map.set(accountAddress, []);
    }
    const tokens = map.get(accountAddress);
    if (tokens) {
      tokens.push(tokenAddress);
    }
  });

  return Array.from(map.entries()).map(([accountAddress, tokenAddresses]) => ({
    accountAddress,
    tokenAddresses,
  }));
}

/**
 * Merges imported & detected tokens for the requested chain and returns a list
 * of `{ accountAddress, tokenAddresses[] }` suitable for getTokenBalancesForMultipleAddresses.
 *
 * @param chainId - The chain ID to build account token groups for
 * @param queryAllAccounts - Whether to query all accounts or just the selected one
 * @param selectedAccount - The currently selected account
 * @param allAccounts - All available accounts
 * @param allTokens - All tokens from TokensController
 * @param allDetectedTokens - All detected tokens from TokensController
 * @returns Array of account/token groups for multicall
 */
function buildAccountTokenGroupsStatic(
  chainId: ChainIdHex,
  queryAllAccounts: boolean,
  selectedAccount: ChecksumAddress,
  allAccounts: InternalAccount[],
  allTokens: TokensControllerState['allTokens'],
  allDetectedTokens: TokensControllerState['allDetectedTokens'],
): {
  accountTokenGroups: AccountTokenGroup[];
  includeNativeAndStaked: true;
} {
  const accountTokenMap: { [account: string]: string[] } = {};

  // Add all tokens
  Object.entries(allTokens[chainId] ?? {}).forEach(([account, tokens]) => {
    accountTokenMap[account] = tokens.map((token) => token.address);
  });

  // Add all detected tokens
  Object.entries(allDetectedTokens[chainId] ?? {}).forEach(
    ([account, tokens]) => {
      if (!accountTokenMap[account]) {
        accountTokenMap[account] = [];
      }
      accountTokenMap[account] = Array.from(
        new Set([
          ...accountTokenMap[account],
          ...tokens.map((token) => token.address),
        ]),
      );
    },
  );

  // Add native tokens
  if (queryAllAccounts) {
    allAccounts.forEach((a) => {
      accountTokenMap[a.address] ??= [];
      accountTokenMap[a.address].push(ZERO_ADDRESS);
    });
  } else {
    accountTokenMap[selectedAccount] ??= [];
    accountTokenMap[selectedAccount].push(ZERO_ADDRESS);
  }

  return {
    accountTokenGroups: buildAccountTokenGroups(
      queryAllAccounts,
      selectedAccount,
      accountTokenMap,
    ),
    includeNativeAndStaked: true,
  };
}

function buildUnprocessedAccountTokenGroupsStatic(
  chainId: ChainIdHex,
  queryAllAccounts: boolean,
  selectedAccount: ChecksumAddress,
  unprocessedTokens: UnprocessedTokens,
): {
  accountTokenGroups: AccountTokenGroup[];
  includeNativeAndStaked: false;
} {
  const accountTokenMap: { [account: string]: string[] } = {};
  Object.entries(unprocessedTokens).forEach(([account, tokens]) => {
    const lowercaseAccount = account.toLowerCase();
    if (
      queryAllAccounts ||
      lowercaseAccount === selectedAccount.toLowerCase()
    ) {
      const tokenAddresses =
        tokens?.[chainId]?.map((tokenAddress) => tokenAddress.toLowerCase()) ??
        [];
      accountTokenMap[lowercaseAccount] = tokenAddresses;
    }
  });

  return {
    accountTokenGroups: buildAccountTokenGroups(
      queryAllAccounts,
      selectedAccount,
      accountTokenMap,
    ),
    includeNativeAndStaked: false,
  };
}
