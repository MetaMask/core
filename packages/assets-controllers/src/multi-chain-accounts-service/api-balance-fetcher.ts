import type { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import type { Web3Provider } from '@ethersproject/providers';
import {
  safelyExecute,
  safelyExecuteWithTimeout,
  toHex,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { CaipAccountAddress, CaipChainId, Hex } from '@metamask/utils';
import { parseCaipChainId } from '@metamask/utils';
import BN from 'bn.js';

import { fetchMultiChainBalancesV4 } from './multi-chain-accounts';
import type { GetBalancesResponse } from './types';
import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from '../AssetsContractController';
import {
  accountAddressToCaipReference,
  reduceInBatchesSerially,
  SupportedStakedBalanceNetworks,
} from '../assetsUtil';
import { SUPPORTED_NETWORKS_ACCOUNTS_API_V4 } from '../constants';

// Maximum number of account addresses that can be sent to the accounts API in a single request
const ACCOUNTS_API_BATCH_SIZE = 20;

// Timeout for accounts API requests (10 seconds)
const ACCOUNTS_API_TIMEOUT_MS = 10_000;

export type ChainIdHex = Hex;
export type ChecksumAddress = Hex;

export type ProcessedBalance = {
  success: boolean;
  value?: BN;
  account: ChecksumAddress | string;
  token: ChecksumAddress;
  chainId: ChainIdHex;
};

export type BalanceFetchResult = {
  balances: ProcessedBalance[];
  unprocessedChainIds?: ChainIdHex[];
};

export type BalanceFetcher = {
  supports(chainId: ChainIdHex): boolean;
  fetch(input: {
    chainIds: ChainIdHex[];
    queryAllAccounts: boolean;
    selectedAccount: ChecksumAddress;
    allAccounts: InternalAccount[];
    jwtToken?: string;
  }): Promise<BalanceFetchResult>;
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

  readonly #getUserTokens?: () => {
    [accountId: ChecksumAddress]: {
      [chainId: ChainIdHex]: { [tokenAddress: ChecksumAddress]: unknown };
    };
  };

  constructor(
    platform: 'extension' | 'mobile' = 'extension',
    getProvider?: GetProviderFunction,
    getUserTokens?: () => {
      [account: ChecksumAddress]: {
        [chainId: ChainIdHex]: { [tokenAddress: ChecksumAddress]: unknown };
      };
    },
  ) {
    this.#platform = platform;
    this.#getProvider = getProvider;
    this.#getUserTokens = getUserTokens;
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
      const chainId = toHex(parseInt(chainRef, 10));
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
          SupportedStakedBalanceNetworks.Mainnet,
          SupportedStakedBalanceNetworks.Hoodi,
        ].includes(chainIdHex as SupportedStakedBalanceNetworks)
      ) {
        continue;
      }

      // Only fetch staked balance if contract address exists
      if (!(chainIdHex in STAKING_CONTRACT_ADDRESS_BY_CHAINID)) {
        continue;
      }

      const contractAddress = STAKING_CONTRACT_ADDRESS_BY_CHAINID[chainIdHex];
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
                  token: checksum(contractAddress),
                  chainId: chainIdHex,
                });
              }
            } else {
              // Return zero balance for accounts with no staked assets
              results.push({
                success: true,
                value: new BN('0'),
                account: address,
                token: checksum(contractAddress),
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
              token: checksum(contractAddress),
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

  async #fetchBalances(addrs: CaipAccountAddress[], jwtToken?: string) {
    // If we have fewer than or equal to the batch size, make a single request
    if (addrs.length <= ACCOUNTS_API_BATCH_SIZE) {
      return await fetchMultiChainBalancesV4(
        { accountAddresses: addrs },
        this.#platform,
        jwtToken,
      );
    }

    // Otherwise, batch the requests to respect the 50-element limit
    type BalanceData = Awaited<
      ReturnType<typeof fetchMultiChainBalancesV4>
    >['balances'][number];

    type ResponseData = Awaited<ReturnType<typeof fetchMultiChainBalancesV4>>;

    const allUnprocessedNetworks = new Set<number | string>();
    const allBalances = await reduceInBatchesSerially<
      CaipAccountAddress,
      BalanceData[]
    >({
      values: addrs,
      batchSize: ACCOUNTS_API_BATCH_SIZE,
      eachBatch: async (workingResult, batch) => {
        const response = await fetchMultiChainBalancesV4(
          { accountAddresses: batch },
          this.#platform,
          jwtToken,
        );
        // Collect unprocessed networks from each batch
        if (response.unprocessedNetworks) {
          response.unprocessedNetworks.forEach((network) =>
            allUnprocessedNetworks.add(network),
          );
        }
        return [...(workingResult || []), ...response.balances];
      },
      initialResult: [],
    });

    return {
      balances: allBalances,
      unprocessedNetworks: Array.from(allUnprocessedNetworks),
    } as ResponseData;
  }

  async fetch({
    chainIds,
    queryAllAccounts,
    selectedAccount,
    allAccounts,
    jwtToken,
  }: Parameters<BalanceFetcher['fetch']>[0]): Promise<BalanceFetchResult> {
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
      return { balances: [] };
    }

    // Let errors propagate to TokenBalancesController for RPC fallback
    // Use timeout to prevent hanging API calls (30 seconds)
    const apiResponse = await safelyExecuteWithTimeout(
      () => this.#fetchBalances(caipAddrs, jwtToken),
      false, // don't log error here, let it propagate
      ACCOUNTS_API_TIMEOUT_MS,
    );

    // If API call timed out or failed, throw error to trigger RPC fallback
    if (!apiResponse) {
      throw new Error('Accounts API request timed out or failed');
    }

    // Extract unprocessed networks and convert to hex chain IDs
    // V4 API returns CAIP chain IDs like 'eip155:1329', need to parse them
    // V2 API returns decimal numbers, handle both cases
    const unprocessedChainIds: ChainIdHex[] | undefined = apiResponse
      .unprocessedNetworks?.length
      ? apiResponse.unprocessedNetworks.map((network) => {
          if (typeof network === 'string') {
            // CAIP chain ID format: 'eip155:1329'
            return toHex(parseCaipChainId(network as CaipChainId).reference);
          }
          // Decimal number format
          return toHex(network);
        })
      : undefined;

    const stakedBalances = await this.#fetchStakedBalances(caipAddrs);

    const results: ProcessedBalance[] = [];

    // Collect all unique addresses and chains from the CAIP addresses
    const addressChainMap = new Map<string, Set<ChainIdHex>>();
    caipAddrs.forEach((caipAddr) => {
      const [, chainRef, address] = caipAddr.split(':');
      const chainId = toHex(parseInt(chainRef, 10));
      const checksumAddress = checksum(address);

      if (!addressChainMap.has(checksumAddress)) {
        addressChainMap.set(checksumAddress, new Set());
      }
      addressChainMap.get(checksumAddress)?.add(chainId);
    });

    // Ensure native token entries exist for all addresses on all requested chains
    const ZERO_ADDRESS =
      '0x0000000000000000000000000000000000000000' as ChecksumAddress;
    const nativeBalancesFromAPI = new Map<string, BN>(); // key: `${accountAddress}-${chainId}`
    const nonNativeBalancesFromAPI = new Map<string, BN>(); // key: `${accountAddress}-${tokenAddress}-${chainId}`

    // Process regular API balances
    if (apiResponse.balances) {
      const apiBalances = apiResponse.balances.flatMap(
        (b: GetBalancesResponse['balances'][number]) => {
          const addressPart = b.accountAddress?.split(':')[2];
          if (!addressPart) {
            return [];
          }
          const account = checksum(addressPart);
          const token = checksum(b.address);
          // Use original address for zero address tokens, checksummed for others
          // TODO: this is a hack to get the correct account address type but needs to be fixed
          // by mgrating tokenBalancesController to checksum addresses
          const finalAccount: ChecksumAddress | string =
            token === ZERO_ADDRESS ? account : addressPart;
          const chainId = toHex(b.chainId);

          let value: BN | undefined;
          try {
            // Convert string balance to BN avoiding floating point precision issues
            const { balance: balanceStr, decimals } = b;

            // Split the balance string into integer and decimal parts
            const [integerPart = '0', decimalPart = ''] = balanceStr.split('.');

            // Pad or truncate decimal part to match token decimals
            const paddedDecimalPart = decimalPart
              .padEnd(decimals, '0')
              .slice(0, decimals);

            // Combine and create BN
            const fullIntegerStr = integerPart + paddedDecimalPart;
            value = new BN(fullIntegerStr);
          } catch {
            value = undefined;
          }

          // Track native balances for later
          if (token === ZERO_ADDRESS && value !== undefined) {
            nativeBalancesFromAPI.set(`${finalAccount}-${chainId}`, value);
          }

          if (token !== ZERO_ADDRESS && value !== undefined) {
            nonNativeBalancesFromAPI.set(
              `${finalAccount.toLowerCase()}-${token.toLowerCase()}-${chainId}`,
              value,
            );
          }

          return [
            {
              success: value !== undefined,
              value,
              account: finalAccount,
              token,
              chainId,
            },
          ];
        },
      );
      results.push(...apiBalances);
    }

    // Add zero native balance entries for addresses that API didn't return
    addressChainMap.forEach((chains, address) => {
      chains.forEach((chainId) => {
        const key = `${address}-${chainId}`;
        const existingBalance = nativeBalancesFromAPI.get(key);
        const isChainIncludedInRequest = chainIds.includes(chainId);
        const isChainSupported = this.supports(chainId);
        const shouldZeroOutBalance =
          !existingBalance && isChainIncludedInRequest && isChainSupported;

        if (shouldZeroOutBalance) {
          // Add zero native balance entry if API succeeded but didn't return one
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

    // Add zero erc-20 balance entries for addresses that API didn't return
    if (this.#getUserTokens) {
      const userTokens = this.#getUserTokens();
      Object.entries(userTokens).forEach(([account, chains]) => {
        Object.entries(chains).forEach(([chainId, tokens]) => {
          Object.entries(tokens).forEach(([tokenAddress]) => {
            const tokenLowerCase = tokenAddress.toLowerCase();
            const key = `${account.toLowerCase()}-${tokenLowerCase}-${chainId}`;
            const isERC = tokenAddress !== ZERO_ADDRESS;
            const existingBalance = nonNativeBalancesFromAPI.get(key);
            const isChainIncludedInRequest = chainIds.includes(chainId as Hex);
            const isChainSupported = this.supports(chainId as Hex);
            const shouldZeroOutBalance =
              !existingBalance && isChainIncludedInRequest && isChainSupported;

            if (isERC && shouldZeroOutBalance) {
              results.push({
                success: true,
                value: new BN('0'),
                account: account as ChecksumAddress,
                token: tokenLowerCase as ChecksumAddress,
                chainId: chainId as ChainIdHex,
              });
            }
          });
        });
      });
    }

    // Add staked balances
    results.push(...stakedBalances);

    return {
      balances: results,
      unprocessedChainIds,
    };
  }
}
