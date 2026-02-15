import { Interface } from '@ethersproject/abi';
import { Web3Provider } from '@ethersproject/providers';
import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';

import type { Address, AccountId, ChainId } from '../types';
import { chainIdToHex, weiToHumanReadable } from '../utils';

export type StakedBalancePollingInput = {
  /** Chain ID (hex format, e.g. 0x1) */
  chainId: ChainId;
  /** Account ID */
  accountId: AccountId;
  /** Account address */
  accountAddress: Address;
};

/** Human-readable staked balance (e.g. "1.5" for 1.5 ETH). */
export type StakedBalance = {
  amount: string;
};

/** Result reported via the update callback. */
export type StakedBalanceFetchResult = {
  /** Account ID (UUID). */
  accountId: AccountId;
  /** Hex chain ID. */
  chainId: ChainId;
  /** Human-readable staked balance. */
  balance: StakedBalance;
};

/**
 * Callback type for staked balance updates.
 */
export type OnStakedBalanceUpdateCallback = (
  result: StakedBalanceFetchResult,
) => void;

/** Staking contract addresses by chain ID (hex). Same as AccountTrackerController / assets-controllers. */
const STAKING_CONTRACT_ADDRESS_BY_CHAINID: Record<string, string> = {
  '0x1': '0x4fef9d741011476750a243ac70b9789a63dd47df', // Mainnet
  '0x88bb0': '0xe96ac18cfe5a7af8fe1fe7bc37ff110d88bc67ff', // Hoodi
};

/** Staking contract ABI: getShares(account) and convertToAssets(shares). */
const STAKING_CONTRACT_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'getShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const STAKING_INTERFACE = new Interface(STAKING_CONTRACT_ABI);

const STAKING_DECIMALS = 18;

export type StakedBalanceFetcherConfig = {
  /** Polling interval in ms (default: 180s) */
  pollingInterval?: number;
  /** Returns the network provider for the given chain. Required for fetchStakedBalance. */
  getNetworkProvider?: (chainId: ChainId) => Web3Provider | undefined;
};

const DEFAULT_STAKED_BALANCE_INTERVAL = 180_000; // 3 minutes

/**
 * Returns the set of hex chain IDs that have a known staking contract.
 *
 * @returns Array of hex chain IDs.
 */
export function getSupportedStakingChainIds(): string[] {
  return Object.keys(STAKING_CONTRACT_ADDRESS_BY_CHAINID);
}

/**
 * Returns the staking contract address for a chain, or undefined if not supported.
 *
 * @param hexChainId - Hex chain ID (e.g. "0x1").
 * @returns Contract address (checksummed as stored) or undefined.
 */
export function getStakingContractAddress(
  hexChainId: string,
): string | undefined {
  return STAKING_CONTRACT_ADDRESS_BY_CHAINID[hexChainId];
}

export class StakedBalanceFetcher extends StaticIntervalPollingControllerOnly<StakedBalancePollingInput>() {
  readonly #providerGetter?: (chainId: ChainId) => Web3Provider | undefined;

  #onStakedBalanceUpdate: OnStakedBalanceUpdateCallback | undefined;

  constructor(config?: StakedBalanceFetcherConfig) {
    super();
    this.#providerGetter = config?.getNetworkProvider;

    this.setIntervalLength(
      config?.pollingInterval ?? DEFAULT_STAKED_BALANCE_INTERVAL,
    );
  }

  /**
   * Register a callback that is invoked after every successful poll with
   * a non-zero staked balance.
   *
   * @param callback - The callback to invoke.
   */
  setOnStakedBalanceUpdate(callback: OnStakedBalanceUpdateCallback): void {
    this.#onStakedBalanceUpdate = callback;
  }

  async _executePoll(input: StakedBalancePollingInput): Promise<void> {
    const result = await this.fetchStakedBalance(input);

    if (this.#onStakedBalanceUpdate && result.amount !== '0') {
      this.#onStakedBalanceUpdate({
        accountId: input.accountId,
        chainId: input.chainId,
        balance: result,
      });
    }
  }

  /**
   * Fetches the staked balance for an account on a chain using the same
   * staking contract as AccountTrackerController (getShares then convertToAssets).
   * Returns a human-readable amount string (e.g. "1.5" for 1.5 ETH).
   * When no provider is configured or the getter returns undefined, returns zero
   * so that polling does not throw (e.g. in tests or when provider is not yet available).
   *
   * @param input - Chain, account ID, and address to query.
   * @returns Human-readable staked balance (amount string).
   */
  async fetchStakedBalance(
    input: StakedBalancePollingInput,
  ): Promise<StakedBalance> {
    const { chainId, accountAddress } = input;
    const provider = this.#providerGetter?.(chainId);
    if (!provider) {
      // No provider (e.g. not yet available or not configured). Skip this cycle;
      // polling will run again on the next interval.
      return { amount: '0' };
    }
    const hexChainId = chainIdToHex(chainId);
    const contractAddress = STAKING_CONTRACT_ADDRESS_BY_CHAINID[hexChainId];

    if (!contractAddress) {
      return { amount: '0' };
    }

    try {
      const sharesCalldata = STAKING_INTERFACE.encodeFunctionData('getShares', [
        accountAddress,
      ]);
      const sharesResult = await provider.call({
        to: contractAddress,
        data: sharesCalldata,
      });
      const sharesRaw = STAKING_INTERFACE.decodeFunctionResult(
        'getShares',
        sharesResult,
      )[0];
      const sharesBigNum = BigInt(sharesRaw.toString());

      if (sharesBigNum === 0n) {
        return { amount: '0' };
      }

      const assetsCalldata = STAKING_INTERFACE.encodeFunctionData(
        'convertToAssets',
        [sharesBigNum],
      );
      const assetsResult = await provider.call({
        to: contractAddress,
        data: assetsCalldata,
      });
      const assetsRaw = STAKING_INTERFACE.decodeFunctionResult(
        'convertToAssets',
        assetsResult,
      )[0];
      const assetsWei = BigInt(assetsRaw.toString());

      const amount = weiToHumanReadable(assetsWei.toString(), STAKING_DECIMALS);
      return { amount };
    } catch {
      return { amount: '0' };
    }
  }
}
