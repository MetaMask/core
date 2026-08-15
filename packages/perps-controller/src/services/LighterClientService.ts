/**
 * Lighter Client Service
 *
 * Thin REST client for the zkLighter API. No SDK dependency — endpoints are
 * called with the platform `fetch` global. Response shapes are validated
 * minimally (code field) and returned as typed payloads for the adapter
 * layer.
 *
 * Endpoints used (https://apidocs.lighter.xyz):
 * - GET  /api/v1/orderBooks           market metadata
 * - GET  /api/v1/orderBookDetails     market stats
 * - GET  /api/v1/account              account (+positions) by index
 * - GET  /api/v1/accountsByL1Address  account discovery
 * - GET  /api/v1/apikeys              registered venue keys
 * - GET  /api/v1/nextNonce            per-key nonce
 * - GET  /api/v1/accountActiveOrders  open orders (auth token header)
 * - POST /api/v1/sendTx               submit signed L2 transaction
 */

import {
  getLighterHttpEndpoint,
  LIGHTER_HTTP_TIMEOUT_MS,
} from '../constants/lighterConfig.js';
import type { PerpsPlatformDependencies } from '../types/index.js';
import type {
  LighterAccountResponse,
  LighterAccountsByL1AddressResponse,
  LighterActiveOrdersResponse,
  LighterApiKeysResponse,
  LighterNetwork,
  LighterNextNonceResponse,
  LighterOrderBookMeta,
  LighterOrderBookDetailsResponse,
  LighterOrderBooksResponse,
  LighterCandlesResponse,
  LighterPnlResponse,
  LighterPositionFundingsResponse,
  LighterSendTxResponse,
  LighterTradesResponse,
} from '../types/lighter-types.js';

/**
 * Duration market metadata stays cached before a refetch.
 */
const MARKETS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Convert a snake_case wire key to camelCase.
 *
 * @param key - Wire key (e.g. `min_base_amount`).
 * @returns camelCase key (e.g. `minBaseAmount`).
 */
function toCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/gu, (_match, char: string) =>
    char.toUpperCase(),
  );
}

/**
 * Recursively convert all object keys from snake_case to camelCase.
 * The zkLighter wire format is snake_case; parsed shapes in this package
 * follow camelCase conventions (see types/lighter-types.ts).
 *
 * @param value - Parsed JSON value.
 * @returns The value with camelCase keys.
 */
export function convertKeysToCamelCase(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(convertKeysToCamelCase);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        toCamelKey(key),
        convertKeysToCamelCase(entry),
      ]),
    );
  }
  return value;
}

/**
 * Error thrown for non-2xx HTTP responses or API-level error codes.
 */
export class LighterApiError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'LighterApiError';
    this.code = code;
  }
}

/**
 * REST client for the zkLighter API.
 */
export class LighterClientService {
  readonly #deps: PerpsPlatformDependencies;

  readonly #isTestnet: boolean;

  #marketsCache: LighterOrderBookMeta[] | null = null;

  #marketsCacheTime = 0;

  constructor(deps: PerpsPlatformDependencies, config: { isTestnet: boolean }) {
    this.#deps = deps;
    this.#isTestnet = config.isTestnet;
  }

  get network(): LighterNetwork {
    return this.#isTestnet ? 'testnet' : 'mainnet';
  }

  get baseUrl(): string {
    return getLighterHttpEndpoint(this.network);
  }

  /**
   * Fetch market metadata, cached for 5 minutes.
   *
   * @param forceRefresh - Skip the cache and refetch.
   * @returns Market metadata entries.
   */
  async getOrderBooks(forceRefresh = false): Promise<LighterOrderBookMeta[]> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.#marketsCache &&
      now - this.#marketsCacheTime < MARKETS_CACHE_TTL_MS
    ) {
      return this.#marketsCache;
    }

    const response =
      await this.#get<LighterOrderBooksResponse>('/api/v1/orderBooks');
    this.#marketsCache = response.orderBooks;
    this.#marketsCacheTime = now;
    return response.orderBooks;
  }

  /**
   * Fetch market stats for all markets.
   *
   * @returns Order book details entries.
   */
  async getOrderBookDetails(): Promise<LighterOrderBookDetailsResponse> {
    return await this.#get<LighterOrderBookDetailsResponse>(
      '/api/v1/orderBookDetails',
    );
  }

  /**
   * Fetch an account (including positions) by its Lighter index.
   *
   * @param accountIndex - The Lighter account index.
   * @returns Account payload.
   */
  async getAccountByIndex(
    accountIndex: number,
  ): Promise<LighterAccountResponse> {
    return await this.#get<LighterAccountResponse>(
      `/api/v1/account?by=index&value=${accountIndex}`,
    );
  }

  /**
   * Discover Lighter accounts owned by an L1 address.
   *
   * @param l1Address - The owning EVM address.
   * @returns Accounts payload.
   */
  async getAccountsByL1Address(
    l1Address: string,
  ): Promise<LighterAccountsByL1AddressResponse> {
    return await this.#get<LighterAccountsByL1AddressResponse>(
      `/api/v1/accountsByL1Address?l1_address=${l1Address}`,
    );
  }

  /**
   * Fetch registered API keys for an account.
   *
   * @param accountIndex - The Lighter account index.
   * @param apiKeyIndex - Key slot, or 255 for all slots.
   * @returns API keys payload.
   */
  async getApiKeys(
    accountIndex: number,
    apiKeyIndex = 255,
  ): Promise<LighterApiKeysResponse> {
    return await this.#get<LighterApiKeysResponse>(
      `/api/v1/apikeys?account_index=${accountIndex}&api_key_index=${apiKeyIndex}`,
    );
  }

  /**
   * Fetch the next nonce for a key slot.
   *
   * @param accountIndex - The Lighter account index.
   * @param apiKeyIndex - Key slot.
   * @returns Next nonce payload.
   */
  async getNextNonce(
    accountIndex: number,
    apiKeyIndex: number,
  ): Promise<LighterNextNonceResponse> {
    return await this.#get<LighterNextNonceResponse>(
      `/api/v1/nextNonce?account_index=${accountIndex}&api_key_index=${apiKeyIndex}`,
    );
  }

  /**
   * Fetch active (open) orders for an account.
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer (`_createAuthToken`).
   * @param marketId - Optional market filter (255 = all markets).
   * @returns Active orders payload.
   */
  async getActiveOrders(
    accountIndex: number,
    authToken: string,
    marketId = 255,
  ): Promise<LighterActiveOrdersResponse> {
    return await this.#get<LighterActiveOrdersResponse>(
      `/api/v1/accountActiveOrders?account_index=${accountIndex}&market_id=${marketId}`,
      { authorization: authToken },
    );
  }

  /**
   * Fetch account trade history (auth token required).
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer.
   * @param limit - Max entries (1-100).
   * @returns Trades payload (newest first).
   */
  async getTrades(
    accountIndex: number,
    authToken: string,
    limit = 50,
  ): Promise<LighterTradesResponse> {
    return await this.#get<LighterTradesResponse>(
      `/api/v1/trades?sort_by=timestamp&limit=${limit}&account_index=${accountIndex}&market_type=perp`,
      { authorization: authToken },
    );
  }

  /**
   * Fetch user funding payment history (auth token required).
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer.
   * @param limit - Max entries.
   * @returns Position fundings payload.
   */
  async getPositionFundings(
    accountIndex: number,
    authToken: string,
    limit = 50,
  ): Promise<LighterPositionFundingsResponse> {
    return await this.#get<LighterPositionFundingsResponse>(
      `/api/v1/positionFunding?account_index=${accountIndex}&market_id=255&limit=${limit}&sort_by=timestamp&side=all`,
      { authorization: authToken },
    );
  }

  /**
   * Fetch account PnL history (auth token required).
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer.
   * @param startTimestamp - Range start (ms).
   * @param endTimestamp - Range end (ms).
   * @param countBack - Records counted back from range end.
   * @returns PnL payload.
   */
  async getPnl(
    accountIndex: number,
    authToken: string,
    startTimestamp: number,
    endTimestamp: number,
    countBack: number,
  ): Promise<LighterPnlResponse> {
    return await this.#get<LighterPnlResponse>(
      `/api/v1/pnl?by=index&value=${accountIndex}&resolution=1d&count_back=${countBack}&start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}`,
      { authorization: authToken },
    );
  }

  /**
   * Fetch an OHLCV candle series for a market.
   *
   * @param marketId - Numeric Lighter market id.
   * @param resolution - Candle resolution (e.g. `1m`, `15m`, `1h`, `1d`).
   * @param startTimestamp - Range start (ms).
   * @param endTimestamp - Range end (ms).
   * @param countBack - Number of candles counted back from the range end.
   * @returns Candle series payload.
   */
  async getCandles(
    marketId: number,
    resolution: string,
    startTimestamp: number,
    endTimestamp: number,
    countBack: number,
  ): Promise<LighterCandlesResponse> {
    return await this.#get<LighterCandlesResponse>(
      `/api/v1/candles?market_id=${marketId}&resolution=${resolution}&start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}&count_back=${countBack}`,
    );
  }

  /**
   * Submit a signed L2 transaction.
   *
   * @param txType - L2 transaction type code (see lighterConfig).
   * @param txInfo - Serialized signed transaction JSON.
   * @returns Send result payload.
   */
  async sendTx(txType: number, txInfo: string): Promise<LighterSendTxResponse> {
    const body = new URLSearchParams({
      tx_type: String(txType),
      tx_info: txInfo,
    });

    const response = await this.#request<LighterSendTxResponse>(
      '/api/v1/sendTx',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );
    return response;
  }

  readonly #get = async <Result extends { code: number; message?: string }>(
    path: string,
    headers?: Record<string, string>,
  ): Promise<Result> => {
    return await this.#request<Result>(path, { method: 'GET', headers });
  };

  readonly #request = async <Result extends { code: number; message?: string }>(
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<Result> => {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      LIGHTER_HTTP_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      });

      const payload = convertKeysToCamelCase(await response.json()) as Result;

      // Lighter returns HTTP 200 with an application-level error code, and
      // 4xx/5xx with `{code, message}` bodies — treat both uniformly.
      if (!response.ok || payload.code !== 200) {
        throw new LighterApiError(
          payload.message ?? `Lighter API error (HTTP ${response.status})`,
          payload.code ?? response.status,
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof LighterApiError) {
        throw error;
      }
      this.#deps.debugLogger?.log?.('LighterClientService request failed', {
        url,
        error,
      });
      throw new LighterApiError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timeout);
    }
  };
}
