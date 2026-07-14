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

function getCachedNumberFormat(
  locale: string,
  options: Intl.NumberFormatOptions,
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
) {
  const key = `${locale}_${JSON.stringify(options)}`;
  if (!dateTimeFormatCache[key]) {
    dateTimeFormatCache[key] = new Intl.DateTimeFormat(locale, options);
  }
  return dateTimeFormatCache[key];
}

type Value = number | bigint | `${number}`;

function formatNumber(
  config: { locale: string },
  value: Value,
  options: Intl.NumberFormatOptions = {},
) {
  if (!Number.isFinite(Number(value))) {
    return '';
  }

  const numberFormat = getCachedNumberFormat(config.locale, options);

  // @ts-expect-error Remove this comment once TypeScript is updated to 5.5+
  return numberFormat.format(value);
}

function formatCurrency(
  config: { locale: string },
  value: Value,
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

function formatCurrencyCompact(
  config: { locale: string },
  value: Value,
  currency: Intl.NumberFormatOptions['currency'],
) {
  return formatCurrency(config, value, currency, {
    notation: 'compact',
    ...twoDecimals,
  });
}

function formatCurrencyWithMinThreshold(
  config: { locale: string },
  value: Value,
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

function formatCurrencyTokenPrice(
  config: { locale: string },
  value: Value,
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

function formatToken(
  config: { locale: string },
  value: Value,
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

function formatTokenQuantity(
  config: { locale: string },
  value: Value,
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

// Format token quantity without trailing zeros.
function formatTokenAmount(
  config: { locale: string },
  value: Value,
  symbol: string,
) {
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
  config: { locale: string },
  value: Value,
  options: Intl.NumberFormatOptions = {},
) {
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

function formatCompact(config: { locale: string }, value: Value) {
  return formatNumber(config, value, {
    notation: 'compact',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(
  config: { locale: string },
  timestamp: string | number,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!timestamp) {
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
  }).format(new Date(timestamp));
}

export function createFormatters({ locale = FALLBACK_LOCALE }) {
  const config = { locale };
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
