import { Interface } from '@ethersproject/abi';
import { Web3Provider } from '@ethersproject/providers';
import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';
import type { Hex } from '@metamask/utils';

import {
  decodeAggregate3Response,
  encodeAggregate3,
} from '../clients/MulticallClient.js';
import type { Address, AccountId, ChainId } from '../types/index.js';
import {
  getStakingContractAddress,
  getSupportedStakingChainIds,
  isStakingContractAssetId,
  weiToHumanReadable,
} from '../utils/index.js';

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

/**
 * Canonical Multicall3 deployment. Mainnet and Hoodi both use this address,
 * so one `eth_call` can batch the staking reads.
 */
const MULTICALL3_ADDRESS: Address =
  '0xcA11bde05977b3631167028862bE2a173976CA11';

/**
 * Staking vault reads needed to value an account's shares in one multicall.
 * `convertToAssets(shares)` is `shares * totalAssets / totalShares` (floor),
 * so the two dependent calls collapse into these three independent reads.
 */
const STAKING_CONTRACT_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'getShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

export const STAKING_INTERFACE = new Interface(STAKING_CONTRACT_ABI);

type StakingRead = 'getShares' | 'totalAssets' | 'totalShares';

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
   * Fetches the staked balance for an account on a chain.
   * One Multicall3 `eth_call` reads `getShares`, `totalAssets`, and
   * `totalShares`. The ETH amount is the vault's `convertToAssets` formula:
   * `shares * totalAssets / totalShares` (floor), or `shares` when the vault
   * has no shares.
   * Returns a human-readable amount string (e.g. "1.5" for 1.5 ETH).
   * Throws when no provider is available or when the RPC/contract call fails, so
   * callers do not persist a false zero and overwrite existing balances.
   *
   * @param input - Chain, account ID, and address to query.
   * @returns Human-readable staked balance (amount string).
   * @throws When provider is missing or when the staking read fails.
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
      const assetsWei = await readStakedAssetsWei(
        provider,
        contractAddress as Address,
        accountAddress,
      );
      return { amount: weiToHumanReadable(assetsWei, STAKING_DECIMALS) };
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('StakedBalanceFetcher: failed to fetch staked balance');
    }
  }
}

/**
 * StakeWise `convertToAssets`: floor division, or the shares themselves when
 * the vault has not minted any.
 *
 * @param shares - Account shares from `getShares`.
 * @param totalAssets - Vault `totalAssets()`.
 * @param totalShares - Vault `totalShares()`.
 * @returns Asset amount in wei.
 */
function convertSharesToAssets(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint,
): bigint {
  if (totalShares === 0n) {
    return shares;
  }
  return (shares * totalAssets) / totalShares;
}

function encodeStakingRead(
  contractAddress: Address,
  functionName: StakingRead,
  args: readonly string[] = [],
): { target: Address; allowFailure: boolean; callData: Hex } {
  return {
    target: contractAddress,
    allowFailure: false,
    callData: STAKING_INTERFACE.encodeFunctionData(functionName, [
      ...args,
    ]) as Hex,
  };
}

function decodeStakingUint(functionName: StakingRead, data: string): bigint {
  const decoded = STAKING_INTERFACE.decodeFunctionResult(functionName, data)[0];
  return BigInt(decoded.toString());
}

/**
 * One `eth_call` to Multicall3: shares plus the vault exchange rate.
 *
 * @param provider - Chain provider.
 * @param contractAddress - Staking vault address.
 * @param accountAddress - Account whose shares to read.
 * @returns Staked assets in wei.
 */
async function readStakedAssetsWei(
  provider: Web3Provider,
  contractAddress: Address,
  accountAddress: Address,
): Promise<bigint> {
  const calls = [
    encodeStakingRead(contractAddress, 'getShares', [accountAddress]),
    encodeStakingRead(contractAddress, 'totalAssets', []),
    encodeStakingRead(contractAddress, 'totalShares', []),
  ];
  const result = await provider.call({
    to: MULTICALL3_ADDRESS,
    data: encodeAggregate3(calls),
  });
  const decoded = decodeAggregate3Response(result as Hex, calls.length);
  if (decoded.some((entry) => !entry.success)) {
    throw new Error('StakedBalanceFetcher: staking contract call failed');
  }

  const shares = decodeStakingUint('getShares', decoded[0].returnData);
  if (shares === 0n) {
    return 0n;
  }

  const totalAssets = decodeStakingUint('totalAssets', decoded[1].returnData);
  const totalShares = decodeStakingUint('totalShares', decoded[2].returnData);
  return convertSharesToAssets(shares, totalAssets, totalShares);
}
