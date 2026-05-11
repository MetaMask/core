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

/**
 * Experimental flag layered on top of USE_RELAY_BRIDGE. When both flags are
 * true, the deposit wallet unwraps pUSD directly into USDC.e at Relay's
 * one-shot deposit address in a single relayer-broadcast batch (approve +
 * unwrap), skipping the EOA leg entirely. Requires the deposit wallet to be
 * able to call the Polymarket CollateralOfframp.
 */
export const USE_RELAY_DEPOSIT_ADDRESS = true;

export const USDC_E_ADDRESS_POLYGON =
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174' as Hex;

export const POLYMARKET_COLLATERAL_OFFRAMP_POLYGON =
  '0x2957922Eb93258b93368531d39fAcCA3B4dC5854' as Hex;

export const POLYMARKET_COLLATERAL_ONRAMP_POLYGON =
  '0x93070a847efEf7F70739046A929D47a521F5B8ee' as Hex;

/**
 * TEMPORARY testing flag. When true, the Relay-deposit-address flow skips
 * polling the Relay /intents/status endpoint entirely so the wrap-back
 * sweep flow can be exercised quickly with USDC.e manually loaded onto the
 * deposit wallet.
 */
export const FORCE_SKIP_RELAY_POLL = true;
