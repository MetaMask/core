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
const dateTimeFormatCache: Record<string, Intl.DateTimeFormat> = {};

type Value = number | bigint | `${number}`;

/**
 * How the currency helpers render a code that `Intl.NumberFormat` rejects,
 * such as `USDC`.
 * - `number`: a plain two-decimal number, without the code (`3.00`).
 * - `code`: the number, formatted with the caller's options, then the code
 * (`3.00 USDC`).
 */
type UnknownCurrency = 'number' | 'code';

type FormattersConfig = {
  locale: string;
  currencyDisplay?: Intl.NumberFormatOptions['currencyDisplay'];
  unknownCurrency?: UnknownCurrency;
};

const CURRENCY_ONLY_OPTIONS = [
  'style',
  'currency',
  'currencyDisplay',
  'currencySign',
] as const;

const DIGIT_OPTIONS = [
  'minimumFractionDigits',
  'maximumFractionDigits',
  'minimumSignificantDigits',
  'maximumSignificantDigits',
] as const;

// Matches ECMA-402 IsWellFormedCurrencyCode, the check Intl.NumberFormat runs.
function isWellFormedCurrencyCode(currency: string): boolean {
  return /^[A-Za-z]{3}$/u.test(currency);
}

function getCachedNumberFormat(
  locale: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}_${JSON.stringify(options)}`;

  let format = numberFormatCache[key];

  if (format) {
    return format;
  }

  try {
    format = new Intl.NumberFormat(locale, options);
  } catch (error) {
    if (error instanceof RangeError) {
      format = new Intl.NumberFormat(locale, twoDecimals);
    } else {
      throw error;
    }
  }

  numberFormatCache[key] = format;
  return format;
}

function getCachedDateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}_${JSON.stringify(options)}`;
  if (!dateTimeFormatCache[key]) {
    dateTimeFormatCache[key] = new Intl.DateTimeFormat(locale, options);
  }
  return dateTimeFormatCache[key];
}

function formatNumber(
  config: FormattersConfig,
  value: Value,
  options: Intl.NumberFormatOptions = {},
): string {
  if (!Number.isFinite(Number(value))) {
    return '';
  }

  const numberFormat = getCachedNumberFormat(config.locale, options);

  // @ts-expect-error Remove this comment once TypeScript is updated to 5.5+
  return numberFormat.format(value);
}

function formatCurrency(
  config: FormattersConfig,
  value: Value,
  currency: Intl.NumberFormatOptions['currency'],
  options: Intl.NumberFormatOptions = {},
): string {
  if (!Number.isFinite(Number(value))) {
    return '';
  }

  if (
    config.unknownCurrency === 'code' &&
    typeof currency === 'string' &&
    !isWellFormedCurrencyCode(currency)
  ) {
    return formatWithCurrencyCode(config, value, currency, options);
  }

  const numberFormat = getCachedNumberFormat(config.locale, {
    style: 'currency',
    currency,
    ...(config.currencyDisplay
      ? { currencyDisplay: config.currencyDisplay }
      : {}),
    ...options,
  });

  // @ts-expect-error Remove this comment once TypeScript is updated to 5.5+
  return numberFormat.format(value);
}

function formatWithCurrencyCode(
  config: FormattersConfig,
  value: Value,
  currency: string,
  options: Intl.NumberFormatOptions,
): string {
  const decimalOptions: Intl.NumberFormatOptions = { ...options };
  CURRENCY_ONLY_OPTIONS.forEach((key) => delete decimalOptions[key]);

  // Two decimals mirror currency style, unless the caller chose its own digits.
  const hasDigitOptions = DIGIT_OPTIONS.some((key) => key in decimalOptions);

  const formattedNumber = formatNumber(config, value, {
    ...(hasDigitOptions ? {} : twoDecimals),
    ...decimalOptions,
  });

  return `${formattedNumber} ${currency.toUpperCase()}`;
}

function formatCurrencyCompact(
  config: FormattersConfig,
  value: Value,
  currency: Intl.NumberFormatOptions['currency'],
): string {
  return formatCurrency(config, value, currency, {
    notation: 'compact',
    ...twoDecimals,
  });
}

function formatCurrencyWithMinThreshold(
  config: FormattersConfig,
  value: Value,
  currency: Intl.NumberFormatOptions['currency'],
): string {
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

function formatCurrencyTokenPrice(
  config: FormattersConfig,
  value: Value,
  currency: Intl.NumberFormatOptions['currency'],
): string {
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

function formatToken(
  config: FormattersConfig,
  value: Value,
  symbol: string,
  options: Intl.NumberFormatOptions = {},
): string {
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

function formatTokenQuantity(
  config: FormattersConfig,
  value: Value,
  symbol: string,
): string {
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

// Format token quantity without trailing zeros.
function formatTokenAmount(
  config: FormattersConfig,
  value: Value,
  symbol: string,
): string {
  const minThreshold = 0.00001;
  const number = Number(value);
  const absoluteValue = Math.abs(number);

  if (!Number.isFinite(number)) {
    return '';
  }

  if (number === 0) {
    return formatToken(config, 0, symbol, { maximumFractionDigits: 0 });
  }

  if (absoluteValue < minThreshold) {
    return `<${formatToken(config, minThreshold, symbol, {
      minimumSignificantDigits: 1,
      maximumSignificantDigits: 1,
    })}`;
  }

  if (absoluteValue < 1) {
    return formatToken(config, number, symbol, {
      minimumSignificantDigits: 1,
      maximumSignificantDigits: 4,
    });
  }

  if (absoluteValue < 1_000_000) {
    return formatToken(config, number, symbol, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }

  return formatToken(config, number, symbol, {
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatPercentWithMinThreshold(
  config: FormattersConfig,
  value: Value,
  options: Intl.NumberFormatOptions = {},
): string {
  const minThreshold = 0.0001; // 0.01%
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '';
  }

  const clamped =
    number === 0
      ? 0
      : Math.sign(number) * Math.max(Math.abs(number), minThreshold);

  return formatNumber(config, clamped, {
    style: 'percent',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    ...options,
  });
}

function formatCompact(config: FormattersConfig, value: Value): string {
  return formatNumber(config, value, {
    notation: 'compact',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(
  config: FormattersConfig,
  timestamp: string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return '';
  }
  return getCachedDateTimeFormat(config.locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    ...options,
  }).format(date);
}

export type Formatters = {
  formatNumber: (value: Value, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (
    value: Value,
    currency: Intl.NumberFormatOptions['currency'],
    options?: Intl.NumberFormatOptions,
  ) => string;
  formatCurrencyCompact: (
    value: Value,
    currency: Intl.NumberFormatOptions['currency'],
  ) => string;
  formatCurrencyWithMinThreshold: (
    value: Value,
    currency: Intl.NumberFormatOptions['currency'],
  ) => string;
  formatCurrencyTokenPrice: (
    value: Value,
    currency: Intl.NumberFormatOptions['currency'],
  ) => string;
  formatToken: (
    value: Value,
    symbol: string,
    options?: Intl.NumberFormatOptions,
  ) => string;
  formatTokenQuantity: (value: Value, symbol: string) => string;
  formatTokenAmount: (value: Value, symbol: string) => string;
  formatPercentWithMinThreshold: (
    value: Value,
    options?: Intl.NumberFormatOptions,
  ) => string;
  formatCompact: (value: Value) => string;
  formatDateTime: (
    timestamp: string | number,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
};

export function createFormatters({
  locale = FALLBACK_LOCALE,
  currencyDisplay,
  unknownCurrency = 'number',
}: {
  locale?: string;
  currencyDisplay?: Intl.NumberFormatOptions['currencyDisplay'];
  unknownCurrency?: UnknownCurrency;
}): Formatters {
  const config = { locale, currencyDisplay, unknownCurrency };
  return {
    formatNumber: formatNumber.bind(null, config),
    formatCurrency: formatCurrency.bind(null, config),
    formatCurrencyCompact: formatCurrencyCompact.bind(null, config),
    formatCurrencyWithMinThreshold: formatCurrencyWithMinThreshold.bind(
      null,
      config,
    ),
    formatCurrencyTokenPrice: formatCurrencyTokenPrice.bind(null, config),
    formatToken: formatToken.bind(null, config),
    formatTokenQuantity: formatTokenQuantity.bind(null, config),
    formatTokenAmount: formatTokenAmount.bind(null, config),
    formatPercentWithMinThreshold: formatPercentWithMinThreshold.bind(
      null,
      config,
    ),
    formatCompact: formatCompact.bind(null, config),
    formatDateTime: formatDateTime.bind(null, config),
  };
}
