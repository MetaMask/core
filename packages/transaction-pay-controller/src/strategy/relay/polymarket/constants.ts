import type { Hex } from '@metamask/utils';

export const POLYMARKET_RELAYER_PROXY_URL_PROD =
  'https://predict.api.cx.metamask.io';

export const DEPOSIT_WALLET_FACTORY_ADDRESS_POLYGON =
  '0x00000000000Fb5C9ADea0298D729A0CB3823Cc07' as Hex;

export const DEPOSIT_WALLET_IMPLEMENTATION_POLYGON =
  '0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB' as Hex;

export const PUSD_ADDRESS_POLYGON =
  '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB' as Hex;

export const USDC_E_ADDRESS_POLYGON =
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174' as Hex;

export const POLYMARKET_COLLATERAL_OFFRAMP_POLYGON =
  '0x2957922Eb93258b93368531d39fAcCA3B4dC5854' as Hex;

export const POLYMARKET_COLLATERAL_ONRAMP_POLYGON =
  '0x93070a847efEf7F70739046A929D47a521F5B8ee' as Hex;

export const POLYMARKET_WALLET_DOMAIN_NAME = 'DepositWallet';
export const POLYMARKET_WALLET_DOMAIN_VERSION = '1';

/**
 * Polymarket's relayer rejects deadlines above 300s, so use the maximum
 * allowed window to reduce intermittent "deadline too soon" failures.
 */
export const POLYMARKET_BATCH_DEADLINE_SECONDS = 300;

export const POLYMARKET_RELAYER_TERMINAL_STATES = [
  'STATE_MINED',
  'STATE_CONFIRMED',
  'STATE_FAILED',
  'STATE_INVALID',
] as const;
