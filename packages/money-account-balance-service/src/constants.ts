import { Hex } from '@metamask/utils';

export const VEDA_PERFORMANCE_API_BASE_URL = 'https://api.sevenseas.capital';

export const VEDA_API_NETWORK_NAMES: Record<Hex, string> = {
  '0xa4b1': 'arbitrum',
};

export const DEFAULT_VEDA_API_NETWORK_NAME = VEDA_API_NETWORK_NAMES['0xa4b1'];

/**
 * Minimal ABI for the Veda Accountant's `getRate()` function (selector 0x679aefce).
 * Returns the exchange rate between vault shares (musdSHFvd) and the
 * underlying asset (mUSD) as a uint256.
 */
export const ACCOUNTANT_ABI = [
  {
    inputs: [],
    name: 'getRate',
    outputs: [{ internalType: 'uint256', name: 'rate', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
