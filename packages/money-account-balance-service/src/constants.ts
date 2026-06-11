import { Duration, Hex, inMilliseconds } from '@metamask/utils';

export const VEDA_PERFORMANCE_API_BASE_URL = 'https://api.sevenseas.capital';

/**
 * The key under which vault config is stored in
 * `RemoteFeatureFlagController` state's `remoteFeatureFlags` map.
 */
export const VAULT_CONFIG_FEATURE_FLAG_KEY = 'moneyAccountVaultConfig';

/**
 * The key under which the Money account balance `staleTime` (in milliseconds)
 * is stored in `RemoteFeatureFlagController` state's `remoteFeatureFlags` map.
 * Falls back to {@link DEFAULT_BALANCE_STALE_TIME} when absent or malformed.
 */
export const MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY =
  'moneyAccountBalanceStaletime';

/**
 * Default `staleTime` (in milliseconds) for on-chain Money account balance
 * reads, used when {@link MONEY_ACCOUNT_BALANCE_STALETIME_FEATURE_FLAG_KEY} is
 * absent or malformed.
 */
export const DEFAULT_BALANCE_STALE_TIME = inMilliseconds(1, Duration.Minute);

export const VEDA_API_NETWORK_NAMES: Record<Hex, string> = {
  '0xa4b1': 'arbitrum',
  '0x8f': 'monad',
};

/**
 * Multicall3 contract address by chain ID, used to batch the Money account
 * balance reads into a single RPC request. Multicall3 is deployed at the same
 * canonical address on every supported chain.
 *
 * Source: https://github.com/mds1/multicall/blob/main/deployments.json
 */
export const MULTICALL3_ADDRESS_BY_CHAIN_ID: Record<Hex, Hex> = {
  '0xa4b1': '0xcA11bde05977b3631167028862bE2a173976CA11', // Arbitrum One
  '0x8f': '0xcA11bde05977b3631167028862bE2a173976CA11', // Monad mainnet
};

/**
 * Minimal ABI for the Multicall3 `aggregate3` function.
 */
export const MULTICALL3_ABI = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const;

/**
 * Minimal ABI for the Veda Accountant contract. Covers:
 *  - base    (0x5001f3b5) — the underlying ERC20 base asset address
 *  - getRate (0x679aefce) — exchange rate between vault shares and the
 *                           underlying asset (mUSD) as a uint256
 */
export const ACCOUNTANT_ABI = [
  {
    inputs: [],
    name: 'base',
    outputs: [{ internalType: 'contract ERC20', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getRate',
    outputs: [{ internalType: 'uint256', name: 'rate', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Minimal ABI for the Arctic Architecture Lens contract.
 * Covers:
 *  - balanceOf        (0xf7888aec) — shares held by an account in a BoringVault
 *  - balanceOfInAssets (0x789fd871) — share balance denominated in underlying assets
 */
export const LENS_ABI = [
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'boringVault', type: 'address' },
    ],
    name: 'balanceOf',
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'boringVault', type: 'address' },
      { name: 'accountant', type: 'address' },
    ],
    name: 'balanceOfInAssets',
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
