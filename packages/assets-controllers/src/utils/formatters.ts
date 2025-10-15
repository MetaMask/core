const FALLBACK_LOCALE = 'en';

const twoDecimals = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

const oneSignificantDigit = {
  minimumSignificantDigits: 1,
  maximumSignificantDigits: 1,
};

const threeSignificantDigits = {
  minimumSignificantDigits: 3,
  maximumSignificantDigits: 3,
};

const numberFormatCache: Record<string, Intl.NumberFormat> = {};

/**
 * Get cached number format instance.
 *
 * @param locale - Locale string.
 * @param options - Optional Intl.NumberFormat options.
 * @returns Cached Intl.NumberFormat instance.
 */
function getCachedNumberFormat(
  locale: string,
  options: Intl.NumberFormatOptions = {},
) {
  const key = `${locale}_${JSON.stringify(options)}`;

  let format = numberFormatCache[key];

  if (format) {
    return format;
  }

  try {
    format = new Intl.NumberFormat(locale, options);
  } catch (error) {
    if (error instanceof RangeError) {
      // Fallback for invalid options (e.g. currency code)
      format = new Intl.NumberFormat(locale, twoDecimals);
    } else {
      throw error;
    }
  }

  numberFormatCache[key] = format;
  return format;
}

/**
 * Format a number with optional Intl overrides.
 *
 * @param config - Configuration object with locale.
 * @param config.locale - Locale string.
 * @param value - Numeric value to format.
 * @param options - Optional Intl.NumberFormat overrides.
 * @returns Formatted number string.
 */
function formatNumber(
  config: { locale: string },
  value: number | bigint | `${number}`,
  options: Intl.NumberFormatOptions = {},
) {
  if (!Number.isFinite(Number(value))) {
    return '';
  }

  const numberFormat = getCachedNumberFormat(config.locale, options);

  // @ts-expect-error Remove this comment once TypeScript is updated to 5.5+
  return numberFormat.format(value);
}

/**
 * Format a value as a currency string.
 *
 * @param config - Configuration object with locale.
 * @param config.locale - Locale string.
 * @param value - Numeric value to format.
 * @param currency - ISO 4217 currency code.
 * @param options - Optional Intl.NumberFormat overrides.
 * @returns Formatted currency string.
 */
function formatCurrency(
  config: { locale: string },
  value: number | bigint | `${number}`,
  currency: Intl.NumberFormatOptions['currency'],
  options: Intl.NumberFormatOptions = {},
) {
  if (!Number.isFinite(Number(value))) {
    return '';
  }

  const numberFormat = getCachedNumberFormat(config.locale, {
    style: 'currency',
    currency,
    ...options,
  });

  // @ts-expect-error Remove this comment once TypeScript is updated to 5.5+
  return numberFormat.format(value);
}

/**
 * Compact currency formatting (e.g. $1.2K, $3.4M).
 *
 * @param config - Configuration object with locale.
 * @param config.locale - Locale string.
 * @param value - Numeric value to format.
 * @param currency - ISO 4217 currency code.
 * @returns Formatted compact currency string.
 */
function formatCurrencyCompact(
  config: { locale: string },
  value: number | bigint | `${number}`,
  currency: Intl.NumberFormatOptions['currency'],
) {
  return formatCurrency(config, value, currency, {
    notation: 'compact',
    ...twoDecimals,
  });
}

/**
 * Currency formatting with minimum threshold for small values.
 *
 * @param config - Configuration object with locale.
 * @param config.locale - Locale string.
 * @param value - Numeric value to format.
 * @param currency - ISO 4217 currency code.
 * @returns Formatted currency string with threshold handling.
 */
function formatCurrencyWithMinThreshold(
  config: { locale: string },
  value: number | bigint | `${number}`,
  currency: Intl.NumberFormatOptions['currency'],
) {
  const minThreshold = 0.01;
  const number = Number(value);
  const absoluteValue = Math.abs(number);

  if (!Number.isFinite(number)) {
    return '';
  }

  if (number === 0) {
    return formatCurrency(config, 0, currency);
  }

  if (absoluteValue < minThreshold) {
    const formattedMin = formatCurrency(config, minThreshold, currency);
    return `<${formattedMin}`;
  }

  return formatCurrency(config, number, currency);
}

/**
 * Format a value as a token string with symbol.
 *
 * @param config - Configuration object with locale.
 * @param config.locale - Locale string.
 * @param value - Numeric value to format.
 * @param symbol - Token symbol.
 * @param options - Optional Intl.NumberFormat overrides.
 * @returns Formatted token string.
 */
function formatToken(
  config: { locale: string },
  value: number | bigint | `${number}`,
  symbol: string,
  options: Intl.NumberFormatOptions = {},
) {
  if (!Number.isFinite(Number(value))) {
    return '';
  }

  const numberFormat = getCachedNumberFormat(config.locale, {
    style: 'decimal',
    ...options,
  });

  // @ts-expect-error Remove this comment once TypeScript is updated to 5.5+
  const formattedNumber = numberFormat.format(value);

  return `${formattedNumber} ${symbol}`;
}

/**
 * Format token price with varying precision based on value.
 *
 * @param config - Configuration object with locale.
 * @param config.locale - Locale string.
 * @param value - Numeric value to format.
 * @param currency - ISO 4217 currency code.
 * @returns Formatted token price string.
 */
function formatCurrencyTokenPrice(
  config: { locale: string },
  value: number | bigint | `${number}`,
  currency: Intl.NumberFormatOptions['currency'],
) {
  const minThreshold = 0.00000001;
  const number = Number(value);
  const absoluteValue = Math.abs(number);

  if (!Number.isFinite(number)) {
    return '';
  }

  if (number === 0) {
    return formatCurrency(config, 0, currency);
  }

  if (absoluteValue < minThreshold) {
    return `<${formatCurrency(config, minThreshold, currency, oneSignificantDigit)}`;
  }

  if (absoluteValue < 1) {
    return formatCurrency(config, number, currency, threeSignificantDigits);
  }

  if (absoluteValue < 1_000_000) {
    return formatCurrency(config, number, currency);
  }

  return formatCurrencyCompact(config, number, currency);
}

/**
 * Format token quantity with varying precision based on value.
 *
 * @param config - Configuration object with locale.
 * @param config.locale - Locale string.
 * @param value - Numeric value to format.
 * @param symbol - Token symbol.
 * @returns Formatted token quantity string.
 */
function formatTokenQuantity(
  config: { locale: string },
  value: number | bigint | `${number}`,
  symbol: string,
) {
  const minThreshold = 0.00001;
  const number = Number(value);
  const absoluteValue = Math.abs(number);

  if (!Number.isFinite(number)) {
    return '';
  }

  if (number === 0) {
    return formatToken(config, 0, symbol);
  }

  if (absoluteValue < minThreshold) {
    return `<${formatToken(config, minThreshold, symbol, oneSignificantDigit)}`;
  }

  if (absoluteValue < 1) {
    return formatToken(config, number, symbol, threeSignificantDigits);
  }

  if (absoluteValue < 1_000_000) {
    return formatToken(config, number, symbol);
  }

  return formatToken(config, number, symbol, {
    notation: 'compact',
    ...twoDecimals,
  });
}

/**
 * Create formatter functions with the given locale.
 *
 * @param options - Configuration options.
 * @param options.locale - Locale string.
 * @returns Object with formatter functions.
 */
export function createFormatters({ locale = FALLBACK_LOCALE }) {
  return {
    /**
     * Format a number with optional Intl overrides.
     *
     * @param value - Numeric value to format.
     * @param options - Optional Intl.NumberFormat overrides.
     */
    formatNumber: formatNumber.bind(null, { locale }),
    /**
     * Format a value as a currency string.
     *
     * @param value - Numeric value to format.
     * @param currency - ISO 4217 currency code (e.g. 'USD').
     * @param options - Optional Intl.NumberFormat overrides.
     */
    formatCurrency: formatCurrency.bind(null, { locale }),
    /**
     * Compact currency (e.g. $1.2K, $3.4M) with up to two decimal digits.
     *
     * @param value - Numeric value to format.
     * @param currency - ISO 4217 currency code.
     */
    formatCurrencyCompact: formatCurrencyCompact.bind(null, { locale }),
    /**
     * Currency with thresholds for small values.
     *
     * @param value - Numeric value to format.
     * @param currency - ISO 4217 currency code.
     */
    formatCurrencyWithMinThreshold: formatCurrencyWithMinThreshold.bind(null, {
      locale,
    }),
    /**
     * Format token price with varying precision based on value.
     *
     * @param value - Numeric value to format.
     * @param currency - ISO 4217 currency code.
     */
    formatCurrencyTokenPrice: formatCurrencyTokenPrice.bind(null, { locale }),
    /**
     * Format a value as a token string with symbol.
     *
     * @param value - Numeric value to format.
     * @param symbol - Token symbol (e.g. 'ETH', 'SepoliaETH').
     * @param options - Optional Intl.NumberFormat overrides.
     */
    formatToken: formatToken.bind(null, { locale }),
    /**
     * Format token quantity with varying precision based on value.
     *
     * @param value - Numeric value to format.
     * @param symbol - Token symbol (e.g. 'ETH', 'SepoliaETH').
     */
    formatTokenQuantity: formatTokenQuantity.bind(null, { locale }),
  };
}
