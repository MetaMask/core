/**
 * Portable perps display formatters.
 *
 * These are the canonical perps display rules, exported from the controller
 * so Mobile, Extension and Terminal format every displayed perps value the
 * same way: price ranges, precision constants, sign and placeholder rules.
 * Each formatter takes one options object (`formatters`, `decimals`, `sign`)
 * and renders the shared placeholder from `PERPS_CONSTANTS` for a missing
 * value.
 *
 * The locale-aware `Intl` formatting comes from the client: pass
 * `createFormatters({ locale })` from `@metamask/client-utils` (built once per
 * locale) as `formatters`. This package does not depend on client-utils; it
 * only needs the `PerpsIntlFormatters` shape. Without `formatters`, an
 * `en-US` fallback keeps the legacy call signatures working.
 */
import { BASIS_POINTS_DIVISOR } from '../constants/hyperLiquidConfig.js';
import {
  DECIMAL_PRECISION_CONFIG,
  FUNDING_RATE_CONFIG,
  PERPS_CONSTANTS,
  PERPS_DISPLAY_PRECISION,
} from '../constants/perpsConfig.js';

/**
 * Locale-bound number formatting the perps rules run on. The `Formatters`
 * returned by `createFormatters({ locale })` from `@metamask/client-utils`
 * satisfy it, with a cached `Intl.NumberFormat` per locale and options.
 */
export type PerpsIntlFormatters = {
  /** Formats a number with `Intl.NumberFormat` options. */
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  /** Formats a currency amount with `Intl.NumberFormat` options. */
  formatCurrency(
    value: number,
    currency: string,
    options?: Intl.NumberFormatOptions,
  ): string;
};

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
  /**
   * Locale-bound formatters from the client, e.g.
   * `createFormatters({ locale })` from `@metamask/client-utils`, built once
   * per locale. Default: `en-US`.
   */
  formatters?: PerpsIntlFormatters;
  /** Fraction digits to show; pass a `PERPS_DISPLAY_PRECISION` value. */
  decimals?: number;
  /** When to show a sign; each formatter documents its default. */
  sign?: PerpsSignDisplay;
};

type StripMode = 'none' | 'fiat' | 'all';

/**
 * `Intl.NumberFormat` cache of the `en-US` fallback, keyed by options.
 * Constructing a formatter costs far more than formatting, so none is built
 * per call. Bounded by the option sets the formatters use.
 */
const _fallbackFormatCache = new Map<string, Intl.NumberFormat>();

function _getFallbackFormat(
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let formatter = _fallbackFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', options);
    _fallbackFormatCache.set(key, formatter);
  }
  return formatter;
}

/**
 * `en-US` formatters used when the caller passes no `formatters`, so the
 * legacy call signatures keep their output.
 */
const _fallbackFormatters: PerpsIntlFormatters = {
  formatNumber: (value, options = {}) =>
    _getFallbackFormat(options).format(value),
  formatCurrency: (value, currency, options = {}) =>
    _getFallbackFormat({ style: 'currency', currency, ...options }).format(
      value,
    ),
};

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
 * @param formatters - Locale-bound formatters.
 * @param value - Non-negative value.
 * @param minimumFractionDigits - Fraction digits always shown.
 * @param maximumFractionDigits - Fraction digits at most shown.
 * @param useGrouping - Whether to group thousands as the locale does.
 * @returns The formatted number.
 */
function _formatDecimal(
  formatters: PerpsIntlFormatters,
  value: number,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
  useGrouping: boolean,
): string {
  return formatters.formatNumber(value, {
    minimumFractionDigits,
    maximumFractionDigits,
    // Omitted keeps the locale's own grouping rule (es: "1234,5", "12.345,7")
    ...(useGrouping ? {} : { useGrouping: false }),
  });
}

/**
 * The magnitude of `value` rounded with `toFixed`, as the decimal formatters
 * (size, percentage, funding) display it.
 *
 * @param value - The signed value.
 * @param decimals - Fraction digits shown.
 * @returns The rounded non-negative value.
 */
function _roundedMagnitude(value: number, decimals: number): number {
  return Number(Math.abs(value).toFixed(decimals));
}

/**
 * Formats a signed number with `toFixed` rounding and the locale's
 * separators. A value that rounds to zero is zero for the sign.
 *
 * @param formatters - Locale-bound formatters.
 * @param value - The signed value.
 * @param options - Formatting options.
 * @param options.minimumFractionDigits - Fraction digits always shown.
 * @param options.maximumFractionDigits - Fraction digits at most shown.
 * @param options.useGrouping - Whether to group thousands as the locale does.
 * @param options.sign - The sign display mode.
 * @returns The sign prefix and formatted magnitude.
 */
function _formatSignedDecimal(
  formatters: PerpsIntlFormatters,
  value: number,
  options: {
    minimumFractionDigits: number;
    maximumFractionDigits: number;
    useGrouping: boolean;
    sign: PerpsSignDisplay;
  },
): string {
  const rounded = _roundedMagnitude(value, options.maximumFractionDigits);
  return `${_signPrefix(value, rounded === 0, options.sign)}${_formatDecimal(
    formatters,
    rounded,
    options.minimumFractionDigits,
    options.maximumFractionDigits,
    options.useGrouping,
  )}`;
}

/**
 * Whether a currency amount shows as zero at `decimals`, with the half away
 * from zero rounding `Intl` applies.
 *
 * @param amount - Non-negative amount.
 * @param decimals - Fraction digits shown.
 * @returns True when the displayed amount is zero.
 */
function _currencyShowsZero(amount: number, decimals: number): boolean {
  return Math.round(amount * 10 ** decimals) === 0;
}

/**
 * Whether `amount` rounded to `maximumFractionDigits` has an all-zero
 * fraction, decided without an `Intl` call.
 *
 * `Intl.NumberFormat` rounds the shortest decimal form of a number
 * (`String(amount)`) half away from zero, so this reads that form's digits as
 * text: exact for any magnitude, including exponent forms such as `1.5e+21`
 * and `5e-7`.
 *
 * @param amount - Non-negative amount.
 * @param maximumFractionDigits - Fraction digits the amount is rounded to.
 * @returns True when the rounded amount is a whole number.
 */
function _roundsToWhole(
  amount: number,
  maximumFractionDigits: number,
): boolean {
  const [mantissa, exponentText = '0'] = String(amount).split('e');
  const [integerPart, fractionPart = ''] = mantissa.split('.');
  // Fraction digits once the exponent is applied
  const shift = Number(exponentText);
  // An exponent form has one integer digit: "1.23e-7" → "000000123"
  const fraction =
    shift >= 0
      ? fractionPart.slice(shift)
      : `${'0'.repeat(-shift - 1)}${integerPart}${fractionPart}`;
  const kept = fraction.slice(0, maximumFractionDigits);
  const roundsUp = (fraction[maximumFractionDigits] ?? '0') >= '5';
  return roundsUp ? /^9*$/u.test(kept) : /^0*$/u.test(kept);
}

/**
 * Formats a non-negative currency amount, stripping trailing fraction zeros.
 *
 * Stripping is done through the fraction-digit options, so the amount is
 * formatted once. This works for any decimal separator or digit set and does
 * not rely on `formatToParts`, which some Hermes builds return as one literal
 * part.
 *
 * @param formatters - Locale-bound formatters.
 * @param amount - Non-negative amount.
 * @param options - Formatting options.
 * @param options.currency - ISO 4217 currency code.
 * @param options.minimumFractionDigits - Minimum decimal digits.
 * @param options.maximumFractionDigits - Maximum decimal digits.
 * @param options.strip - `fiat` drops an all-zero two-digit fraction (`.00`),
 * `all` drops every trailing fraction zero, `none` keeps them.
 * @param options.symbol - `false` formats the number without the currency
 * symbol, for chart labels (default `true`).
 * @returns Formatted currency string.
 */
function _formatCurrency(
  formatters: PerpsIntlFormatters,
  amount: number,
  options: {
    currency: string;
    minimumFractionDigits: number;
    maximumFractionDigits: number;
    strip: StripMode;
    symbol?: boolean;
  },
): string {
  let { minimumFractionDigits, maximumFractionDigits } = options;
  if (options.strip === 'all') {
    // Intl drops trailing fraction zeros down to the minimum
    minimumFractionDigits = 0;
  } else if (options.strip === 'fiat' && minimumFractionDigits === 2) {
    if (_roundsToWhole(amount, maximumFractionDigits)) {
      // Fiat-style: only an all-zero ".00" fraction is dropped
      minimumFractionDigits = 0;
      maximumFractionDigits = 0;
    }
  }

  if (options.symbol === false) {
    return formatters.formatNumber(amount, {
      minimumFractionDigits,
      maximumFractionDigits,
    });
  }
  return formatters.formatCurrency(amount, options.currency, {
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

/**
 * Formats a non-negative USD amount with fixed decimals and appends a
 * magnitude suffix (`K`, `M`, `B`, `T`) right after the number, wherever the
 * locale puts the currency symbol: `$1.23M`, `1,23M $`.
 *
 * The suffix is placed by finding the formatted number in the currency
 * output, not through `formatToParts` or `notation: 'compact'`, which Hermes
 * does not reliably support.
 *
 * @param formatters - Locale-bound formatters.
 * @param amount - Non-negative amount, already divided by the scale.
 * @param options - Formatting options.
 * @param options.decimals - Fraction digits always shown.
 * @param options.suffix - Magnitude suffix, or an empty string.
 * @param options.symbol - `false` formats without the currency symbol.
 * @returns The formatted amount.
 */
function _formatScaledUsd(
  formatters: PerpsIntlFormatters,
  amount: number,
  options: { decimals: number; suffix: string; symbol: boolean },
): string {
  const { decimals, suffix, symbol } = options;
  if (!symbol) {
    return `${_formatDecimal(formatters, amount, decimals, decimals, true)}${suffix}`;
  }
  const money = _formatCurrency(formatters, amount, {
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    strip: 'none',
  });
  if (!suffix) {
    return money;
  }
  const number = _formatDecimal(formatters, amount, decimals, decimals, true);
  const index = money.indexOf(number);
  if (index === -1) {
    return `${money}${suffix}`;
  }
  const end = index + number.length;
  return `${money.slice(0, end)}${suffix}${money.slice(end)}`;
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
  /**
   * Locale passed to a range's `customFormat` (default `en-US`). The output
   * locale comes from `formatters`.
   */
  locale?: string;
  /**
   * `false` formats the number without the currency symbol, e.g. chart axis
   * and crosshair labels: `87,123` (default `true`).
   */
  symbol?: boolean;
};

/**
 * Formats a fiat value (balance, price, fee, position value) as currency with
 * decimal places chosen by the matching range.
 *
 * @param balance - Raw numeric value (e.g., 1234.56, not token minimal denomination).
 * @param options - Formatting options.
 * @param options.formatters - Locale-bound formatters, e.g. `createFormatters({ locale: 'de' })` from `@metamask/client-utils` (default `en-US`).
 * @param options.decimals - Fixed decimal places (e.g. `PERPS_DISPLAY_PRECISION.Fee`), overriding the range.
 * @param options.sign - Sign display (default `auto`: `-` for negative values only).
 * @param options.minimumDecimals - Global minimum decimal places (overrides `decimals` and range configs).
 * @param options.maximumDecimals - Global maximum decimal places (overrides `decimals` and range configs).
 * @param options.significantDigits - Global significant digits (overrides decimal settings when set).
 * @param options.ranges - Custom range configurations (defaults to PRICE_RANGES_MINIMAL_VIEW).
 * @param options.currency - Currency code (default: 'USD').
 * @param options.stripTrailingZeros - Strip trailing zeros from output. `false` keeps them; otherwise the range decides (default: strip).
 * @param options.locale - Locale passed to a range's `customFormat` only (default `en-US`).
 * @param options.symbol - `false` omits the currency symbol, for chart labels (default `true`).
 * @returns Formatted currency string, or `PERPS_CONSTANTS.FallbackPriceDisplay`
 * (`$---`) for a missing value (`PERPS_CONSTANTS.FallbackDataDisplay`, `--`,
 * without the symbol).
 * @example
 * formatPerpsFiat(1234.56) => "$1,234.56"
 * formatPerpsFiat(1250) => "$1,250"         // fiat-style stripping of .00
 * formatPerpsFiat(-0.004) => "-<$0.01"      // below the range threshold
 * formatPerpsFiat(1234.5, { formatters: createFormatters({ locale: 'de' }) }) => "1.234,50 $"
 * formatPerpsFiat(12345.67, { ranges: PRICE_RANGES_UNIVERSAL }) => "$12,346"
 * formatPerpsFiat(2480.37, { ranges: PRICE_RANGES_UNIVERSAL, symbol: false }) => "2,480.4"
 * formatPerpsFiat(undefined) => "$---"
 */
export const formatPerpsFiat = (
  balance: string | number | null | undefined,
  options?: PerpsFiatFormatOptions,
): string => {
  const value = _parseDisplayNumber(balance);
  if (value === undefined) {
    // Placeholder for missing values to avoid confusion with actual $0 values
    return options?.symbol === false
      ? PERPS_CONSTANTS.FallbackDataDisplay
      : PERPS_CONSTANTS.FallbackPriceDisplay;
  }

  const currency = options?.currency ?? 'USD';
  const ranges = options?.ranges ?? PRICE_RANGES_MINIMAL_VIEW;
  // Find the first matching range configuration
  const rangeConfig = ranges.find((range) => range.condition(value));

  const sigDigits =
    options?.significantDigits ?? rangeConfig?.significantDigits;
  if (rangeConfig?.customFormat && !sigDigits) {
    return rangeConfig.customFormat(
      value,
      options?.locale ?? 'en-US',
      currency,
    );
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
  const body = _formatCurrency(
    options?.formatters ?? _fallbackFormatters,
    isBelowThreshold ? threshold : amount,
    {
      currency,
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
      strip,
      symbol: options?.symbol,
    },
  );
  const isZero = !isBelowThreshold && _currencyShowsZero(amount, maxDecimals);

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
 * `decimals` (the same precision), `formatters` (default `en-US`) and `sign` (default `auto`).
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
 * @example formatPositionSize(-1234.5, { decimals: 2, formatters: createFormatters({ locale: 'es' }) }) => "-1234,5"
 * @example formatPositionSize(undefined) => "--"
 */
export const formatPositionSize = (
  size: string | number | null | undefined,
  szDecimalsOrOptions?: number | PerpsDisplayFormatOptions,
): string => {
  const {
    formatters = _fallbackFormatters,
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
  return _formatSignedDecimal(formatters, value, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
    useGrouping: false,
    sign,
  });
};

/**
 * Formats a PnL (Profit and Loss) value as USD with a sign prefix
 *
 * @param pnl - Raw numeric PnL value (positive for profit, negative for loss)
 * @param options - `formatters` (default `en-US`), `decimals` (default
 * `PERPS_DISPLAY_PRECISION.Pnl`, 2) and `sign` (default `always`).
 * @returns Format: "+$X,XXX.XX" or "-$X,XXX.XX", or
 * `PERPS_CONSTANTS.FallbackPriceDisplay` (`$---`) for a missing value.
 * @example formatPnl(1234.56) => "+$1,234.56"
 * @example formatPnl(-500) => "-$500.00"
 * @example formatPnl(0) => "+$0.00"
 * @example formatPnl(0, { sign: 'exceptZero' }) => "$0.00"
 * @example formatPnl(1234.5, { formatters: createFormatters({ locale: 'es' }) }) => "+1234,50 $"
 * @example formatPnl(undefined) => "$---"
 */
export const formatPnl = (
  pnl: string | number | null | undefined,
  options: PerpsDisplayFormatOptions = {},
): string => {
  const {
    formatters = _fallbackFormatters,
    decimals = PERPS_DISPLAY_PRECISION.Pnl,
    sign = 'always',
  } = options;
  const value = _parseDisplayNumber(pnl);
  if (value === undefined) {
    return PERPS_CONSTANTS.FallbackPriceDisplay;
  }

  const amount = Math.abs(value);
  const formatted = _formatCurrency(formatters, amount, {
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    strip: 'none',
  });
  return `${_signPrefix(value, _currencyShowsZero(amount, decimals), sign)}${formatted}`;
};

/**
 * Options for `formatPercentage`.
 */
export type PerpsPercentageFormatOptions = PerpsDisplayFormatOptions & {
  /**
   * Drop trailing fraction zeros, showing at most `decimals`: TWAP progress
   * `25%`, `33.33%` (default `false`: always `decimals`).
   */
  stripTrailingZeros?: boolean;
};

/**
 * Formats a percentage value (change, RoE, fee rate, slippage) with a sign
 * prefix and locale separators. Pick the precision from
 * `PERPS_DISPLAY_PRECISION`.
 *
 * @param value - Raw percentage value (e.g., 5.25 for 5.25%, not 0.0525)
 * @param decimalsOrOptions - Decimal places (default:
 * `PERPS_DISPLAY_PRECISION.Percentage`, 2), or options: `decimals`,
 * `formatters` (default `en-US`), `sign` (default `always`) and
 * `stripTrailingZeros` (default `false`).
 * @returns Format: "+X.XX%" or "-X.XX%", or
 * `PERPS_CONSTANTS.FallbackPercentageDisplay` (`--%`) for a missing value.
 * @example formatPercentage(5.25) => "+5.25%"
 * @example formatPercentage(-2.75) => "-2.75%"
 * @example formatPercentage(0) => "+0.00%"
 * @example formatPercentage(10.25, { decimals: PERPS_DISPLAY_PRECISION.RoePercent }) => "+10.3%"
 * @example formatPercentage(0.0021, { decimals: PERPS_DISPLAY_PRECISION.SlippageEstimatePercent, sign: 'never' }) => "0.0021%"
 * @example formatPercentage(-12345.67, { decimals: 1, formatters: createFormatters({ locale: 'es' }) }) => "-12.345,7%"
 * @example formatPercentage(25, { decimals: PERPS_DISPLAY_PRECISION.TwapProgressPercent, stripTrailingZeros: true, sign: 'never' }) => "25%"
 * @example formatPercentage(undefined) => "--%"
 */
export const formatPercentage = (
  value: string | number | null | undefined,
  decimalsOrOptions?: number | PerpsPercentageFormatOptions,
): string => {
  const {
    formatters = _fallbackFormatters,
    decimals = PERPS_DISPLAY_PRECISION.Percentage,
    sign = 'always',
    stripTrailingZeros = false,
  } = typeof decimalsOrOptions === 'number'
    ? { decimals: decimalsOrOptions }
    : (decimalsOrOptions ?? {});
  const parsed = _parseDisplayNumber(value);
  if (parsed === undefined) {
    return PERPS_CONSTANTS.FallbackPercentageDisplay;
  }

  return `${_formatSignedDecimal(formatters, parsed, {
    minimumFractionDigits: stripTrailingZeros ? 0 : decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
    sign,
  })}%`;
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
 * @param options.formatters - Locale-bound formatters, e.g. `createFormatters({ locale })` from `@metamask/client-utils` (default `en-US`)
 * @param options.decimals - Decimal places (default `PERPS_DISPLAY_PRECISION.FundingRatePercent`, 4)
 * @param options.sign - Sign display (default `auto`: `-` for negative rates only)
 * @returns Formatted funding rate as percentage string, or
 * `PERPS_CONSTANTS.FallbackPercentageDisplay` (`--%`) for a missing rate.
 * @example formatFundingRate(0.0005) => "0.0500%"
 * @example formatFundingRate(-0.0001) => "-0.0100%"
 * @example formatFundingRate(0.000000059) => "<0.0001%"
 * @example formatFundingRate(-0.000000059) => "-<0.0001%"
 * @example formatFundingRate(0.0005, { sign: 'always', formatters: createFormatters({ locale: 'es' }) }) => "+0,0500%"
 * @example formatFundingRate(undefined) => "--%"
 */
export const formatFundingRate = (
  value?: string | number | null,
  options: PerpsFundingRateFormatOptions = {},
): string => {
  const {
    showZero = true,
    formatters = _fallbackFormatters,
    decimals = PERPS_DISPLAY_PRECISION.FundingRatePercent,
    sign = 'auto',
  } = options;
  const rate = _parseDisplayNumber(value);
  if (rate === undefined) {
    return showZero ? PERPS_CONSTANTS.FallbackPercentageDisplay : '';
  }

  const percentage = rate * FUNDING_RATE_CONFIG.PercentageMultiplier;
  // A non-zero rate below the display precision shows "<0.0001%"
  if (rate !== 0 && _roundedMagnitude(percentage, decimals) === 0) {
    const minimum = _formatDecimal(
      formatters,
      10 ** -decimals,
      decimals,
      decimals,
      true,
    );
    return `${_signPrefix(rate, false, sign)}<${minimum}%`;
  }

  return `${_formatSignedDecimal(formatters, percentage, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
    sign,
  })}%`;
};

/**
 * Formats a fee rate in basis points with the locale's separators.
 *
 * @param rate - Fee rate as a decimal (0.00045 for 0.045%).
 * @param options - `formatters` (default `en-US`), `decimals` (at most,
 * default `PERPS_DISPLAY_PRECISION.FeeBps`, 2; trailing zeros are dropped) and
 * `sign` (default `auto`).
 * @returns Format: "X.XX bps", or `PERPS_CONSTANTS.FallbackDataDisplay` (`--`)
 * for a missing rate.
 * @example formatFeeBps(0.00045) => "4.5 bps"
 * @example formatFeeBps(0.000144) => "1.44 bps"
 * @example formatFeeBps(0.0007) => "7 bps"
 * @example formatFeeBps(0.00045, { formatters: createFormatters({ locale: 'de' }) }) => "4,5 bps"
 * @example formatFeeBps(undefined) => "--"
 */
export const formatFeeBps = (
  rate: string | number | null | undefined,
  options: PerpsDisplayFormatOptions = {},
): string => {
  const {
    formatters = _fallbackFormatters,
    decimals = PERPS_DISPLAY_PRECISION.FeeBps,
    sign = 'auto',
  } = options;
  const parsed = _parseDisplayNumber(rate);
  if (parsed === undefined) {
    return PERPS_CONSTANTS.FallbackDataDisplay;
  }

  return `${_formatSignedDecimal(formatters, parsed * BASIS_POINTS_DIVISOR, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    useGrouping: true,
    sign,
  })} bps`;
};

/**
 * Formats how far, in percent of the entry price, the price must move to
 * reach the liquidation price.
 *
 * @param entryPrice - Entry (or mark) price.
 * @param liquidationPrice - Liquidation price.
 * @param options - `formatters` (default `en-US`), `decimals` (default
 * `PERPS_DISPLAY_PRECISION.LiquidationDistancePercent`, 2) and `sign`
 * (default `never`).
 * @returns Format: "X.XX%", or `PERPS_CONSTANTS.FallbackPercentageDisplay`
 * (`--%`) when either price is missing or not positive.
 * @example formatLiquidationDistance(100, 70) => "30.00%"
 * @example formatLiquidationDistance(100, '130') => "30.00%"
 * @example formatLiquidationDistance(100, 70, { formatters: createFormatters({ locale: 'de' }) }) => "30,00%"
 * @example formatLiquidationDistance(100, undefined) => "--%"
 */
export const formatLiquidationDistance = (
  entryPrice: string | number | null | undefined,
  liquidationPrice: string | number | null | undefined,
  options: PerpsDisplayFormatOptions = {},
): string => {
  const entry = _parseDisplayNumber(entryPrice);
  const liquidation = _parseDisplayNumber(liquidationPrice);
  if (
    entry === undefined ||
    liquidation === undefined ||
    entry <= 0 ||
    liquidation <= 0
  ) {
    return PERPS_CONSTANTS.FallbackPercentageDisplay;
  }

  return formatPercentage((Math.abs(entry - liquidation) / entry) * 100, {
    formatters: options.formatters,
    decimals:
      options.decimals ?? PERPS_DISPLAY_PRECISION.LiquidationDistancePercent,
    sign: options.sign ?? 'never',
  });
};

/** Each magnitude scale is this many times the next smaller one. */
const SCALE_STEP = 1000;

/** Magnitude scales of compact values, largest first. */
const COMPACT_SCALES = [
  { divisor: 1_000_000_000_000, suffix: 'T' },
  { divisor: 1_000_000_000, suffix: 'B' },
  { divisor: 1_000_000, suffix: 'M' },
  { divisor: SCALE_STEP, suffix: 'K' },
  { divisor: 1, suffix: '' },
] as const;

/**
 * Picks the magnitude scale of a non-negative amount and rounds it. A
 * mantissa that rounds up to 1000 moves to the next scale, so 999999 shows as
 * `1.00M`, not `1000K`.
 *
 * @param amount - Non-negative amount.
 * @param decimalsFor - Fraction digits shown at a scale divisor.
 * @returns The rounded mantissa, its decimals and suffix.
 */
function _scaleCompact(
  amount: number,
  decimalsFor: (divisor: number) => number,
): { mantissa: number; decimals: number; suffix: string } {
  let index = COMPACT_SCALES.findIndex(({ divisor }) => amount >= divisor);
  if (index === -1) {
    index = COMPACT_SCALES.length - 1;
  }
  for (;;) {
    const { divisor, suffix } = COMPACT_SCALES[index];
    const decimals = decimalsFor(divisor);
    const mantissa = Number((amount / divisor).toFixed(decimals));
    if (mantissa < SCALE_STEP || index === 0) {
      return { mantissa, decimals, suffix };
    }
    index -= 1;
  }
}

/**
 * The value a compact number stands for, which sets its unit and precision.
 *
 * - `volume`: USD volume or open interest: `$1.23M`, `$123K`, `$999.50`.
 * - `orderBookUsd`: USD order book size or total: `$2.1K` from 1,000 up,
 * `PRICE_RANGES_UNIVERSAL` below.
 * - `orderBookSize`: base-asset order book size or total: `604.9K` from 1,000
 * up, `formatPositionSize` with `szDecimals` below.
 */
export type PerpsCompactField = 'volume' | 'orderBookUsd' | 'orderBookSize';

/**
 * Options for `formatPerpsCompact`.
 */
export type PerpsCompactFormatOptions = PerpsDisplayFormatOptions & {
  /** The value being shown, which sets the unit and precision. */
  field: PerpsCompactField;
  /** Asset size decimals for an `orderBookSize` value below 1,000. */
  szDecimals?: number;
};

/**
 * Formats a large number with a magnitude suffix (`K`, `M`, `B`, `T`), with
 * the unit and precision of the field it shows.
 *
 * @param value - Raw value (USD for `volume` and `orderBookUsd`, base asset
 * for `orderBookSize`).
 * @param options - Formatting options.
 * @param options.field - `volume`, `orderBookUsd` or `orderBookSize`.
 * @param options.formatters - Locale-bound formatters, e.g. `createFormatters({ locale })` from `@metamask/client-utils` (default `en-US`).
 * @param options.decimals - Decimals of abbreviated values, overriding the
 * field's `PERPS_DISPLAY_PRECISION` (`VolumeCompact`, `VolumeCompactThousands`
 * or `OrderBookCompact`).
 * @param options.sign - Sign display (default `auto`).
 * @param options.szDecimals - Asset size decimals for an `orderBookSize` value below 1,000.
 * @returns The compact value, or `PERPS_CONSTANTS.FallbackPriceDisplay`
 * (`$---`, `--` for `orderBookSize`) for a missing value.
 * @example formatPerpsCompact(1234567, { field: 'volume' }) => "$1.23M"
 * @example formatPerpsCompact(123456, { field: 'volume' }) => "$123K"
 * @example formatPerpsCompact(999.5, { field: 'volume' }) => "$999.50"
 * @example formatPerpsCompact(1234567, { field: 'volume', formatters: createFormatters({ locale: 'de' }) }) => "1,23M $"
 * @example formatPerpsCompact(2100, { field: 'orderBookUsd' }) => "$2.1K"
 * @example formatPerpsCompact(604900, { field: 'orderBookSize' }) => "604.9K"
 */
export const formatPerpsCompact = (
  value: string | number | null | undefined,
  options: PerpsCompactFormatOptions,
): string => {
  const {
    field,
    formatters = _fallbackFormatters,
    decimals,
    sign = 'auto',
    szDecimals,
  } = options;
  const isUsd = field !== 'orderBookSize';
  const parsed = _parseDisplayNumber(value);
  if (parsed === undefined) {
    return isUsd
      ? PERPS_CONSTANTS.FallbackPriceDisplay
      : PERPS_CONSTANTS.FallbackDataDisplay;
  }

  const amount = Math.abs(parsed);
  if (field !== 'volume' && amount < SCALE_STEP) {
    return field === 'orderBookUsd'
      ? formatPerpsFiat(parsed, {
          ranges: PRICE_RANGES_UNIVERSAL,
          formatters,
          sign,
        })
      : formatPositionSize(parsed, { decimals: szDecimals, formatters, sign });
  }

  const scaled = _scaleCompact(amount, (divisor) => {
    if (decimals !== undefined) {
      return decimals;
    }
    if (field !== 'volume') {
      return PERPS_DISPLAY_PRECISION.OrderBookCompact;
    }
    return divisor === SCALE_STEP
      ? PERPS_DISPLAY_PRECISION.VolumeCompactThousands
      : PERPS_DISPLAY_PRECISION.VolumeCompact;
  });
  return `${_signPrefix(parsed, scaled.mantissa === 0, sign)}${_formatScaledUsd(
    formatters,
    scaled.mantissa,
    { decimals: scaled.decimals, suffix: scaled.suffix, symbol: isUsd },
  )}`;
};

/**
 * How every price of an order book ladder renders: divided by `divisor`, with
 * `decimals` fixed decimals and `suffix` after the number.
 */
export type PerpsOrderBookPriceFormat = {
  /** Value each price is divided by before formatting. */
  divisor: number;
  /** Magnitude suffix appended after the number, or an empty string. */
  suffix: string;
  /** Fixed decimals shown after dividing. */
  decimals: number;
};

/**
 * Exact decimal places of a number, read from its exponential form so values
 * such as `1e-7` and `0.002` do not depend on a rounded `Math.log10`.
 *
 * @param value - The number.
 * @returns Its decimal places.
 */
function _countDecimalPlaces(value: number): number {
  const [mantissa, exponent] = Math.abs(value).toExponential().split('e');
  return Math.max(0, (mantissa.split('.')[1] ?? '').length - Number(exponent));
}

/**
 * Options for `formatPerpsOrderBookPrice`.
 */
export type PerpsOrderBookPriceFormatOptions = {
  /**
   * Locale-bound formatters, e.g. `createFormatters({ locale })` from
   * `@metamask/client-utils`. Default: `en-US`.
   */
  formatters?: PerpsIntlFormatters;
  /** `false` omits the currency symbol (default `true`). */
  symbol?: boolean;
};

/**
 * Formats an order book price with the ladder format from
 * `getPerpsOrderBookPriceFormat`, keeping trailing zeros so every row has the
 * same width.
 *
 * @param price - Raw price.
 * @param format - Ladder format, or null for `PRICE_RANGES_UNIVERSAL`.
 * @param options - `formatters` (default `en-US`) and `symbol` (default `true`).
 * @returns The price, or `PERPS_CONSTANTS.FallbackPriceDisplay` (`$---`; `--`
 * without the symbol) for a missing price.
 * @example formatPerpsOrderBookPrice(87000, { divisor: 1000, suffix: 'K', decimals: 0 }) => "$87K"
 * @example formatPerpsOrderBookPrice(33.1, { divisor: 1, suffix: '', decimals: 3 }) => "$33.100"
 * @example formatPerpsOrderBookPrice(87000, { divisor: 1, suffix: '', decimals: 0 }, { symbol: false }) => "87,000"
 */
export const formatPerpsOrderBookPrice = (
  price: string | number | null | undefined,
  format: PerpsOrderBookPriceFormat | null,
  options: PerpsOrderBookPriceFormatOptions = {},
): string => {
  const { formatters = _fallbackFormatters, symbol = true } = options;
  const value = _parseDisplayNumber(price);
  if (value === undefined) {
    return symbol
      ? PERPS_CONSTANTS.FallbackPriceDisplay
      : PERPS_CONSTANTS.FallbackDataDisplay;
  }
  if (format === null) {
    return formatPerpsFiat(value, {
      ranges: PRICE_RANGES_UNIVERSAL,
      formatters,
      symbol,
    });
  }

  const amount = Math.abs(value) / format.divisor;
  return `${_signPrefix(
    value,
    _currencyShowsZero(amount, format.decimals),
    'auto',
  )}${_formatScaledUsd(formatters, amount, {
    decimals: format.decimals,
    suffix: format.suffix,
    symbol,
  })}`;
};

/**
 * Resolves the one price format an order book ladder renders with, from the
 * selected price grouping (tick) increment.
 *
 * Decimals match the grouping, capped at the asset's price precision
 * (`PERPS_DISPLAY_PRECISION.MaxPriceDecimals − szDecimals`), so neighbouring
 * levels never collapse into the same string and every row has the same
 * width. The ladder is abbreviated (`$87K`) at the magnitude of `midPrice`
 * only when that needs at most
 * `PERPS_DISPLAY_PRECISION.OrderBookAbbreviatedPriceMax` decimals and is no
 * longer than the plain form.
 *
 * @param grouping - Selected price grouping increment, or null when unknown.
 * @param midPrice - Ladder mid price, which sets the magnitude.
 * @param szDecimals - Asset size decimals from the market metadata.
 * @returns The ladder format, or null to use `PRICE_RANGES_UNIVERSAL`.
 * @example getPerpsOrderBookPriceFormat(1000, 87000, 5) => { divisor: 1000, suffix: 'K', decimals: 0 }
 * @example getPerpsOrderBookPriceFormat(1, 87000, 5) => { divisor: 1, suffix: '', decimals: 0 }
 * @example getPerpsOrderBookPriceFormat(0.001, 33.1, 2) => { divisor: 1, suffix: '', decimals: 3 }
 */
export const getPerpsOrderBookPriceFormat = (
  grouping: number | null | undefined,
  midPrice?: number | null,
  szDecimals?: number,
): PerpsOrderBookPriceFormat | null => {
  if (
    typeof grouping !== 'number' ||
    !Number.isFinite(grouping) ||
    grouping <= 0
  ) {
    return null;
  }

  const maxDecimals =
    typeof szDecimals === 'number' && Number.isFinite(szDecimals)
      ? Math.max(0, PERPS_DISPLAY_PRECISION.MaxPriceDecimals - szDecimals)
      : PERPS_DISPLAY_PRECISION.MaxPriceDecimals;
  const plain: PerpsOrderBookPriceFormat = {
    divisor: 1,
    suffix: '',
    decimals: Math.min(_countDecimalPlaces(grouping), maxDecimals),
  };
  if (typeof midPrice !== 'number' || !Number.isFinite(midPrice)) {
    return plain;
  }

  const magnitude = Math.abs(midPrice);
  const scale = COMPACT_SCALES.find(
    ({ divisor }) =>
      divisor > 1 && magnitude >= divisor && magnitude < divisor * SCALE_STEP,
  );
  if (!scale) {
    return plain;
  }
  const decimals = _countDecimalPlaces(grouping / scale.divisor);
  if (decimals > PERPS_DISPLAY_PRECISION.OrderBookAbbreviatedPriceMax) {
    return plain;
  }

  const abbreviated: PerpsOrderBookPriceFormat = {
    divisor: scale.divisor,
    suffix: scale.suffix,
    decimals,
  };
  return formatPerpsOrderBookPrice(midPrice, abbreviated).length <=
    formatPerpsOrderBookPrice(midPrice, plain).length
    ? abbreviated
    : plain;
};

/**
 * Options for `formatPerpsUsdInput`.
 */
export type PerpsUsdInputFormatOptions = {
  /**
   * Locale-bound formatters, e.g. `createFormatters({ locale })` from
   * `@metamask/client-utils`. Default: `en-US`.
   */
  formatters?: PerpsIntlFormatters;
  /** Most fraction digits (default `PERPS_DISPLAY_PRECISION.UsdInput`, 2). */
  decimals?: number;
  /**
   * Most digits, integer and fraction together (default
   * `PERPS_DISPLAY_PRECISION.UsdInputMaxDigits`, 9; at most 15).
   */
  maxDigits?: number;
  /**
   * What `input` is: `typed` text in the locale's format, e.g. the field's
   * display plus a keystroke (default), or a stored canonical `value` with a
   * `.` decimal separator, e.g. a preset amount.
   */
  source?: 'typed' | 'value';
};

/** Most digits a USD input keeps exact when grouped through a number. */
const MAX_EXACT_INPUT_DIGITS = 15;

/**
 * A masked USD input: `value` to store and parse, `display` to show.
 */
export type PerpsUsdInput = {
  /** Canonical amount with a `.` decimal separator: `1234567.5`. */
  value: string;
  /** The amount with the locale's grouping and decimal separator. */
  display: string;
};

type LocaleNumberSymbols = {
  decimal: string;
  grouping: string;
  // The locale's glyphs for 0-9
  digits: string[];
};

/** Separators and digits per formatter set, read once. */
const _localeSymbolsCache = new WeakMap<
  PerpsIntlFormatters,
  LocaleNumberSymbols
>();

/**
 * Reads the decimal separator, grouping separator and digits of a locale from
 * formatted samples, without `formatToParts`.
 *
 * @param formatters - Locale-bound formatters.
 * @returns The locale's number symbols.
 */
function _getLocaleNumberSymbols(
  formatters: PerpsIntlFormatters,
): LocaleNumberSymbols {
  let symbols = _localeSymbolsCache.get(formatters);
  if (!symbols) {
    // "1234567890" in the locale's digits: glyph of 1, 2, ..., 9, 0
    const sample = Array.from(
      formatters.formatNumber(1234567890, { useGrouping: false }),
    );
    symbols = {
      decimal: Array.from(
        formatters.formatNumber(1.5, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      )
        .slice(1, -1)
        .join(''),
      grouping: Array.from(formatters.formatNumber(10000))
        .slice(2, -3)
        .join(''),
      digits:
        sample.length === 10
          ? [sample[9], ...sample.slice(0, 9)]
          : Array.from('0123456789'),
    };
    _localeSymbolsCache.set(formatters, symbols);
  }
  return symbols;
}

/**
 * Masks a USD amount input: keeps digits and one decimal separator, drops
 * leading zeros, caps the decimals and the number of digits, and groups the
 * integer part for the locale. Passing `display` back in with the next
 * keystroke returns the same amount.
 *
 * Typed text reads the locale's decimal separator as the decimal. A `.` also
 * reads as the decimal where the locale uses `.` for neither (`fr`: `12.5` is
 * 12.5); where `.` groups thousands (`de`, `es`), it stays a separator, so
 * `1.2345` is 12345.
 *
 * @param input - Typed text, or a stored canonical value with `source: 'value'`.
 * @param options - `formatters` (default `en-US`), `decimals` (default
 * `PERPS_DISPLAY_PRECISION.UsdInput`, 2), `maxDigits` (default
 * `PERPS_DISPLAY_PRECISION.UsdInputMaxDigits`, 9) and `source` (default
 * `typed`).
 * @returns The canonical `value` and the locale `display`; both are empty for
 * input without digits.
 * @example formatPerpsUsdInput('0012.345') => { value: '12.34', display: '12.34' }
 * @example formatPerpsUsdInput('1234.') => { value: '1234.', display: '1,234.' }
 * @example formatPerpsUsdInput('1.2345', { formatters: createFormatters({ locale: 'de' }) }) => { value: '12345', display: '12.345' }
 * @example formatPerpsUsdInput('1234567.5', { formatters: createFormatters({ locale: 'de' }), source: 'value' }) => { value: '1234567.5', display: '1.234.567,5' }
 */
export const formatPerpsUsdInput = (
  input: string,
  options: PerpsUsdInputFormatOptions = {},
): PerpsUsdInput => {
  const {
    formatters = _fallbackFormatters,
    decimals = PERPS_DISPLAY_PRECISION.UsdInput,
    maxDigits: requestedMaxDigits = PERPS_DISPLAY_PRECISION.UsdInputMaxDigits,
    source = 'typed',
  } = options;
  const maxDigits = Math.min(requestedMaxDigits, MAX_EXACT_INPUT_DIGITS);
  const symbols = _getLocaleNumberSymbols(formatters);
  const text = Array.from(input, (character) => {
    const digit = symbols.digits.indexOf(character);
    return digit === -1 ? character : String(digit);
  }).join('');

  let decimalSeparator: string | undefined;
  if (source === 'value') {
    decimalSeparator = '.';
  } else if (symbols.decimal && text.includes(symbols.decimal)) {
    decimalSeparator = symbols.decimal;
  } else if (symbols.grouping !== '.') {
    decimalSeparator = '.';
  }

  let integer = '';
  let fraction = '';
  let seenDecimal = false;
  for (const character of text) {
    if (character === decimalSeparator && !seenDecimal) {
      seenDecimal = true;
    } else if (character >= '0' && character <= '9') {
      if (seenDecimal) {
        fraction += character;
      } else {
        integer += character;
      }
    }
  }
  const hasDecimal = seenDecimal && decimals > 0;
  if (!integer && !hasDecimal) {
    return { value: '', display: '' };
  }

  integer = integer.replace(/^0+(?=\d)/u, '') || '0';
  integer = integer.slice(0, maxDigits);
  fraction = fraction.slice(
    0,
    Math.max(0, Math.min(decimals, maxDigits - integer.length)),
  );
  const fractionText = hasDecimal ? `.${fraction}` : '';
  const localizedFraction = Array.from(
    fraction,
    (digit) => symbols.digits[Number(digit)],
  ).join('');
  return {
    value: `${integer}${fractionText}`,
    display: `${formatters.formatNumber(Number(integer), {
      maximumFractionDigits: 0,
    })}${hasDecimal ? `${symbols.decimal}${localizedFraction}` : ''}`,
  };
};
