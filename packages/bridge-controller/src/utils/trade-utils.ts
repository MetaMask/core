import type {
  BitcoinTradeData,
  StellarTradeData,
  TronTradeData,
  TxData,
} from '../types';

// Union type representing all possible trade formats (EVM, Solana, Bitcoin, Tron, Stellar)
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

/**
 * Type guard to check if a trade is a Stellar trade with XDR (base64) payload
 */
export const isStellarTrade = (trade: Trade): trade is StellarTradeData => {
  if (typeof trade !== 'object' || trade === null) {
    return false;
  }
  if (
    'xdrBase64' in trade &&
    typeof (trade as { xdrBase64: unknown }).xdrBase64 === 'string'
  ) {
    return true;
  }
  if ('xdr' in trade && typeof (trade as { xdr: unknown }).xdr === 'string') {
    return true;
  }
  return false;
};

/**
 * Extracts the transaction data from different trade formats
 *
 * @param trade - The trade object which can be a TxData, string, Bitcoin trade, or Tron trade
 * @returns The extracted transaction data as a base64 string for SnapController
 */
export const extractTradeData = (trade: Trade): string => {
  // Check more specific trade types first to prevent misidentification
  if (isBitcoinTrade(trade)) {
    // Bitcoin trades are already base64 encoded
    return trade.unsignedPsbtBase64;
  }

  if (isTronTrade(trade)) {
    // Tron trades need hex to base64 conversion for SnapController
    return Buffer.from(trade.raw_data_hex, 'hex').toString('base64');
  }

  if (isStellarTrade(trade)) {
    // Return the xdrBase64 or xdr property of the trade object
    // This is a workaround to support both the old and new Stellar trade formats
    return 'xdrBase64' in trade && typeof trade.xdrBase64 === 'string'
      ? trade.xdrBase64
      : trade.xdr;
  }

  if (typeof trade === 'string') {
    // Solana txs - assuming already in correct format
    return trade;
  }

  if (isEvmTxData(trade)) {
    // EVM TxData object - return the data property
    return trade.data;
  }

  return '';
};
