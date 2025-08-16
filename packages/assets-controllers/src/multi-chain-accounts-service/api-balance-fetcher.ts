import type { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import type { Web3Provider } from '@ethersproject/providers';
import {
  safelyExecute,
  toHex,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAccountAddress, Hex } from '@metamask/utils';
import BN from 'bn.js';

import { fetchMultiChainBalancesV4 } from './multi-chain-accounts';
import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from '../AssetsContractController';
import {
  accountAddressToCaipReference,
  reduceInBatchesSerially,
  SupportedStakedBalanceNetworks,
} from '../assetsUtil';
import { SUPPORTED_NETWORKS_ACCOUNTS_API_V4 } from '../constants';

// Maximum number of account addresses that can be sent to the accounts API in a single request
const ACCOUNTS_API_BATCH_SIZE = 50;

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

const checksum = (addr: string): ChecksumAddress =>
  toChecksumHexAddress(addr) as ChecksumAddress;

const toCaipAccount = (
  chainId: ChainIdHex,
  account: ChecksumAddress,
): CaipAccountAddress => accountAddressToCaipReference(chainId, account);

export type GetProviderFunction = (chainId: ChainIdHex) => Web3Provider;

export class AccountsApiBalanceFetcher implements BalanceFetcher {
  readonly #platform: 'extension' | 'mobile' = 'extension';

  readonly #getProvider?: GetProviderFunction;

  constructor(
    platform: 'extension' | 'mobile' = 'extension',
    getProvider?: GetProviderFunction,
  ) {
    this.#platform = platform;
    this.#getProvider = getProvider;
  }

  supports(chainId: ChainIdHex): boolean {
    return SUPPORTED_NETWORKS_ACCOUNTS_API_V4.includes(chainId);
  }

  async #fetchStakedBalances(
    addrs: CaipAccountAddress[],
  ): Promise<ProcessedBalance[]> {
    // Return empty array if no provider is available for blockchain calls
    if (!this.#getProvider) {
      return [];
    }

    const results: ProcessedBalance[] = [];

    // Group addresses by chain ID
    const addressesByChain: Record<ChainIdHex, ChecksumAddress[]> = {};

    for (const caipAddr of addrs) {
      const [, chainRef, address] = caipAddr.split(':');
      const chainId = toHex(parseInt(chainRef, 10)) as ChainIdHex;
      const checksumAddress = checksum(address);

      if (!addressesByChain[chainId]) {
        addressesByChain[chainId] = [];
      }
      addressesByChain[chainId].push(checksumAddress);
    }

    // Process each supported chain
    for (const [chainId, addresses] of Object.entries(addressesByChain)) {
      const chainIdHex = chainId as ChainIdHex;

      // Only fetch staked balance on supported networks (mainnet and hoodi)
      if (
        ![
          SupportedStakedBalanceNetworks.mainnet,
          SupportedStakedBalanceNetworks.hoodi,
        ].includes(chainIdHex as SupportedStakedBalanceNetworks)
      ) {
        continue;
      }

      // Only fetch staked balance if contract address exists
      if (!(chainIdHex in STAKING_CONTRACT_ADDRESS_BY_CHAINID)) {
        continue;
      }

      const contractAddress =
        STAKING_CONTRACT_ADDRESS_BY_CHAINID[
          chainIdHex as keyof typeof STAKING_CONTRACT_ADDRESS_BY_CHAINID
        ];
      const provider = this.#getProvider(chainIdHex);

      const abi = [
        {
          inputs: [
            { internalType: 'address', name: 'account', type: 'address' },
          ],
          name: 'getShares',
          outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
        {
          inputs: [
            { internalType: 'uint256', name: 'shares', type: 'uint256' },
          ],
          name: 'convertToAssets',
          outputs: [
            { internalType: 'uint256', name: 'assets', type: 'uint256' },
          ],
          stateMutability: 'view',
          type: 'function',
        },
      ];

      try {
        const contract = new Contract(contractAddress, abi, provider);

        // Get shares for each address
        for (const address of addresses) {
          try {
            const shares = await safelyExecute(() =>
              contract.getShares(address),
            );

            if (shares && (shares as BigNumber).gt(0)) {
              // Convert shares to assets (actual staked ETH amount)
              const assets = await safelyExecute(() =>
                contract.convertToAssets(shares),
              );

              if (assets) {
                results.push({
                  success: true,
                  value: new BN((assets as BigNumber).toString()),
                  account: address,
                  token: checksum(contractAddress) as ChecksumAddress,
                  chainId: chainIdHex,
                });
              }
            } else {
              // Return zero balance for accounts with no staked assets
              results.push({
                success: true,
                value: new BN('0'),
                account: address,
                token: checksum(contractAddress) as ChecksumAddress,
                chainId: chainIdHex,
              });
            }
          } catch (error) {
            // Log error and continue with next address
            console.error(
              `Error fetching staked balance for ${address}:`,
              error,
            );
            results.push({
              success: false,
              account: address,
              token: checksum(contractAddress) as ChecksumAddress,
              chainId: chainIdHex,
            });
          }
        }
      } catch (error) {
        console.error(
          `Error setting up staking contract for chain ${chainId}:`,
          error,
        );
      }
    }

    return results;
  }

  async #fetchBalances(addrs: CaipAccountAddress[]) {
    // If we have fewer than or equal to the batch size, make a single request
    if (addrs.length <= ACCOUNTS_API_BATCH_SIZE) {
      const { balances } = await fetchMultiChainBalancesV4(
        { accountAddresses: addrs },
        this.#platform,
      );
      return balances;
    }

    // Otherwise, batch the requests to respect the 50-element limit
    type BalanceData = Awaited<
      ReturnType<typeof fetchMultiChainBalancesV4>
    >['balances'][number];

    const allBalances = await reduceInBatchesSerially<
      CaipAccountAddress,
      BalanceData[]
    >({
      values: addrs,
      batchSize: ACCOUNTS_API_BATCH_SIZE,
      eachBatch: async (workingResult, batch) => {
        const { balances } = await fetchMultiChainBalancesV4(
          { accountAddresses: batch },
          this.#platform,
        );
        return [...(workingResult || []), ...balances];
      },
      initialResult: [],
    });

    return allBalances;
  }

  async fetch({
    chainIds,
    queryAllAccounts,
    selectedAccount,
    allAccounts,
  }: Parameters<BalanceFetcher['fetch']>[0]): Promise<ProcessedBalance[]> {
    const caipAddrs: CaipAccountAddress[] = [];

    for (const chainId of chainIds.filter((c) => this.supports(c))) {
      if (queryAllAccounts) {
        allAccounts.forEach((a) =>
          caipAddrs.push(toCaipAccount(chainId, a.address as ChecksumAddress)),
        );
      } else {
        caipAddrs.push(toCaipAccount(chainId, selectedAccount));
      }
    }

    if (!caipAddrs.length) {
      return [];
    }

    const [balances, stakedBalances] = await Promise.all([
      safelyExecute(() => this.#fetchBalances(caipAddrs)),
      this.#fetchStakedBalances(caipAddrs),
    ]);

    const results: ProcessedBalance[] = [];

    // Collect all unique addresses and chains from the CAIP addresses
    const addressChainMap = new Map<string, Set<ChainIdHex>>();
    caipAddrs.forEach((caipAddr) => {
      const [, chainRef, address] = caipAddr.split(':');
      const chainId = toHex(parseInt(chainRef, 10)) as ChainIdHex;
      const checksumAddress = checksum(address);

      if (!addressChainMap.has(checksumAddress)) {
        addressChainMap.set(checksumAddress, new Set());
      }
      addressChainMap.get(checksumAddress)?.add(chainId);
    });

    // Ensure native token entries exist for all addresses on all requested chains
    const ZERO_ADDRESS =
      '0x0000000000000000000000000000000000000000' as ChecksumAddress;
    const nativeBalancesFromAPI = new Map<string, BN>(); // key: `${address}-${chainId}`

    // Process regular API balances
    if (balances) {
      const apiBalances = balances.flatMap((b) => {
        const account = b.accountAddress?.split(':')[2] as ChecksumAddress;
        if (!account) {
          return [];
        }
        const token = checksum(b.address);
        const chainId = toHex(b.chainId) as ChainIdHex;

        let value: BN | undefined;
        try {
          value = new BN((parseFloat(b.balance) * 10 ** b.decimals).toFixed(0));
        } catch {
          value = undefined;
        }

        // Track native balances for later
        if (token === ZERO_ADDRESS && value !== undefined) {
          nativeBalancesFromAPI.set(`${account}-${chainId}`, value);
        }

        return [
          {
            success: value !== undefined,
            value,
            account,
            token,
            chainId,
          },
        ];
      });
      results.push(...apiBalances);
    }

    // Ensure native token entries exist for all addresses/chains, even if not returned by API
    addressChainMap.forEach((chains, address) => {
      chains.forEach((chainId) => {
        const key = `${address}-${chainId}`;
        const existingBalance = nativeBalancesFromAPI.get(key);

        if (!existingBalance) {
          // Add zero native balance entry if API didn't return one
          results.push({
            success: true,
            value: new BN('0'),
            account: address as ChecksumAddress,
            token: ZERO_ADDRESS,
            chainId,
          });
        }
      });
    });

    // Add staked balances
    results.push(...stakedBalances);

    return results;
  }
}
