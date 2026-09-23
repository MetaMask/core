import { PERPS_ERROR_CODES, type PerpsErrorCode } from './perpsErrorCodes.js';

/**
 * Details for a local price movement rejection.
 *
 * The numeric values are kept unformatted so clients can localize and format
 * them for their own surfaces while the legacy error string remains available.
 */
export type PriceMovedErrorDetails = {
  code: typeof PERPS_ERROR_CODES.PRICE_MOVED;
  priceDeltaBps: number;
  maxSlippageBps: number;
  expectedPrice: number;
  currentPrice: number;
  szDecimals: number;
};

export type PerpsErrorDetails = PriceMovedErrorDetails;

export type PerpsErrorResultFields = {
  errorCode?: PerpsErrorCode;
  errorDetails?: PerpsErrorDetails;
};

/**
 * Error that preserves a stable client-facing code and optional structured
 * details across provider and controller error boundaries.
 */
export class PerpsControllerError extends Error {
  readonly errorCode: PerpsErrorCode;

  readonly errorDetails?: PerpsErrorDetails;

  constructor(
    errorCode: PerpsErrorCode,
    message: string,
    errorDetails?: PerpsErrorDetails,
  ) {
    super(message);
    this.name = 'PerpsControllerError';
    this.errorCode = errorCode;
    this.errorDetails = errorDetails;
  }
}

/**
 * Creates the normalized local price movement error used by both providers.
 *
 * @param params - Price snapshots, tolerance, and asset precision.
 * @returns A structured price movement error.
 */
export function createPriceMovedError(params: {
  expectedPrice: number;
  currentPrice: number;
  maxSlippageBps: number;
  szDecimals: number;
}): PerpsControllerError {
  const { expectedPrice, currentPrice, maxSlippageBps, szDecimals } = params;
  const priceDeltaBps = Math.abs(
    ((currentPrice - expectedPrice) / expectedPrice) * 10000,
  );
  const priceDecimals =
    Number.isInteger(szDecimals) && szDecimals >= 0
      ? Math.max(2, szDecimals)
      : 2;

  return new PerpsControllerError(
    PERPS_ERROR_CODES.PRICE_MOVED,
    `Price moved too much: ${priceDeltaBps.toFixed(0)} bps (max: ${maxSlippageBps} bps). ` +
      `Expected: ${expectedPrice.toFixed(priceDecimals)}, Current: ${currentPrice.toFixed(priceDecimals)}`,
    {
      code: PERPS_ERROR_CODES.PRICE_MOVED,
      priceDeltaBps,
      maxSlippageBps,
      expectedPrice,
      currentPrice,
      szDecimals,
    },
  );
}
