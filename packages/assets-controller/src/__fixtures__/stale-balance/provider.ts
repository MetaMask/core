import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import type { Hex, Json } from '@metamask/utils';

import { MULTICALL3_ADDRESS } from './wallet.js';

/**
 * Multicall3 ABI subset: `aggregate3` (batched calls) and `getEthBalance`
 * (native balance through the Multicall3 contract).
 */
const MULTICALL3_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'bool', name: 'allowFailure', type: 'bool' },
          { internalType: 'bytes', name: 'callData', type: 'bytes' },
        ],
        internalType: 'struct Multicall3.Call3[]',
        name: 'calls',
        type: 'tuple[]',
      },
    ],
    name: 'aggregate3',
    outputs: [
      {
        components: [
          { internalType: 'bool', name: 'success', type: 'bool' },
          { internalType: 'bytes', name: 'returnData', type: 'bytes' },
        ],
        internalType: 'struct Multicall3.Result[]',
        name: 'returnData',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'addr', type: 'address' }],
    name: 'getEthBalance',
    outputs: [{ internalType: 'uint256', name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/** ERC-20 ABI subset: `balanceOf`. */
const ERC20_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/** Staking contract ABI subset: `getShares` and `convertToAssets`. */
const STAKING_ABI = [
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

const multicall3Interface = new Interface(MULTICALL3_ABI);
const erc20Interface = new Interface(ERC20_ABI);
const stakingInterface = new Interface(STAKING_ABI);

/** Staking-vault responses the provider should give. Mutable between passes. */
export type StakingResponses = {
  /** `getShares(account)` response, in wei. */
  sharesWei: string;
  /** `convertToAssets(shares)` response, in wei. */
  assetsWei: string;
};

/** Everything the dynamic provider needs to answer an EVM chain. */
export type StaleBalanceProviderState = {
  /** Hex chain ID, answered to `eth_chainId`. */
  chainIdHex: Hex;
  /** Native balance of the account, in wei, answered to `getEthBalance`. */
  nativeBalanceWei: string;
  /** ERC-20 balances in wei, keyed by lower-cased contract address. */
  tokenBalancesWei: Record<string, string>;
  /** Lower-cased contract addresses whose `balanceOf` read should fail (batched entries are answered as failed; single calls reject). */
  failingTokens: string[];
  /** Staking responses keyed by lower-cased staking contract address. */
  stakingByContract: Record<string, StakingResponses>;
  /** When set, every `eth_call` and `eth_getBalance` rejects. */
  failAll: boolean;
};

/**
 * Build a mutable, scenario-shaped EVM RPC provider state.
 *
 * @param partial - Initial state (requires `chainIdHex` and
 * `nativeBalanceWei`).
 * @returns The provider state with defaults filled in.
 */
export function buildProviderState(
  partial: Partial<StaleBalanceProviderState> & {
    chainIdHex: Hex;
    nativeBalanceWei: string;
  },
): StaleBalanceProviderState {
  return {
    tokenBalancesWei: {},
    failingTokens: [],
    stakingByContract: {},
    failAll: false,
    ...partial,
  };
}

function isFailingToken(
  state: StaleBalanceProviderState,
  address: string,
): boolean {
  return state.failingTokens.includes(address.toLowerCase());
}

/**
 * Answer one `aggregate3` batch: native balances from `getEthBalance`,
 * token balances from `balanceOf`, and failed entries for tokens listed in
 * `failingTokens` — exactly the shapes the on-chain Multicall3 contract
 * returns when a sub-call reverts.
 *
 * @param state - The provider state.
 * @param callData - The `aggregate3` call data.
 * @returns The ABI-encoded `Result[]` response.
 */
function answerAggregate3(
  state: StaleBalanceProviderState,
  callData: Hex,
): Hex {
  const [calls] = multicall3Interface.decodeFunctionData(
    'aggregate3',
    callData,
  ) as [{ target: string; callData: string }[]];

  const results = calls.map(({ target, callData: innerCallData }) => {
    try {
      multicall3Interface.decodeFunctionData('getEthBalance', innerCallData);
      if (state.failAll) {
        return { success: false, returnData: '0x' };
      }
      return {
        success: true,
        returnData: defaultAbiCoder.encode(
          ['uint256'],
          [state.nativeBalanceWei],
        ),
      };
    } catch {
      // Not a getEthBalance call; fall through to balanceOf.
    }

    try {
      erc20Interface.decodeFunctionData('balanceOf', innerCallData);
      if (state.failAll || isFailingToken(state, target)) {
        return { success: false, returnData: '0x' };
      }
      const balance = state.tokenBalancesWei[target.toLowerCase()] ?? '0';
      return {
        success: true,
        returnData: defaultAbiCoder.encode(['uint256'], [balance]),
      };
    } catch {
      // Not a balanceOf call either — a probe we do not model. Answer empty.
      return { success: true, returnData: '0x' };
    }
  });

  // `defaultAbiCoder.encode` always returns a '0x'-prefixed hex string but
  // is typed as plain `string`.
  return defaultAbiCoder.encode(['tuple(bool,bytes)[]'], [results]) as Hex;
}

/**
 * Build the EIP-1193 provider `RpcDataSource` wraps in a `Web3Provider`.
 * Answers chain probes, native and token balance reads (single and
 * Multicall3-batched), and staking-contract reads, all from mutable state.
 *
 * @param state - The provider state the provider answers from.
 * @returns The provider, ready for `NetworkController:getNetworkClientById`.
 */
export function createStaleBalanceProvider(state: StaleBalanceProviderState): {
  request: (args: { method: string; params?: unknown[] }) => Promise<Json>;
} {
  return {
    request: async ({ method, params }) => {
      switch (method) {
        case 'eth_chainId': {
          return state.chainIdHex;
        }

        case 'eth_blockNumber': {
          return '0x1';
        }

        case 'eth_getBalance': {
          if (state.failAll) {
            throw new Error('RPC unreachable: eth_getBalance');
          }
          return `0x${BigInt(state.nativeBalanceWei).toString(16)}`;
        }

        case 'eth_call': {
          // ethers v5 performs `eth_call` with a single transaction object
          // as the first parameter.
          const transaction =
            (params as { to?: string; data?: string }[] | undefined)?.[0] ?? {};
          const target = transaction.to;
          const callData = transaction.data as Hex | undefined;
          if (!target || !callData) {
            return '0x';
          }

          if (state.failAll) {
            throw new Error('RPC unreachable: eth_call');
          }

          const lowerTarget = target.toLowerCase();

          // Staking contract reads.
          const staking = state.stakingByContract[lowerTarget];
          if (staking) {
            try {
              stakingInterface.decodeFunctionData('getShares', callData);
              return defaultAbiCoder.encode(['uint256'], [staking.sharesWei]);
            } catch {
              // Not getShares; try convertToAssets.
            }
            try {
              stakingInterface.decodeFunctionData('convertToAssets', callData);
              return defaultAbiCoder.encode(['uint256'], [staking.assetsWei]);
            } catch {
              // An unmodeled staking read — treat it as a reverted call.
              throw new Error(
                `StaleBalanceProvider: unmodeled staking call to ${target}`,
              );
            }
          }

          // Multicall3 aggregate3 batch.
          if (lowerTarget === MULTICALL3_ADDRESS.toLowerCase()) {
            try {
              multicall3Interface.decodeFunctionData('aggregate3', callData);
              return answerAggregate3(state, callData);
            } catch {
              // Not an aggregate3 call; answer empty as for any probe.
              return '0x';
            }
          }

          // Single balanceOf fallback call.
          try {
            erc20Interface.decodeFunctionData('balanceOf', callData);
          } catch {
            // Not a balanceOf call — an unmodeled probe. Answer empty.
            return '0x';
          }
          if (isFailingToken(state, target)) {
            // A read that the contract reverts rejects, exactly like a real
            // RPC `eth_call` to a broken contract. The client treats this as a
            // failed read and preserves the previous amount in state.
            throw new Error(
              `StaleBalanceProvider: balanceOf reverted for ${target}`,
            );
          }
          const balance = state.tokenBalancesWei[lowerTarget] ?? '0';
          return defaultAbiCoder.encode(['uint256'], [balance]);
        }

        default: {
          return '0x';
        }
      }
    },
  };
}
