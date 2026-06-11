import {
  type,
  number,
  nullable,
  optional,
  string,
  array,
  boolean,
  union,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import {
  HexAddressStruct,
  HexChecksumAddressStruct,
  StrictHexStruct,
} from '@metamask/utils';

export const HexAddressOrChecksumAddressSchema = union([
  HexAddressStruct,
  HexChecksumAddressStruct,
]);

export const TxDataSchema = type({
  chainId: number(),
  to: HexAddressOrChecksumAddressSchema,
  from: HexAddressOrChecksumAddressSchema,
  value: StrictHexStruct,
  data: StrictHexStruct,
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

export type Trade = TxData | string | BitcoinTradeData | TronTradeData;
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
export type BitcoinTradeData = Infer<typeof BitcoinTradeDataSchema>;

export type TronTradeData = Infer<typeof TronTradeDataSchema>;
export type TxData = Infer<typeof TxDataSchema>;
