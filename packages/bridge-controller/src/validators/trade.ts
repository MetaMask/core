/* eslint-disable no-restricted-syntax */
import {
  type,
  number,
  nullable,
  optional,
  string,
  array,
  boolean,
  define,
  union,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

export const HexString = define<`0x${string}`>(
  'HexString',
  (value: unknown): value is `0x${string}` =>
    typeof value === 'string' && /^0x[a-zA-Z0-9]*$/u.test(value),
);

export const TxDataSchema = type({
  chainId: number(),
  to: HexString,
  from: HexString,
  value: HexString,
  data: HexString,
  gasLimit: nullable(number()),
  effectiveGas: optional(number()),
});

export const BitcoinTradeDataSchema = type({
  unsignedPsbtBase64: string(),
  inputsToSign: nullable(array(type({}))),
});

export const TronTradeDataSchema = type({
  raw_data_hex: string(),
  visible: optional(boolean()),
  raw_data: optional(
    nullable(
      type({
        contract: optional(
          array(
            type({
              type: optional(string()),
            }),
          ),
        ),
        fee_limit: optional(number()),
      }),
    ),
  ),
}); // Union type representing all possible trade formats (EVM, Solana, Bitcoin, Tron)

/**
 * Stellar bridge quote: unsigned transaction envelope as XDR (base64).
 */
export const StellarTradeDataSchema = union([
  type({ xdrBase64: string() }),
  type({ xdr: string() }),
]);

export type Trade =
  | TxData
  | string
  | BitcoinTradeData
  | TronTradeData
  | StellarTradeData;
/**
 * Type guard to check if a trade is an EVM TxData object
 *
 * @param trade - The trade object to check
 * @returns True if the trade is a TxData object with data property
 */

export const isEvmTxData = (trade: Trade): trade is TxData => {
  return (
    typeof trade === 'object' &&
    trade !== null &&
    'data' in trade &&
    'chainId' in trade &&
    'to' in trade
  );
};
/**
 * Type guard to check if a trade is a Bitcoin trade with unsignedPsbtBase64
 *
 * @param trade - The trade object to check
 * @returns True if the trade is a Bitcoin trade with unsignedPsbtBase64 property
 */

export const isBitcoinTrade = (trade: Trade): trade is BitcoinTradeData => {
  return (
    typeof trade === 'object' && trade !== null && 'unsignedPsbtBase64' in trade
  );
};
/**
 * Type guard to check if a trade is a Tron trade with raw_data_hex
 *
 * @param trade - The trade object to check
 * @returns True if the trade is a Tron trade with raw_data_hex property
 */

export const isTronTrade = (trade: Trade): trade is TronTradeData => {
  return typeof trade === 'object' && trade !== null && 'raw_data_hex' in trade;
};

export const hasOwnProp = (obj: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Type guard to check if a trade is a Stellar trade with XDR (base64) payload
 *
 * @param trade - The trade object to check
 * @returns True if the trade is a Stellar trade with xdrBase64 or xdr property
 */
export const isStellarTrade = (trade: Trade): trade is StellarTradeData => {
  if (typeof trade !== 'object' || trade === null) {
    return false;
  }
  if (
    hasOwnProp(trade, 'xdrBase64') &&
    typeof (trade as { xdrBase64: unknown }).xdrBase64 === 'string'
  ) {
    return true;
  }
  if (
    hasOwnProp(trade, 'xdr') &&
    typeof (trade as { xdr: unknown }).xdr === 'string'
  ) {
    return true;
  }
  return false;
};

export type BitcoinTradeData = Infer<typeof BitcoinTradeDataSchema>;

export type TronTradeData = Infer<typeof TronTradeDataSchema>;
export type TxData = Infer<typeof TxDataSchema>;
export type StellarTradeData = Infer<typeof StellarTradeDataSchema>;
