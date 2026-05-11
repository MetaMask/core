import { Hex } from '@metamask/utils';

export const VEDA_PERFORMANCE_API_BASE_URL = 'https://api.sevenseas.capital';

/**
 * The key under which vault config is stored in
 * `RemoteFeatureFlagController` state's `remoteFeatureFlags` map.
 */
export const VAULT_CONFIG_FEATURE_FLAG_KEY = 'moneyAccountVaultConfig';

export const VEDA_API_NETWORK_NAMES: Record<Hex, string> = {
  '0xa4b1': 'arbitrum',
  '0x8f': 'monad',
};

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
