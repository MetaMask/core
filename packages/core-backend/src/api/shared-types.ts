/**
 * Shared types, constants, and utilities for the API Platform Client.
 */

import type { QueryClient } from '@tanstack/query-core';

// ============================================================================
// SHARED TYPES
// ============================================================================

/**
 * Pagination info for paginated responses
 */
export type PageInfo = {
  count: number;
  hasNextPage: boolean;
  cursor?: string;
};

/**
 * Supported currencies for Price API
 */
export type SupportedCurrency =
  // Crypto
  | 'btc'
  | 'eth'
  | 'ltc'
  | 'bch'
  | 'bnb'
  | 'eos'
  | 'xrp'
  | 'xlm'
  | 'link'
  | 'dot'
  | 'yfi'
  // Fiat
  | 'usd'
  | 'aed'
  | 'ars'
  | 'aud'
  | 'bdt'
  | 'bhd'
  | 'bmd'
  | 'brl'
  | 'cad'
  | 'chf'
  | 'clp'
  | 'cny'
  | 'czk'
  | 'dkk'
  | 'eur'
  | 'gbp'
  | 'gel'
  | 'hkd'
  | 'huf'
  | 'idr'
  | 'ils'
  | 'inr'
  | 'jpy'
  | 'krw'
  | 'kwd'
  | 'lkr'
  | 'mmk'
  | 'mxn'
  | 'myr'
  | 'ngn'
  | 'nok'
  | 'nzd'
  | 'php'
  | 'pkr'
  | 'pln'
  | 'rub'
  | 'sar'
  | 'sek'
  | 'sgd'
  | 'thb'
  | 'try'
  | 'twd'
  | 'uah'
  | 'vef'
  | 'vnd'
  | 'zar';

/**
 * Market data details from Price API spot-prices endpoint
 */
export type MarketDataDetails = {
  /** Current price in the requested currency */
  price: number;
  /** Currency code (e.g., 'ETH', 'USD') */
  currency: string;
  /** 24h price change amount */
  priceChange1d: number;
  /** 24h price change percentage */
  pricePercentChange1d: number;
  /** 1h price change percentage */
  pricePercentChange1h: number;
  /** 7d price change percentage */
  pricePercentChange7d: number;
  /** 14d price change percentage */
  pricePercentChange14d: number;
  /** 30d price change percentage */
  pricePercentChange30d: number;
  /** 200d price change percentage */
  pricePercentChange200d: number;
  /** 1y price change percentage */
  pricePercentChange1y: number;
  /** Market capitalization */
  marketCap: number;
  /** Market cap 24h change percentage */
  marketCapPercentChange1d: number;
  /** All-time high price */
  allTimeHigh: number;
  /** All-time low price */
  allTimeLow: number;
  /** 24h high price */
  high1d: number;
  /** 24h low price */
  low1d: number;
  /** Total trading volume */
  totalVolume: number;
  /** Circulating supply */
  circulatingSupply: number;
  /** Diluted market cap */
  dilutedMarketCap: number;
};

// ============================================================================
// CLIENT OPTIONS
// ============================================================================

export type ApiPlatformClientOptions = {
  /** Client product identifier (e.g., 'metamask-extension') */
  clientProduct: string;
  /** Optional client version */
  clientVersion?: string;
  /** Function to get bearer token for authenticated requests */
  getBearerToken?: () => Promise<string | undefined>;
  /** Optional custom QueryClient instance */
  queryClient?: QueryClient;
};

export type FetchOptions = {
  /** Custom stale time (ms) */
  staleTime?: number;
  /** Custom GC time (ms) */
  gcTime?: number;
};

// ============================================================================
// CONSTANTS
// ============================================================================

/** API Base URLs */
export const API_URLS = {
  ACCOUNTS: 'https://accounts.api.cx.metamask.io',
  PRICES: 'https://price.api.cx.metamask.io',
  TOKEN: 'https://token.api.cx.metamask.io',
  TOKENS: 'https://tokens.api.cx.metamask.io',
} as const;

/** Stale times for different data types (ms) */
export const STALE_TIMES = {
  AUTH_TOKEN: 5 * 60 * 1000, // 5 minutes - cache the auth token
  PRICES: 30 * 1000, // 30 seconds
  BALANCES: 60 * 1000, // 1 minute
  NETWORKS: 10 * 60 * 1000, // 10 minutes
  SUPPORTED_NETWORKS: 30 * 60 * 1000, // 30 minutes
  TOKEN_METADATA: 5 * 60 * 1000, // 5 minutes
  TOKEN_LIST: 10 * 60 * 1000, // 10 minutes
  EXCHANGE_RATES: 5 * 60 * 1000, // 5 minutes
  TRENDING: 2 * 60 * 1000, // 2 minutes
  TRANSACTIONS: 30 * 1000, // 30 seconds
  DEFAULT: 30 * 1000, // 30 seconds
} as const;

/** Garbage collection times (ms) */
export const GC_TIMES = {
  DEFAULT: 5 * 60 * 1000, // 5 minutes
  EXTENDED: 30 * 60 * 1000, // 30 minutes
  SHORT: 2 * 60 * 1000, // 2 minutes
} as const;

/** Retry configuration */
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY: 1000,
  MAX_DELAY: 5_000,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate retry delay with exponential backoff and jitter.
 *
 * @param attemptIndex - The current retry attempt (0-indexed).
 * @returns The delay in milliseconds before the next retry.
 */
export function calculateRetryDelay(attemptIndex: number): number {
  const delay = Math.min(
    RETRY_CONFIG.BASE_DELAY * 2 ** attemptIndex,
    RETRY_CONFIG.MAX_DELAY,
  );
  return delay / 2 + Math.random() * (delay / 2);
}

/**
 * Determine if a failed request should be retried.
 *
 * @param failureCount - The number of failures so far (1 = first failure).
 * @param error - The error from the failed request.
 * @returns True if the request should be retried, false otherwise.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  // Allow up to MAX_RETRIES retries (e.g., MAX_RETRIES=3 means 4 total attempts)
  if (failureCount > RETRY_CONFIG.MAX_RETRIES) {
    return false;
  }

  if (error instanceof Error && 'status' in error) {
    const { status } = error as { status: number };
    // Don't retry 4xx except 429 (rate limit) and 408 (timeout)
    if (status >= 400 && status < 500 && status !== 429 && status !== 408) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// HTTP ERROR
// ============================================================================

export class HttpError extends Error {
  readonly status: number;

  readonly statusText: string;

  readonly url: string;

  readonly body: unknown;

  constructor(
    message: string,
    status: number,
    statusText: string,
    url: string,
    body?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.body = body;
  }
}
