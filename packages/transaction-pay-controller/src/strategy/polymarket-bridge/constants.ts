import type { Hex } from '@metamask/utils';

export const POLYMARKET_BRIDGE_BASE_URL_PROD = 'https://bridge.polymarket.com';

export const POLYMARKET_RELAYER_PROXY_URL_PROD =
  'https://predict.api.cx.metamask.io';

// On-chain addresses (Polygon)
export const DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON =
  '0x00000000000Fb5C9ADea0298D729A0CB3823Cc07' as Hex;
export const PUSD_ADDRESS_POLYGON =
  '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB' as Hex;

export const DEPOSIT_WALLET_IMPLEMENTATION_POLYGON =
  '0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB' as Hex;

// EIP-712 domain
export const POLYMARKET_WALLET_DOMAIN_NAME = 'DepositWallet';
export const POLYMARKET_WALLET_DOMAIN_VERSION = '1';

// Transaction parameters
export const POLYMARKET_BATCH_DEADLINE_SECONDS = 240;

// Relayer terminal states — once the relayer enters one of these, stop polling
export const RELAYER_TERMINAL_STATES = [
  'STATE_MINED',
  'STATE_CONFIRMED',
  'STATE_FAILED',
  'STATE_INVALID',
] as const;

// pUSD decimals (same as USDC)
export const PUSD_DECIMALS = 6;

/**
 * Hardcoded experiment flag. When true, the Polymarket bridge strategy bypasses
 * Polymarket's `/quote` + `/withdraw` flow and instead:
 *   1. Fetches a Relay quote (pUSD on Polygon → target chain/token).
 *   2. At execute time, transfers pUSD from the deposit wallet to the user EOA
 *      via the existing Polymarket relayer proxy (single ERC-20 transfer).
 *   3. Submits the stored Relay quote from the user EOA, gaslessly via Relay's
 *      /execute endpoint.
 *
 * Lets us avoid Polymarket-bridge minimums, fees, and the source-vs-target
 * txHash ambiguity in their `/status` endpoint. Toggle to false to fall back to
 * the original Polymarket bridge flow.
 */
export const USE_RELAY_BRIDGE = true;
