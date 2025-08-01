import type { Web3Provider } from '@ethersproject/providers';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkClient } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import type BN from 'bn.js';

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
    this.#getProvider = getProvider;
    this.#getNetworkClient = getNetworkClient;
    this.#getTokensState = getTokensState;
  }

  supports(): boolean {
    return true; // fallback – supports every chain
  }

  async fetch({
    chainIds,
    queryAllAccounts,
    selectedAccount,
    allAccounts,
  }: Parameters<BalanceFetcher['fetch']>[0]): Promise<ProcessedBalance[]> {
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
      await this.#ensureFreshBlockData(chainId);

      const { tokenBalances } = await getTokenBalancesForMultipleAddresses(
        accountTokenGroups,
        chainId,
        provider,
        true, // include native
        false, // include staked
      );

      Object.entries(tokenBalances).forEach(([tokenAddr, balances]) => {
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

  if (queryAllAccounts) {
    allAccounts.forEach((a) => {
      pairs.push({
        accountAddress: a.address as ChecksumAddress,
        tokenAddress: ZERO_ADDRESS,
      });
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
