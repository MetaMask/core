import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import { POLYMARKET_BRIDGE_BASE_URL_PROD } from './constants';
import type {
  PolymarketBridgeFeeBreakdown,
  PolymarketBridgeQuote,
} from './types';

const log = createModuleLogger(projectLogger, 'polymarket-bridge-api');

/**
 * Error thrown by Polymarket Bridge API operations.
 */
export class PolymarketBridgeError extends Error {
  code: string;

  raw: unknown;

  constructor(message: string, code: string, raw?: unknown) {
    super(message);
    this.name = 'PolymarketBridgeError';
    this.code = code;
    this.raw = raw;
  }
}

/** Raw quote response from Bridge API POST /quote. */
type BridgeQuoteResponse = {
  quoteId: string;
  estToTokenBaseUnit: string;
  estCheckoutTimeMs: number;
  estInputUsd: number;
  estOutputUsd: number;
  estFeeBreakdown: PolymarketBridgeFeeBreakdown;
};

/** Raw withdraw response from Bridge API POST /withdraw. */
type BridgeWithdrawResponse = {
  address: {
    evm: string;
  };
  note: string;
};

/** Single transaction entry from Bridge API GET /status. */
type BridgeStatusTransaction = {
  status: BridgeTransactionStatus;
  txHash?: string;
  createdTimeMs?: number;
  fromChainId: string;
  toChainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmountBaseUnit: string;
};

type BridgeTransactionStatus =
  | 'DEPOSIT_DETECTED'
  | 'PROCESSING'
  | 'ORIGIN_TX_CONFIRMED'
  | 'SUBMITTED'
  | 'COMPLETED'
  | 'FAILED';

const BRIDGE_TERMINAL_STATUSES: readonly BridgeTransactionStatus[] = [
  'COMPLETED',
  'FAILED',
];

/** Raw status response from Bridge API GET /status/{address}. */
type BridgeStatusResponse = {
  transactions: BridgeStatusTransaction[];
};

/**
 * HTTP client for the Polymarket Bridge API.
 *
 * Provides methods to get bridge quotes, create one-shot deposit addresses,
 * and poll for bridge transaction status.
 */
export class PolymarketBridgeApi {
  readonly #baseUrl: string = POLYMARKET_BRIDGE_BASE_URL_PROD;

  /**
   * Fetch a bridge quote for a cross-chain transfer.
   *
   * @param request - The quote request parameters.
   * @param request.fromAmountBaseUnit - Amount to bridge in base units.
   * @param request.fromChainId - Source chain ID.
   * @param request.fromTokenAddress - Source token address.
   * @param request.recipientAddress - Recipient address on the destination chain.
   * @param request.toChainId - Destination chain ID.
   * @param request.toTokenAddress - Destination token address.
   * @returns A PolymarketBridgeQuote with bridgeDepositAddress set to null.
   */
  async getQuote(request: {
    fromAmountBaseUnit: string;
    fromChainId: string;
    fromTokenAddress: string;
    recipientAddress: string;
    toChainId: string;
    toTokenAddress: string;
  }): Promise<PolymarketBridgeQuote> {
    const url = `${this.#baseUrl}/quote`;

    log('Fetching quote', { url, request });

    const data = await this.#post<BridgeQuoteResponse>(url, request);

    log('Quote received', { quoteId: data.quoteId });

    return {
      quoteId: data.quoteId,
      bridgeDepositAddress: null,
      fromAmount: request.fromAmountBaseUnit,
      toAmount: data.estToTokenBaseUnit,
      minReceived: data.estToTokenBaseUnit,
      estCheckoutTimeMs: data.estCheckoutTimeMs,
      estFeeBreakdown: data.estFeeBreakdown,
    };
  }

  /**
   * Create a one-shot deposit address for a bridge withdrawal.
   *
   * @param request - The withdraw address request parameters.
   * @param request.address - The source address.
   * @param request.toChainId - Destination chain ID.
   * @param request.toTokenAddress - Destination token address.
   * @param request.recipientAddr - Recipient address on the destination chain.
   * @returns The EVM deposit address as a hex string.
   */
  async createWithdrawAddress(request: {
    address: string;
    toChainId: string;
    toTokenAddress: string;
    recipientAddr: string;
  }): Promise<Hex> {
    const url = `${this.#baseUrl}/withdraw`;

    log('Creating withdraw address', { url, request });

    const data = await this.#post<BridgeWithdrawResponse>(url, request);

    log('Withdraw address created', { address: data.address.evm });

    return data.address.evm as Hex;
  }

  /**
   * Get the bridge transaction status for a deposit address.
   *
   * @param depositAddress - The deposit address to check status for.
   * @returns Array of bridge status transactions.
   */
  async getStatus(depositAddress: string): Promise<BridgeStatusTransaction[]> {
    const url = `${this.#baseUrl}/status/${depositAddress}`;

    log('Fetching status', { url, depositAddress });

    const data = await this.#get<BridgeStatusResponse>(url);

    log('Status received', {
      depositAddress,
      transactionCount: data.transactions.length,
    });

    return data.transactions;
  }

  async pollUntilBridgeComplete(
    depositAddress: string,
    pollIntervalMs = 10_000,
    maxAttempts = 90,
  ): Promise<BridgeStatusTransaction> {
    log('Polling bridge status', { depositAddress, maxAttempts });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await delay(pollIntervalMs);

      const transactions = await this.getStatus(depositAddress);
      const latest = transactions[0];

      if (
        latest &&
        (BRIDGE_TERMINAL_STATUSES as readonly string[]).includes(latest.status)
      ) {
        log('Bridge reached terminal state', {
          depositAddress,
          status: latest.status,
          txHash: latest.txHash,
          attempt: attempt + 1,
        });
        return latest;
      }

      log('Bridge polling', {
        depositAddress,
        status: latest?.status,
        attempt: attempt + 1,
      });
    }

    throw new PolymarketBridgeError(
      `Bridge status polling timed out after ${maxAttempts} attempts`,
      'BRIDGE_POLLING_TIMEOUT',
    );
  }

  /**
   * Get supported assets from the bridge API.
   *
   * @returns The raw supported assets response.
   */
  async getSupportedAssets(): Promise<unknown> {
    const url = `${this.#baseUrl}/supported-assets`;

    log('Fetching supported assets', { url });

    const data: unknown = await this.#get(url);

    log('Supported assets received');

    return data;
  }

  /**
   * Send a POST request to the bridge API.
   *
   * @param url - The endpoint URL.
   * @param body - The request body to serialize as JSON.
   * @returns The parsed JSON response.
   */
  async #post<ResponseType>(url: string, body: unknown): Promise<ResponseType> {
    return this.#fetch<ResponseType>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Send a GET request to the bridge API.
   *
   * @param url - The endpoint URL.
   * @returns The parsed JSON response.
   */
  async #get<ResponseType>(url: string): Promise<ResponseType> {
    return this.#fetch<ResponseType>(url, { method: 'GET' });
  }

  /**
   * Execute a fetch request, parsing the JSON response and wrapping errors
   * in PolymarketBridgeError.
   *
   * @param url - The endpoint URL.
   * @param init - Fetch init options.
   * @returns The parsed JSON response.
   */
  async #fetch<ResponseType>(
    url: string,
    init: RequestInit,
  ): Promise<ResponseType> {
    const response = await bridgeFetch(url, init);
    return (await response.json()) as ResponseType;
  }
}

/**
 * Fetch a Bridge API endpoint, throwing a PolymarketBridgeError on non-OK
 * responses. Preserves the API's error message when available.
 *
 * @param url - The endpoint to fetch.
 * @param init - Fetch init options.
 * @returns The successful response.
 */
async function bridgeFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);

  if (!response.ok) {
    let detail: string | undefined;
    let rawBody: unknown;

    try {
      rawBody = await response.json();
      const body = rawBody as { message?: string; error?: string };
      detail = body.message ?? body.error;
    } catch {
      // Body wasn't JSON; fall through to status-only error.
    }

    throw new PolymarketBridgeError(
      detail
        ? `Bridge API ${response.status} - ${detail}`
        : `Bridge API ${String(response.status)}`,
      String(response.status),
      rawBody,
    );
  }

  return response;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
