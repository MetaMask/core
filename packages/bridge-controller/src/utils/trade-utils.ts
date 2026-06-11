import {
  Trade,
  isBitcoinTrade,
  isTronTrade,
  isEvmTxData,
} from '../validators/trade';

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
