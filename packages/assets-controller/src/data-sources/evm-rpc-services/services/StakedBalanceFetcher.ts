import { Interface } from '@ethersproject/abi';
import { Web3Provider } from '@ethersproject/providers';
import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';

import { Address, AccountId, ChainId } from '../types';
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

export class StakedBalanceFetcher extends StaticIntervalPollingControllerOnly<StakedBalancePollingInput>() {
  readonly #providerGetter?: (chainId: ChainId) => Web3Provider | undefined;

  constructor(config?: StakedBalanceFetcherConfig) {
    super();
    this.#providerGetter = config?.getNetworkProvider;

    this.setIntervalLength(
      config?.pollingInterval ?? DEFAULT_STAKED_BALANCE_INTERVAL,
    );
  }

  async _executePoll(input: StakedBalancePollingInput): Promise<void> {
    await this.fetchStakedBalance(input);
    // Optional: push staked balance to state via callback when wired
  }

  /**
   * Returns the Web3Provider for the given chain.
   *
   * @param chainId - Chain ID (CAIP-2 or hex).
   * @returns The provider for the chain.
   */
  #getNetworkProvider(chainId: ChainId): Web3Provider {
    const getter = this.#providerGetter;
    if (!getter) {
      throw new Error(
        `StakedBalanceFetcher: no provider for chain ${chainId}. Set getNetworkProvider in config.`,
      );
    }
    const provider = getter(chainId);
    if (!provider) {
      throw new Error(
        `StakedBalanceFetcher: no provider for chain ${chainId}. Set getNetworkProvider in config.`,
      );
    }
    return provider;
  }

  /**
   * Fetches the staked balance for an account on a chain using the same
   * staking contract as AccountTrackerController (getShares then convertToAssets).
   * Returns a human-readable amount string (e.g. "1.5" for 1.5 ETH).
   *
   * @param input - Chain, account ID, and address to query.
   * @returns Human-readable staked balance (amount string).
   */
  async fetchStakedBalance(
    input: StakedBalancePollingInput,
  ): Promise<StakedBalance> {
    const { chainId, accountAddress } = input;
    const provider = this.#getNetworkProvider(chainId);
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
