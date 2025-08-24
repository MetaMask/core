import type { Web3Provider } from '@ethersproject/providers';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkClient } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';

import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from '../AssetsContractController';
import { getTokenBalancesForMultipleAddresses } from '../multicall';
import type { TokensControllerState } from '../TokensController';

export type ChainIdHex = Hex;
export type ChecksumAddress = Hex;

export type ProcessedBalance = {
  success: boolean;
  value?: BN;
  account: ChecksumAddress;
  token: ChecksumAddress;
  chainId: ChainIdHex;
};

export type BalanceFetcher = {
  supports(chainId: ChainIdHex): boolean;
  fetch(input: {
    chainIds: ChainIdHex[];
    queryAllAccounts: boolean;
    selectedAccount: ChecksumAddress;
    allAccounts: InternalAccount[];
  }): Promise<ProcessedBalance[]>;
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
    console.log('RpcBalanceFetcher constructor ---------------');
    this.#getProvider = getProvider;
    this.#getNetworkClient = getNetworkClient;
    this.#getTokensState = getTokensState;
  }

  supports(): boolean {
    return true; // fallback – supports every chain
  }

  #getStakingContractAddress(chainId: ChainIdHex): string | undefined {
    return STAKING_CONTRACT_ADDRESS_BY_CHAINID[
      chainId as keyof typeof STAKING_CONTRACT_ADDRESS_BY_CHAINID
    ];
  }

  async fetch({
    chainIds,
    queryAllAccounts,
    selectedAccount,
    allAccounts,
  }: Parameters<BalanceFetcher['fetch']>[0]): Promise<ProcessedBalance[]> {
    console.log('chainIds ---------------', chainIds);
    const results: ProcessedBalance[] = [];

    for (const chainId of chainIds) {
      const tokensState = this.#getTokensState();
      const accountTokenGroups = buildAccountTokenGroupsStatic(
        chainId,
        queryAllAccounts,
        selectedAccount,
        allAccounts,
        tokensState.allTokens,
        tokensState.allDetectedTokens,
      );
      if (!accountTokenGroups.length) {
        continue;
      }

      const provider = this.#getProvider(chainId);
      console.log('provider ---------------', provider);
      await this.#ensureFreshBlockData(chainId);

      const { tokenBalances, stakedBalances } =
        await getTokenBalancesForMultipleAddresses(
          accountTokenGroups,
          chainId,
          provider,
          true, // include native
          true, // include staked
        );

      // Add native token entries for all addresses being processed
      const allAddressesForNative = new Set<string>();
      accountTokenGroups.forEach((group) => {
        allAddressesForNative.add(group.accountAddress);
      });

      // Ensure native token entries exist for all addresses
      allAddressesForNative.forEach((address) => {
        const nativeBalance = tokenBalances[ZERO_ADDRESS]?.[address] || null;
        results.push({
          success: true,
          value: nativeBalance ? (nativeBalance as BN) : new BN('0'),
          account: address as ChecksumAddress,
          token: ZERO_ADDRESS,
          chainId,
        });
      });

      // Add other token balances
      Object.entries(tokenBalances).forEach(([tokenAddr, balances]) => {
        // Skip native token since we handled it explicitly above
        if (tokenAddr === ZERO_ADDRESS) {
          return;
        }
        Object.entries(balances).forEach(([acct, bn]) => {
          results.push({
            success: bn !== null,
            value: bn as BN,
            account: acct as ChecksumAddress,
            token: checksum(tokenAddr),
            chainId,
          });
        });
      });

      // Add staked balances for all addresses being processed
      const stakingContractAddress = this.#getStakingContractAddress(chainId);
      if (stakingContractAddress) {
        // Get all unique addresses being processed for this chain
        const allAddresses = new Set<string>();
        accountTokenGroups.forEach((group) => {
          allAddresses.add(group.accountAddress);
        });

        // Add staked balance entry for each address
        const checksummedStakingAddress = checksum(stakingContractAddress);
        allAddresses.forEach((address) => {
          const stakedBalance = stakedBalances?.[address] || null;
          results.push({
            success: true,
            value: stakedBalance ? (stakedBalance as BN) : new BN('0'),
            account: address as ChecksumAddress,
            token: checksummedStakingAddress,
            chainId,
          });
        });
      }
    }

    return results;
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
): { accountAddress: ChecksumAddress; tokenAddresses: ChecksumAddress[] }[] {
  const pairs: {
    accountAddress: ChecksumAddress;
    tokenAddress: ChecksumAddress;
  }[] = [];

  const add = ([account, tokens]: [string, unknown[]]) => {
    const shouldInclude =
      queryAllAccounts || checksum(account) === checksum(selectedAccount);
    if (!shouldInclude) {
      return;
    }
    (tokens as unknown[]).forEach((t: unknown) =>
      pairs.push({
        accountAddress: account as ChecksumAddress,
        tokenAddress: checksum((t as { address: string }).address),
      }),
    );
  };

  Object.entries(allTokens[chainId] ?? {}).forEach(
    add as (entry: [string, unknown]) => void,
  );
  Object.entries(allDetectedTokens[chainId] ?? {}).forEach(
    add as (entry: [string, unknown]) => void,
  );

  // Always include native token for relevant accounts
  if (queryAllAccounts) {
    allAccounts.forEach((a) => {
      pairs.push({
        accountAddress: a.address as ChecksumAddress,
        tokenAddress: ZERO_ADDRESS,
      });
    });
  } else {
    pairs.push({
      accountAddress: selectedAccount,
      tokenAddress: ZERO_ADDRESS,
    });
  }

  if (!pairs.length) {
    return [];
  }

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
