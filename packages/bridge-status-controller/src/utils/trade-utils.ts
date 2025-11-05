// Union type representing all possible trade formats
export type Trade = string | Record<string, unknown>;

/**
 * Type guard to check if a trade is a Bitcoin trade with unsignedPsbtBase64
 * @param trade - The trade object to check
 * @returns True if the trade is a Bitcoin trade with unsignedPsbtBase64 property
 */
export const isBitcoinTrade = (trade: Trade): trade is { unsignedPsbtBase64: string } =>
  typeof trade === 'object' && trade !== null && 'unsignedPsbtBase64' in trade;

/**
 * Type guard to check if a trade is a Tron trade with raw_data_hex
 * @param trade - The trade object to check
 * @returns True if the trade is a Tron trade with raw_data_hex property
 */
export const isTronTrade = (trade: Trade): trade is { 
  raw_data_hex: string;
  visible?: boolean;
  raw_data?: { contract?: { type?: string }[] };
} =>
  typeof trade === 'object' && trade !== null && 'raw_data_hex' in trade;

/**
 * Extracts the transaction data from different trade formats
 * @param trade - The trade object which can be a string, Bitcoin trade, or Tron trade
 * @returns The extracted transaction data as a base64 string for SnapController
 */
export const extractTradeData = (trade: Trade): string => {
  if (typeof trade === 'string') {
    // EVM and Solana txs - assuming already in correct format
    return trade;
  }
  
  if (isBitcoinTrade(trade)) {
    // Bitcoin trades are already base64 encoded
    return trade.unsignedPsbtBase64;
  }
  
  if (isTronTrade(trade)) {
    // Tron trades need hex to base64 conversion for SnapController
    return Buffer.from(trade.raw_data_hex, 'hex').toString('base64');
  }
  
  return '';
};
