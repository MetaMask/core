import type { Hex } from '@metamask/utils';

// TODO: Replace placeholder addresses with actual deployed contract addresses.
// TODO: Rename constants to be more generic.
/**
 * Arbitrum USDC (test Vault): 0xaf88d065e77c8cc2239327c5edb3a432268e5831
 */
export const MUSD_CONTRACT_ADDRESS: Hex =
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831';

/**
 * Arbitrum USDC (test Vault): 0xB5F07d769dD60fE54c97dd53101181073DDf21b2
 */
// TODO: Rename to Veda Vault address
export const MUSDHFVD_CONTRACT_ADDRESS: Hex =
  '0xB5F07d769dD60fE54c97dd53101181073DDf21b2';

// TODO: Rename to Veda Accountant address
/**
 * Arbitrum Accountant (test Vault): 0x800ebc3B74F67EaC27C9CCE4E4FF28b17CdCA173
 */
export const ACCOUNTANT_CONTRACT_ADDRESS: Hex =
  '0x800ebc3B74F67EaC27C9CCE4E4FF28b17CdCA173';

// TODO: Use CHAIN_IDS.ARBITRUM instead.
export const VAULT_CHAIN_ID: Hex = '0xa4b1'; // Arbitrum One

// TODO: Replace with the canonical Veda network identifier for the deployment.
export const VEDA_NETWORK = 'arbitrum';

export const MUSD_DECIMALS = 6;

export const MUSDHFVD_DECIMALS = 6;

export const VEDA_PERFORMANCE_API_BASE_URL = 'https://api.sevenseas.capital';

/**
 * Minimal ABI for the Veda Accountant's `getRate()` function (selector 0x679aefce).
 * Returns the exchange rate between vault shares (musdSHFvd) and the
 * underlying asset (mUSD) as a uint256.
 */
// TODO: Verify this ABI is correct.
export const ACCOUNTANT_ABI = [
  {
    inputs: [],
    name: 'getRate',
    outputs: [{ internalType: 'uint256', name: 'rate', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
