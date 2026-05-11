import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetBatchRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyGetRefreshIntervalRequest,
  TransactionPayQuote,
} from '../../types';
import { getPolymarketBridgeQuotes } from './polymarket-quotes';
import { submitPolymarketBridgeQuote } from './polymarket-submit';
import type { PolymarketBridgeQuote } from './types';

const REFRESH_INTERVAL_MS = 25_000;

export class PolymarketStrategy implements PayStrategy<PolymarketBridgeQuote> {
  supports(_request: PayStrategyGetQuotesRequest): boolean {
    return true;
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<PolymarketBridgeQuote>[]> {
    return getPolymarketBridgeQuotes(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<PolymarketBridgeQuote>,
  ): Promise<{ transactionHash?: `0x${string}` }> {
    return submitPolymarketBridgeQuote(request);
  }

  async getBatchTransactions(
    _request: PayStrategyGetBatchRequest<PolymarketBridgeQuote>,
  ): Promise<[]> {
    return [];
  }

  async getRefreshInterval(
    _request: PayStrategyGetRefreshIntervalRequest,
  ): Promise<number> {
    return REFRESH_INTERVAL_MS;
  }
}
