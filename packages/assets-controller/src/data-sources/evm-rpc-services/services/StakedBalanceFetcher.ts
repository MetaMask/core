import { Interface } from '@ethersproject/abi';
import { Web3Provider } from '@ethersproject/providers';
import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';

import type { Address, AccountId, ChainId } from '../types';
import {
  getStakingContractAddress,
  getSupportedStakingChainIds,
  isStakingContractAssetId,
  weiToHumanReadable,
} from '../utils';

export {
  getStakingContractAddress,
  getSupportedStakingChainIds,
  isStakingContractAssetId,
};

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

export const STAKING_INTERFACE = new Interface(STAKING_CONTRACT_ABI);

const STAKING_DECIMALS = 18;

export type StakedBalanceFetcherConfig = {
  /** Polling interval in ms (default: 180s) */
  pollingInterval?: number;
  /** Returns the network provider for the given chain. Required for fetchStakedBalance. */
  getNetworkProvider?: (chainId: ChainId) => Web3Provider | undefined;
};

const DEFAULT_STAKED_BALANCE_INTERVAL = 180_000; // 3 minutes

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
   * the staked balance (including zero). Zero is reported so that merged
   * updates can clear prior non-zero state.
   *
   * @param callback - The callback to invoke.
   */
  setOnStakedBalanceUpdate(callback: OnStakedBalanceUpdateCallback): void {
    this.#onStakedBalanceUpdate = callback;
  }

  async _executePoll(input: StakedBalancePollingInput): Promise<void> {
    let result: StakedBalance;
    try {
      result = await this.fetchStakedBalance(input);
    } catch {
      // Do not push an update on provider/RPC failure; otherwise we would
      // overwrite existing non-zero staked balances with zero in state.
      return;
    }

    if (this.#onStakedBalanceUpdate) {
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
   * Throws when no provider is available or when the RPC/contract call fails, so
   * callers do not persist a false zero and overwrite existing balances.
   *
   * @param input - Chain, account ID, and address to query.
   * @returns Human-readable staked balance (amount string).
   * @throws When provider is missing or when getShares/convertToAssets fails.
   */
  async fetchStakedBalance(
    input: StakedBalancePollingInput,
  ): Promise<StakedBalance> {
    const { chainId, accountAddress } = input;
    const provider = this.#providerGetter?.(chainId);
    if (!provider) {
      throw new Error('StakedBalanceFetcher: no provider available for chain');
    }
    const contractAddress = getStakingContractAddress(chainId);

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

      const amount = weiToHumanReadable(assetsWei, STAKING_DECIMALS);
      return { amount };
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('StakedBalanceFetcher: failed to fetch staked balance');
    }
  }
}
