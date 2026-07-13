import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

export const CONTROLLER_NAME = 'TransactionPayController';

/**
 * Parent transaction types that represent a Hyperliquid perps deposit and
 * share the same Arbitrum-USDC → Hypercore handling in pay strategies.
 */
export const PERPS_DEPOSIT_TYPES: TransactionType[] = [
  TransactionType.perpsDeposit,
  TransactionType.perpsDepositAndOrder,
];

export const CHAIN_ID_ARBITRUM = '0xa4b1' as Hex;
export const CHAIN_ID_MAINNET = '0x1' as Hex;
export const CHAIN_ID_POLYGON = '0x89' as Hex;
export const CHAIN_ID_HYPERCORE = '0x539' as Hex;
export const CHAIN_ID_MONAD = '0x8f' as Hex;

export const NATIVE_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000' as Hex;

export const ARBITRUM_USDC_ADDRESS =
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Hex;

export const POLYGON_USDCE_ADDRESS =
  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Hex;

export const POLYGON_PUSD_ADDRESS =
  '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB' as Hex;

export const MUSD_MONAD_ADDRESS =
  '0xaca92e438df0b2401ff60da7e4337b687a2435da' as Hex;

export const HYPERCORE_USDC_ADDRESS = '0x00000000000000000000000000000000';

export const HYPERCORE_USDC_DECIMALS = 8;
export const USDC_DECIMALS = 6;

export const SLIP44_COIN_TYPE_BY_CHAIN: Record<Hex, number> = {
  [CHAIN_ID_POLYGON]: 966, // POL
};

export const STABLECOINS: Record<Hex, Hex[]> = {
  // Mainnet
  '0x1': [
    '0xaca92e438df0b2401ff60da7e4337b687a2435da', // MUSD
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
  ],
  [CHAIN_ID_ARBITRUM]: [ARBITRUM_USDC_ADDRESS.toLowerCase() as Hex],
  // Linea
  '0xe708': [
    '0xaca92e438df0b2401ff60da7e4337b687a2435da', // MUSD
    '0x176211869ca2b568f2a7d4ee941e073a821ee1ff', // USDC
    '0xa219439258ca9da29e9cc4ce5596924745e12b93', // USDT
  ],
  [CHAIN_ID_POLYGON]: [
    POLYGON_USDCE_ADDRESS.toLowerCase() as Hex,
    POLYGON_PUSD_ADDRESS.toLowerCase() as Hex,
  ],
  [CHAIN_ID_HYPERCORE]: [HYPERCORE_USDC_ADDRESS], // USDC
};

export enum PaymentOverride {
  MoneyAccount = 'moneyAccount',
  Perps = 'perps',
  Predict = 'predict',
}

export enum TransactionPayStrategy {
  Across = 'across',
  Fiat = 'fiat',
  /**
   * Internal marker for no-op quotes generated when the controller determines
   * that no conversion is needed. Not a routable strategy.
   */
  None = 'none',
  Relay = 'relay',
  Server = 'server',
}

const VALID_STRATEGIES = new Set(
  Object.values(TransactionPayStrategy).filter(
    (strategy) => strategy !== TransactionPayStrategy.None,
  ),
);

/**
 * Checks if a value is a valid, routable transaction pay strategy.
 * The internal no-op marker is not routable.
 *
 * @param strategy - Candidate strategy value.
 * @returns True if the value is a valid strategy.
 */
export function isTransactionPayStrategy(
  strategy: unknown,
): strategy is TransactionPayStrategy {
  return VALID_STRATEGIES.has(strategy as TransactionPayStrategy);
}
