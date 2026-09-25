import type { BalanceUpdate } from '@metamask/core-backend';

import {
  ETH_ASSET_ID,
  MAINNET_CHAIN_ID,
  USDC_ASSET_ID_LOWERCASE,
  WS_WALLET_ADDRESS,
} from './wallet.js';

/** Payload of an `AccountActivityService:balanceUpdated` event. */
export type BalanceUpdatedEventPayload = {
  address: string;
  chain: string;
  updates: BalanceUpdate[];
};

/**
 * Hex quantities the websocket reports, as a transaction-driven wallet would
 * (AADS converts `0x…` amounts to human-readable form before the pipeline).
 */
export const WS_ETH_WEI_HEX = '0x1bc16d674ec80000'; // 2 ETH
export const WS_USDC_BASE_UNITS_HEX = '0x989680'; // 10 USDC (6 decimals)

/** Human-readable amounts AADS derives from the hex quantities above. */
export const ETH_WS_AMOUNT = '2';
export const USDC_WS_AMOUNT = '10';

/**
 * Build an `AccountActivityService:balanceUpdated` event payload updating the
 * native ETH balance — the wallet's pre-existing holding.
 *
 * @param options - Overrides for the balance amount.
 * @param options.amount - The balance amount to report, in wei hex.
 * @returns The event payload.
 */
export function buildEthBalanceUpdatedEvent(options?: {
  amount?: string;
}): BalanceUpdatedEventPayload {
  return {
    address: WS_WALLET_ADDRESS,
    chain: MAINNET_CHAIN_ID,
    updates: [
      {
        asset: {
          fungible: true,
          type: ETH_ASSET_ID,
          unit: 'ETH',
          decimals: 18,
        },
        postBalance: { amount: options?.amount ?? WS_ETH_WEI_HEX },
        transfers: [],
      },
    ],
  };
}

/**
 * Build an `AccountActivityService:balanceUpdated` event payload for USDC —
 * a token the wallet never held before, first surfaced by the websocket
 * (lower-case address, as the websocket sends ERC-20s).
 *
 * @param options - Overrides for the balance amount.
 * @param options.amount - The balance amount to report, in base-unit hex.
 * @returns The event payload.
 */
export function buildUsdcBalanceUpdatedEvent(options?: {
  amount?: string;
}): BalanceUpdatedEventPayload {
  return {
    address: WS_WALLET_ADDRESS,
    chain: MAINNET_CHAIN_ID,
    updates: [
      {
        asset: {
          fungible: true,
          type: USDC_ASSET_ID_LOWERCASE,
          unit: 'USDC',
          decimals: 6,
        },
        postBalance: { amount: options?.amount ?? WS_USDC_BASE_UNITS_HEX },
        transfers: [],
      },
    ],
  };
}
