import { PERPS_ERROR_CODES } from './perpsErrorCodes.js';
import type { PerpsErrorCode } from './perpsErrorCodes.js';

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
};

/**
 * Provider context for a normalized Hyperliquid failure.
 *
 * Raw venue messages are deliberately excluded because result details cross
 * the client boundary. The original failure is retained as the error cause for
 * telemetry instead.
 */
export type HyperLiquidErrorDetails = {
  code: Exclude<PerpsErrorCode, typeof PERPS_ERROR_CODES.PRICE_MOVED>;
  provider: 'hyperliquid';
};

export type PerpsErrorDetails =
  | PriceMovedErrorDetails
  | HyperLiquidErrorDetails;

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
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PerpsControllerError';
    this.errorCode = errorCode;
    this.errorDetails = errorDetails;
  }
}

/**
 * Creates a normalized local price movement error.
 *
 * @param params - Price movement context.
 * @param params.expectedPrice - Price used when the order was sized.
 * @param params.currentPrice - Current price used for submission.
 * @param params.formattedExpectedPrice - Provider-formatted expected price.
 * @param params.formattedCurrentPrice - Provider-formatted current price.
 * @param params.priceDeltaBps - Absolute price movement in basis points.
 * @param params.maxSlippageBps - Maximum allowed movement in basis points.
 * @returns A structured price movement error.
 */
export function createPriceMovedError(params: {
  expectedPrice: number;
  currentPrice: number;
  formattedExpectedPrice: string;
  formattedCurrentPrice: string;
  priceDeltaBps: number;
  maxSlippageBps: number;
}): PerpsControllerError {
  const {
    expectedPrice,
    currentPrice,
    formattedExpectedPrice,
    formattedCurrentPrice,
    priceDeltaBps,
    maxSlippageBps,
  } = params;

  return new PerpsControllerError(
    PERPS_ERROR_CODES.PRICE_MOVED,
    `Price moved too much: ${priceDeltaBps.toFixed(0)} bps (max: ${maxSlippageBps} bps). ` +
      `Expected: ${formattedExpectedPrice}, Current: ${formattedCurrentPrice}`,
    {
      code: PERPS_ERROR_CODES.PRICE_MOVED,
      priceDeltaBps,
      maxSlippageBps,
      expectedPrice,
      currentPrice,
    },
  );
}
