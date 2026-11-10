/**
 * Portable perps display formatters.
 *
 * These are the canonical implementations, exported from the controller so
 * Mobile, Extension and Terminal format every displayed perps value the same
 * way. Each formatter takes one options object (`locale`, `decimals`, `sign`)
 * and renders the shared placeholder from `PERPS_CONSTANTS` for a missing
 * value. No client-specific imports.
 *
 * Intl.NumberFormat instances are cached in a module-level Map keyed by
 * locale and serialized options, avoiding repeated construction costs.
 */
import {
  DECIMAL_PRECISION_CONFIG,
  FUNDING_RATE_CONFIG,
  PERPS_CONSTANTS,
  PERPS_DISPLAY_PRECISION,
} from '../constants/perpsConfig.js';

const DEFAULT_LOCALE = 'en-US';

/**
 * When a formatter prefixes a sign, using the `Intl.NumberFormat`
 * `signDisplay` names. A value that rounds to zero at the displayed precision
 * counts as zero, so no mode shows `-0.00`.
 *
 * - `auto`: `-` for negative values only.
 * - `always`: `+` for positive values and zero, `-` for negative values.
 * - `exceptZero`: `+` for positive, `-` for negative, nothing for zero.
 * - `never`: no sign.
 */
export type PerpsSignDisplay = 'auto' | 'always' | 'exceptZero' | 'never';

/**
 * Options shared by every perps display formatter.
 */
export type PerpsDisplayFormatOptions = {
  /** BCP 47 locale for separators and symbol placement (default `en-US`). */
  locale?: string;
  /** Fraction digits to show; pass a `PERPS_DISPLAY_PRECISION` value. */
  decimals?: number;
  /** When to show a sign; each formatter documents its default. */
  sign?: PerpsSignDisplay;
};

type StripMode = 'none' | 'fiat' | 'all';

// Module-level Intl.NumberFormat cache (keyed by locale and options).
const _fmtCache = new Map<string, Intl.NumberFormat>();

function _getNumberFormat(
  locale: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = _fmtCache.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, options);
    } catch {
      // A tag that is not BCP 47 (e.g. "zh_CN") must not break rendering
      formatter = new Intl.NumberFormat(DEFAULT_LOCALE, options);
    }
    _fmtCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Parses a displayable number. Missing input (`undefined`, `null`, an empty or
 * non-numeric string, `NaN` or an infinite value) returns `undefined`.
 *
 * @param value - The raw value.
 * @returns The finite number, or `undefined` when the value is missing.
 */
function _parseDisplayNumber(value: unknown): number | undefined {
  let parsed = Number.NaN;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    parsed = Number.parseFloat(value);
  }
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Returns the sign prefix for a value.
 *
 * @param value - The signed value.
 * @param isZero - Whether the value rounds to zero at the displayed precision.
 * @param sign - The sign display mode.
 * @returns `+`, `-` or an empty string.
 */
function _signPrefix(
  value: number,
  isZero: boolean,
  sign: PerpsSignDisplay,
): string {
  if (sign === 'never') {
    return '';
  }
  if (isZero) {
    return sign === 'always' ? '+' : '';
  }
  if (value < 0) {
    return '-';
  }
  return sign === 'auto' ? '' : '+';
}

/**
 * Formats a non-negative number with the locale's separators. Callers that
 * must keep `toFixed` rounding pass a value already rounded with it.
 *
 * @param value - Non-negative value.
 * @param locale - BCP 47 locale.
 * @param minimumFractionDigits - Fraction digits always shown.
 * @param maximumFractionDigits - Fraction digits at most shown.
 * @param useGrouping - Whether to group thousands as the locale does.
 * @returns The formatted number.
 */
function _formatDecimal(
  value: number,
  locale: string,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
  useGrouping: boolean,
): string {
  return _getNumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
    // Omitted keeps the locale's own grouping rule (es: "1234,5", "12.345,7")
    ...(useGrouping ? {} : { useGrouping: false }),
  }).format(value);
}

/**
 * Formats a non-negative currency amount, stripping trailing fraction zeros.
 *
 * The digits to keep are read from a canonical `en-US` rendering of the same
 * rounding, then the amount is formatted in the target locale with exactly
 * that many digits. This works for any decimal separator or digit set and
 * does not rely on `formatToParts`, which some Hermes builds return as one
 * literal part.
 *
 * @param amount - Non-negative amount.
 * @param options - Formatting options.
 * @param options.currency - ISO 4217 currency code.
 * @param options.locale - BCP 47 locale.
 * @param options.minimumFractionDigits - Minimum decimal digits.
 * @param options.maximumFractionDigits - Maximum decimal digits.
 * @param options.strip - `fiat` drops an all-zero two-digit fraction (`.00`),
 * `all` drops every trailing fraction zero, `none` keeps them.
 * @returns Formatted currency string.
 */
function _formatCurrency(
  amount: number,
  options: {
    currency: string;
    locale: string;
    minimumFractionDigits: number;
    maximumFractionDigits: number;
    strip: StripMode;
  },
): string {
  let { minimumFractionDigits, maximumFractionDigits } = options;
  if (options.strip !== 'none') {
    const [, fraction = ''] = _formatDecimal(
      amount,
      DEFAULT_LOCALE,
      minimumFractionDigits,
      maximumFractionDigits,
      false,
    ).split('.');
    const kept =
      options.strip === 'fiat' && fraction !== '00'
        ? fraction
        : fraction.replace(/0+$/u, '');
    minimumFractionDigits = kept.length;
    maximumFractionDigits = kept.length;
  }

  return _getNumberFormat(options.locale, {
    style: 'currency',
    currency: options.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
}

/**
 * Price threshold constants for PRICE_RANGES_UNIVERSAL
 * These define the boundaries between different formatting ranges
 */
export const PRICE_THRESHOLD = {
  /** Very high values boundary (> $100k) */
  VERY_HIGH: 100_000,
  /** High values boundary (> $10k) */
  HIGH: 10_000,
  /** Large values boundary (> $1k) */
  LARGE: 1_000,
  /** Medium values boundary (> $100) */
  MEDIUM: 100,
  /** Medium-low values boundary (> $10) */
  MEDIUM_LOW: 10,
  /** Low values boundary (>= $0.01) */
  LOW: 0.01,
  /**
   * Very small values threshold (< $0.01)
   * This is the minimum value for formatWithThreshold and should align with
   * the 6 decimal maximum (0.000001 is the smallest representable value)
   */
  VERY_SMALL: 0.000001,
} as const;

/**
 * Configuration for a specific number range formatting
 */
export type FiatRangeConfig = {
  /**
   * The condition to match for this range (e.g., < 0.0001, < 1, >= 1000)
   * Function should return true if this config should be applied
   */
  condition: (value: number) => boolean;
  /** Minimum decimal places for this range */
  minimumDecimals: number;
  /** Maximum decimal places for this range */
  maximumDecimals: number;
  /** Optional threshold for formatWithThreshold (defaults to the range boundary) */
  threshold?: number;
  /** Optional significant digits for this range (overrides decimal places when set) */
  significantDigits?: number;
  /** Optional custom formatting logic for this range */
  customFormat?: (value: number, locale: string, currency: string) => string;
  /** Optional flag to strip trailing zeros for this range (overrides global stripTrailingZeros option) */
  stripTrailingZeros?: boolean;
  /**
   * Optional flag for fiat-style stripping (only strips .00, preserves meaningful decimals like .10, .40)
   * When true, "$1,250.00" → "$1,250" but "$1,250.10" stays "$1,250.10"
   * When false (default), strips all trailing zeros: "$1,250.10" → "$1,250.1"
   */
  fiatStyleStripping?: boolean;
};

/**
 * Formats a number to a specific number of significant digits
 * Strips trailing zeros unless minDecimals requires them
 *
 * @param value - The numeric value to format
 * @param significantDigits - Number of significant digits to maintain
 * @param minDecimals - Minimum decimal places to show (may add zeros)
 * @param maxDecimals - Maximum decimal places allowed
 * @returns Formatted number with appropriate precision, trailing zeros removed
 */
export function formatWithSignificantDigits(
  value: number,
  significantDigits: number,
  minDecimals?: number,
  maxDecimals?: number,
): { value: number; decimals: number } {
  // Handle special cases
  if (value === 0) {
    // Return zero with no trailing decimals by default (matches stripTrailingZeros behavior)
    // Can be overridden by explicit minDecimals if needed
    return { value: 0, decimals: minDecimals ?? 0 };
  }

  const absValue = Math.abs(value);

  // For numbers >= 1, calculate decimals based on magnitude to achieve target significant figures
  // This ensures consistent precision across different price ranges:
  // Examples with 4 significant figures:
  //   $123,456.78 → $123,456.78 (≥$1000: 2 decimals minimum, 8 sig figs)
  //   $456.12 → $456.12 (≥$10: 2 decimals minimum, 5 sig figs)
  //   $56.123 → $56.123 (≥$10: 2 decimals minimum, 5 sig figs)
  //   $5.123 → $5.123 ($1-$10: 3 decimals = 4 sig figs)
  //   $2.801 → $2.801 ($1-$10: 3 decimals = 4 sig figs)
  //   $1.234 → $1.234 ($1-$10: 3 decimals = 4 sig figs)
  if (absValue >= 1) {
    let targetDecimals: number;

    // Calculate decimals needed based on integer digits to achieve target significant figures
    // For $38.388 with 5 sig figs: 2 integer digits, need 3 decimals (3,8,3,8,8)
    // For $123.45 with 5 sig figs: 3 integer digits, need 2 decimals (1,2,3,4,5)
    const integerDigits = Math.floor(Math.log10(absValue)) + 1;
    const decimalsNeeded = significantDigits - integerDigits;
    targetDecimals = Math.max(decimalsNeeded, 0); // Can't have negative decimals

    // Apply explicit minimum decimals constraint if provided (for special cases)
    if (minDecimals !== undefined && targetDecimals < minDecimals) {
      targetDecimals = minDecimals;
    }

    // Apply maximum decimals constraint if specified
    const finalDecimals =
      maxDecimals === undefined
        ? targetDecimals
        : Math.min(targetDecimals, maxDecimals);

    // Round to prevent floating-point artifacts (e.g., 2.820000000000003 → 2.82)
    const roundedValue = Number(value.toFixed(finalDecimals));

    return {
      value: roundedValue,
      decimals: finalDecimals,
    };
  }

  // For numbers < 1, use toPrecision to limit to significantDigits
  // Examples: 0.1234, 0.01234 should show exactly 4 sig figs
  const precisionStr = absValue.toPrecision(significantDigits);
  const precisionNum = parseFloat(precisionStr);

  // Convert to string to count actual decimals after trailing zeros are removed
  const valueStr = precisionNum.toString();
  const [, decPart = ''] = valueStr.split('.');
  let actualDecimals = decPart.length;

  // Apply min/max decimal constraints
  if (minDecimals !== undefined && actualDecimals < minDecimals) {
    actualDecimals = minDecimals; // Will add zeros if needed
  }
  if (maxDecimals !== undefined && actualDecimals > maxDecimals) {
    actualDecimals = maxDecimals;
  }

  // Return the value with sign restored and decimal count
  return {
    value: value < 0 ? -precisionNum : precisionNum,
    decimals: actualDecimals,
  };
}

/**
 * Minimal view fiat range configuration
 * Uses fiat-style stripping for clean currency display
 * Strips only .00 to avoid partial decimals like $1,250.1
 */
export const PRICE_RANGES_MINIMAL_VIEW: FiatRangeConfig[] = [
  {
    // Large values (>= $1000): Strip .00 only ($5,000 not $5,000.00, but $5,000.10 stays)
    condition: (val: number) => Math.abs(val) >= PRICE_THRESHOLD.LARGE,
    minimumDecimals: 2,
    maximumDecimals: 2,
    threshold: PRICE_THRESHOLD.LARGE,
    stripTrailingZeros: true,
    fiatStyleStripping: true,
  },
  {
    // Small values (< $1000): Also use fiat-style stripping ($100 not $100.00, but $13.40 stays)
    condition: () => true,
    minimumDecimals: 2,
    maximumDecimals: 2,
    threshold: PRICE_THRESHOLD.LOW,
    stripTrailingZeros: true,
    fiatStyleStripping: true,
  },
];

/**
 * Universal price range configuration following comprehensive rules from rules-decimals.md
 *
 * Rules:
 * - Max 6 decimals across all ranges (Hyperliquid limit)
 * - Strip trailing zeros by default
 * - Use |v| (absolute value) for conditions
 *
 * Significant digits by range:
 * - > $100,000: 6 sig digs
 * - $100,000 > x > $0.01: 5 sig digs
 * - < $0.01: 4 sig digs
 *
 * Decimal limits by price range:
 * - |v| > 10,000: min 0, max 0 decimals; 5 sig digs (6 if >100k)
 * - |v| > 1,000: min 0, max 1 decimal; 5 sig digs
 * - |v| > 100: min 0, max 2 decimals; 5 sig digs
 * - |v| > 10: min 0, max 4 decimals; 5 sig digs
 * - |v| ≥ 0.01: 5 sig digs, min 2, max 6 decimals
 * - |v| < 0.01: 4 sig digs, min 2, max 6 decimals
 *
 * Examples:
 * - $123,456.78 → $123,457 (>$10k: 0 decimals, 6 sig figs)
 * - $12,345.67 → $12,346 (>$10k: 0 decimals, 5 sig figs)
 * - $1,234.56 → $1,234.6 ($1k-$10k: 1 decimal, 5 sig figs)
 * - $123.456 → $123.46 ($100-$1k: 2 decimals, 5 sig figs)
 * - $12.34567 → $12.346 ($10-$100: 4 decimals, 5 sig figs)
 * - $1.3445555 → $1.3446 (≥$0.01: 5 sig figs)
 * - $0.333333 → $0.33333 (≥$0.01: 5 sig figs)
 * - $0.004236 → $0.004236 (<$0.01: 4 sig figs, max 6 decimals)
 * - $0.0000006 → $0.000001 (<$0.01: 4 sig figs, rounds with max 6 decimals)
 */
export const PRICE_RANGES_UNIVERSAL: FiatRangeConfig[] = [
  {
    // Very high values (> $100,000): No decimals, 6 significant figures
    // Ex: $123,456.78 → $123,457
    condition: (val) => Math.abs(val) > PRICE_THRESHOLD.VERY_HIGH,
    minimumDecimals: 0,
    maximumDecimals: 0,
    significantDigits: 6,
    threshold: PRICE_THRESHOLD.VERY_HIGH,
  },
  {
    // High values ($10,000-$100,000]: No decimals, 5 significant figures
    // Ex: $12,345.67 → $12,346
    condition: (val) => Math.abs(val) > PRICE_THRESHOLD.HIGH,
    minimumDecimals: 0,
    maximumDecimals: 0,
    significantDigits: 5,
    threshold: PRICE_THRESHOLD.HIGH,
  },
  {
    // Large values ($1,000-$10,000]: Max 1 decimal, 5 significant figures
    // Ex: $1,234.56 → $1,234.6
    condition: (val) => Math.abs(val) > PRICE_THRESHOLD.LARGE,
    minimumDecimals: 0,
    maximumDecimals: 1,
    significantDigits: 5,
    threshold: PRICE_THRESHOLD.LARGE,
  },
  {
    // Medium values ($100-$1,000]: Max 2 decimals, 5 significant figures
    // Ex: $123.456 → $123.46
    condition: (val) => Math.abs(val) > PRICE_THRESHOLD.MEDIUM,
    minimumDecimals: 0,
    maximumDecimals: 2,
    significantDigits: 5,
    threshold: PRICE_THRESHOLD.MEDIUM,
  },
  {
    // Medium-low values ($10-$100]: Max 4 decimals, 5 significant figures
    // Ex: $12.34567 → $12.346
    condition: (val) => Math.abs(val) > PRICE_THRESHOLD.MEDIUM_LOW,
    minimumDecimals: 0,
    maximumDecimals: 4,
    significantDigits: 5,
    threshold: PRICE_THRESHOLD.MEDIUM_LOW,
  },
  {
    // Low values ($0.01-$10]: 5 significant figures, min 2 max MAX_PRICE_DECIMALS decimals
    // Ex: $1.3445555 → $1.3446 | $0.333333 → $0.33333
    condition: (val) => Math.abs(val) >= PRICE_THRESHOLD.LOW,
    significantDigits: 5,
    minimumDecimals: 2,
    maximumDecimals: DECIMAL_PRECISION_CONFIG.MaxPriceDecimals,
    threshold: PRICE_THRESHOLD.LOW,
  },
  {
    // Very small values (< $0.01): 4 significant figures, min 2 max MAX_PRICE_DECIMALS decimals
    // Ex: $0.004236 → $0.004236 | $0.0000006 → $0.000001
    condition: () => true,
    significantDigits: 4,
    minimumDecimals: 2,
    maximumDecimals: DECIMAL_PRECISION_CONFIG.MaxPriceDecimals,
    threshold: PRICE_THRESHOLD.VERY_SMALL,
  },
];

/**
 * Options for `formatPerpsFiat`.
 */
export type PerpsFiatFormatOptions = PerpsDisplayFormatOptions & {
  /** Global minimum decimal places (overrides `decimals` and range configs). */
  minimumDecimals?: number;
  /** Global maximum decimal places (overrides `decimals` and range configs). */
  maximumDecimals?: number;
  /** Global significant digits (overrides decimal settings when set). */
  significantDigits?: number;
  /** Range configurations (default `PRICE_RANGES_MINIMAL_VIEW`). */
  ranges?: FiatRangeConfig[];
  /** ISO 4217 currency code (default `USD`). */
  currency?: string;
  /** Strip trailing zeros; `false` keeps them whatever the range says. */
  stripTrailingZeros?: boolean;
};

/**
 * Formats a fiat value (balance, price, fee, position value) as currency with
 * decimal places chosen by the matching range.
 *
 * @param balance - Raw numeric value (e.g., 1234.56, not token minimal denomination).
 * @param options - Formatting options.
 * @param options.locale - BCP 47 locale (default `en-US`): `es` gives `1234,50 $`.
 * @param options.decimals - Fixed decimal places (e.g. `PERPS_DISPLAY_PRECISION.Fee`), overriding the range.
 * @param options.sign - Sign display (default `auto`: `-` for negative values only).
 * @param options.minimumDecimals - Global minimum decimal places (overrides `decimals` and range configs).
 * @param options.maximumDecimals - Global maximum decimal places (overrides `decimals` and range configs).
 * @param options.significantDigits - Global significant digits (overrides decimal settings when set).
 * @param options.ranges - Custom range configurations (defaults to PRICE_RANGES_MINIMAL_VIEW).
 * @param options.currency - Currency code (default: 'USD').
 * @param options.stripTrailingZeros - Strip trailing zeros from output. `false` keeps them; otherwise the range decides (default: strip).
 * @returns Formatted currency string, or `PERPS_CONSTANTS.FallbackPriceDisplay`
 * (`$---`) for a missing value.
 * @example
 * formatPerpsFiat(1234.56) => "$1,234.56"
 * formatPerpsFiat(1250) => "$1,250"         // fiat-style stripping of .00
 * formatPerpsFiat(-0.004) => "-<$0.01"      // below the range threshold
 * formatPerpsFiat(1234.5, { locale: 'de' }) => "1.234,50 $"
 * formatPerpsFiat(12345.67, { ranges: PRICE_RANGES_UNIVERSAL }) => "$12,346"
 * formatPerpsFiat(undefined) => "$---"
 */
export const formatPerpsFiat = (
  balance: string | number | null | undefined,
  options?: PerpsFiatFormatOptions,
): string => {
  const value = _parseDisplayNumber(balance);
  if (value === undefined) {
    // Placeholder for missing values to avoid confusion with actual $0 values
    return PERPS_CONSTANTS.FallbackPriceDisplay;
  }

  const currency = options?.currency ?? 'USD';
  const locale = options?.locale ?? DEFAULT_LOCALE;
  const ranges = options?.ranges ?? PRICE_RANGES_MINIMAL_VIEW;
  // Find the first matching range configuration
  const rangeConfig = ranges.find((range) => range.condition(value));

  const sigDigits =
    options?.significantDigits ?? rangeConfig?.significantDigits;
  if (rangeConfig?.customFormat && !sigDigits) {
    return rangeConfig.customFormat(value, locale, currency);
  }

  // Strip trailing zeros unless explicitly disabled. Priority: explicit
  // `stripTrailingZeros: false` > range config > option > true.
  let strip: StripMode = 'none';
  if (
    options?.stripTrailingZeros !== false &&
    (rangeConfig?.stripTrailingZeros ?? options?.stripTrailingZeros ?? true)
  ) {
    // Fiat-style only strips .00: "$1,250.00" → "$1,250", "$13.40" stays
    strip = rangeConfig?.fiatStyleStripping ? 'fiat' : 'all';
  }

  let minDecimals =
    options?.minimumDecimals ??
    options?.decimals ??
    rangeConfig?.minimumDecimals ??
    2;
  let maxDecimals =
    options?.maximumDecimals ??
    options?.decimals ??
    rangeConfig?.maximumDecimals ??
    2;
  let amount = Math.abs(value);
  if (rangeConfig && sigDigits) {
    // Calculate appropriate formatting based on significant digits
    const significant = formatWithSignificantDigits(
      value,
      sigDigits,
      minDecimals,
      maxDecimals,
    );
    amount = Math.abs(significant.value);
    minDecimals = significant.decimals;
    maxDecimals = significant.decimals;
  }

  // A non-zero amount below the threshold shows "<$threshold"
  const threshold = rangeConfig?.threshold ?? PRICE_THRESHOLD.LOW;
  const isBelowThreshold = amount !== 0 && amount < threshold;
  const body = _formatCurrency(isBelowThreshold ? threshold : amount, {
    currency,
    locale,
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
    strip,
  });
  const isZero =
    !isBelowThreshold && Math.round(amount * 10 ** maxDecimals) === 0;

  return `${_signPrefix(value, isZero, options?.sign ?? 'auto')}${
    isBelowThreshold ? '<' : ''
  }${body}`;
};

/**
 * Formats position size with variable decimal precision based on magnitude or asset-specific decimals
 * Removes trailing zeros and never groups thousands.
 *
 * @param size - Raw position size value
 * @param szDecimalsOrOptions - Asset-specific decimal precision from Hyperliquid metadata
 * (e.g., BTC=5, ETH=4, DOGE=1), or options:
 * `decimals` (the same precision), `locale` (default `en-US`) and `sign` (default `auto`).
 * @returns Format varies by size or uses asset-specific decimals, with trailing zeros removed:
 * If decimals are provided: Uses at most those decimals (e.g., 0.00009 BTC with szDecimals=5 => "0.00009")
 * Otherwise falls back to magnitude-based logic:
 * - Size < 0.01: Up to 6 decimals (e.g., "0.00009" not "0.000090")
 * - Size < 1: Up to 4 decimals (e.g., "0.0024" not "0.002400")
 * - Size >= 1: Up to 2 decimals (e.g., "44" not "44.00")
 * A missing value returns `PERPS_CONSTANTS.FallbackDataDisplay` (`--`).
 * @example formatPositionSize(0.00009, 5) => "0.00009" (uses szDecimals)
 * @example formatPositionSize(44.00, 1) => "44" (uses szDecimals, trailing zeros removed)
 * @example formatPositionSize(0.0024) => "0.0024" (no szDecimals, uses magnitude logic)
 * @example formatPositionSize(-1234.5, { decimals: 2, locale: 'es' }) => "-1234,5"
 * @example formatPositionSize(undefined) => "--"
 */
export const formatPositionSize = (
  size: string | number | null | undefined,
  szDecimalsOrOptions?: number | PerpsDisplayFormatOptions,
): string => {
  const {
    locale = DEFAULT_LOCALE,
    decimals,
    sign = 'auto',
  } = typeof szDecimalsOrOptions === 'number'
    ? { decimals: szDecimalsOrOptions }
    : (szDecimalsOrOptions ?? {});
  const value = _parseDisplayNumber(size);
  if (value === undefined) {
    return PERPS_CONSTANTS.FallbackDataDisplay;
  }

  const abs = Math.abs(value);
  let maxDecimals = decimals;
  // Fallback: magnitude-based decimal logic for backwards compatibility
  if (maxDecimals === undefined) {
    if (abs < 0.01) {
      maxDecimals = 6;
    } else if (abs < 1) {
      maxDecimals = 4;
    } else {
      maxDecimals = 2;
    }
  }
  const rounded = Number(abs.toFixed(maxDecimals));

  return `${_signPrefix(value, rounded === 0, sign)}${_formatDecimal(
    rounded,
    locale,
    0,
    maxDecimals,
    false,
  )}`;
};

/**
 * Formats a PnL (Profit and Loss) value as USD with a sign prefix
 *
 * @param pnl - Raw numeric PnL value (positive for profit, negative for loss)
 * @param options - `locale` (default `en-US`), `decimals` (default
 * `PERPS_DISPLAY_PRECISION.Pnl`, 2) and `sign` (default `always`).
 * @returns Format: "+$X,XXX.XX" or "-$X,XXX.XX", or
 * `PERPS_CONSTANTS.FallbackPriceDisplay` (`$---`) for a missing value.
 * @example formatPnl(1234.56) => "+$1,234.56"
 * @example formatPnl(-500) => "-$500.00"
 * @example formatPnl(0) => "+$0.00"
 * @example formatPnl(0, { sign: 'exceptZero' }) => "$0.00"
 * @example formatPnl(1234.5, { locale: 'es' }) => "+1234,50 $"
 * @example formatPnl(undefined) => "$---"
 */
export const formatPnl = (
  pnl: string | number | null | undefined,
  options: PerpsDisplayFormatOptions = {},
): string => {
  const {
    locale = DEFAULT_LOCALE,
    decimals = PERPS_DISPLAY_PRECISION.Pnl,
    sign = 'always',
  } = options;
  const value = _parseDisplayNumber(pnl);
  if (value === undefined) {
    return PERPS_CONSTANTS.FallbackPriceDisplay;
  }

  const amount = Math.abs(value);
  const formatted = _formatCurrency(amount, {
    currency: 'USD',
    locale,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    strip: 'none',
  });
  const isZero = Math.round(amount * 10 ** decimals) === 0;

  return `${_signPrefix(value, isZero, sign)}${formatted}`;
};

/**
 * Formats a percentage value (change, RoE, fee rate, slippage) with a sign
 * prefix and locale separators. Pick the precision from
 * `PERPS_DISPLAY_PRECISION`.
 *
 * @param value - Raw percentage value (e.g., 5.25 for 5.25%, not 0.0525)
 * @param decimalsOrOptions - Decimal places (default:
 * `PERPS_DISPLAY_PRECISION.Percentage`, 2), or options: `decimals`,
 * `locale` (default `en-US`) and `sign` (default `always`).
 * @returns Format: "+X.XX%" or "-X.XX%", or
 * `PERPS_CONSTANTS.FallbackPercentageDisplay` (`--%`) for a missing value.
 * @example formatPercentage(5.25) => "+5.25%"
 * @example formatPercentage(-2.75) => "-2.75%"
 * @example formatPercentage(0) => "+0.00%"
 * @example formatPercentage(10.25, { decimals: PERPS_DISPLAY_PRECISION.RoePercent }) => "+10.3%"
 * @example formatPercentage(0.0021, { decimals: PERPS_DISPLAY_PRECISION.SlippageEstimatePercent, sign: 'never' }) => "0.0021%"
 * @example formatPercentage(-12345.67, { decimals: 1, locale: 'es' }) => "-12.345,7%"
 * @example formatPercentage(undefined) => "--%"
 */
export const formatPercentage = (
  value: string | number | null | undefined,
  decimalsOrOptions?: number | PerpsDisplayFormatOptions,
): string => {
  const {
    locale = DEFAULT_LOCALE,
    decimals = PERPS_DISPLAY_PRECISION.Percentage,
    sign = 'always',
  } = typeof decimalsOrOptions === 'number'
    ? { decimals: decimalsOrOptions }
    : (decimalsOrOptions ?? {});
  const parsed = _parseDisplayNumber(value);
  if (parsed === undefined) {
    return PERPS_CONSTANTS.FallbackPercentageDisplay;
  }

  const rounded = Number(Math.abs(parsed).toFixed(decimals));

  return `${_signPrefix(parsed, rounded === 0, sign)}${_formatDecimal(
    rounded,
    locale,
    decimals,
    decimals,
    true,
  )}%`;
};

/**
 * Options for `formatFundingRate`.
 */
export type PerpsFundingRateFormatOptions = PerpsDisplayFormatOptions & {
  /** `false` returns an empty string for a missing rate (default `true`). */
  showZero?: boolean;
};

/**
 * Formats funding rate for display
 *
 * @param value - Raw funding rate value (decimal, not percentage)
 * @param options - Optional formatting options
 * @param options.showZero - `false` returns an empty string instead of the placeholder for a missing rate (default: true)
 * @param options.locale - BCP 47 locale (default `en-US`)
 * @param options.decimals - Decimal places (default `PERPS_DISPLAY_PRECISION.FundingRatePercent`, 4)
 * @param options.sign - Sign display (default `auto`: `-` for negative rates only)
 * @returns Formatted funding rate as percentage string, or
 * `PERPS_CONSTANTS.FallbackPercentageDisplay` (`--%`) for a missing rate.
 * @example formatFundingRate(0.0005) => "0.0500%"
 * @example formatFundingRate(-0.0001) => "-0.0100%"
 * @example formatFundingRate(0.000000059) => "<0.0001%"
 * @example formatFundingRate(-0.000000059) => "-<0.0001%"
 * @example formatFundingRate(0.0005, { sign: 'always', locale: 'es' }) => "+0,0500%"
 * @example formatFundingRate(undefined) => "--%"
 */
export const formatFundingRate = (
  value?: string | number | null,
  options: PerpsFundingRateFormatOptions = {},
): string => {
  const {
    showZero = true,
    locale = DEFAULT_LOCALE,
    decimals = PERPS_DISPLAY_PRECISION.FundingRatePercent,
    sign = 'auto',
  } = options;
  const rate = _parseDisplayNumber(value);
  if (rate === undefined) {
    return showZero ? PERPS_CONSTANTS.FallbackPercentageDisplay : '';
  }

  const percentage = rate * FUNDING_RATE_CONFIG.PercentageMultiplier;
  const rounded = Number(Math.abs(percentage).toFixed(decimals));

  // A non-zero rate below the display precision shows "<0.0001%"
  if (rate !== 0 && rounded === 0) {
    const minimum = _formatDecimal(
      10 ** -decimals,
      locale,
      decimals,
      decimals,
      true,
    );
    return `${_signPrefix(rate, false, sign)}<${minimum}%`;
  }

  return `${_signPrefix(rate, rounded === 0, sign)}${_formatDecimal(
    rounded,
    locale,
    decimals,
    decimals,
    true,
  )}%`;
};
