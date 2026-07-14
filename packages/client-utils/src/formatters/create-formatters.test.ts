import { createFormatters } from './create-formatters';

const locale = 'en-US';

const invalidValues = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

describe('createFormatters', () => {
  it('uses the fallback locale when none is provided', () => {
    const { formatCurrency } = createFormatters({});
    expect(formatCurrency(1, 'USD')).toBe('$1.00');
  });
});

describe('formatNumber', () => {
  const { formatNumber } = createFormatters({ locale });

  it('formats a basic integer', () => {
    expect(formatNumber(1234)).toBe('1,234');
  });

  it('respects fraction digit options', () => {
    expect(
      formatNumber(1.2345, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ).toBe('1.23');
  });

  it('returns empty string for invalid number', () => {
    expect(formatNumber(NaN)).toBe('');
  });
});

describe('formatCurrency', () => {
  const { formatCurrency } = createFormatters({ locale });

  const testCases = [
    { value: 1_234.56, expected: '$1,234.56' },
    { value: 0, expected: '$0.00' },
    { value: -42.5, expected: '-$42.50' },
  ];

  it('formats values correctly', () => {
    testCases.forEach(({ value, expected }) => {
      expect(formatCurrency(value, 'USD')).toBe(expected);
    });
  });

  it('handles invalid values', () => {
    invalidValues.forEach((input) => {
      expect(formatCurrency(input, 'USD')).toBe('');
    });
  });

  it('formats values correctly with different locale', () => {
    const { formatCurrency: formatCurrencyGB } = createFormatters({
      locale: 'en-GB',
    });
    expect(formatCurrencyGB(1234.56, 'GBP')).toBe('£1,234.56');
  });

  it('falls back to two-decimal format when given an invalid currency code (RangeError)', () => {
    // An invalid currency code causes Intl.NumberFormat to throw RangeError;
    // the implementation falls back to a plain decimal format.
    expect(() => formatCurrency(1, 'INVALID_CURRENCY')).not.toThrow();
    expect(formatCurrency(1, 'INVALID_CURRENCY')).toBe('1.00');
  });

  it('re-throws non-RangeError errors from Intl.NumberFormat', () => {
    const original = Intl.NumberFormat;
    const typeError = new TypeError('unexpected');
    Intl.NumberFormat = jest.fn().mockImplementation(() => {
      throw typeError;
    }) as unknown as typeof Intl.NumberFormat;

    // Use a unique locale so the cache doesn't short-circuit the constructor call.
    const { formatCurrency: formatFresh } = createFormatters({
      locale: 'zz-ZZ-rethrow',
    });

    try {
      expect(() => formatFresh(1, 'USD')).toThrow(typeError);
    } finally {
      Intl.NumberFormat = original;
    }
  });
});

describe('formatCurrencyWithMinThreshold', () => {
  const { formatCurrencyWithMinThreshold } = createFormatters({ locale });

  const testCases = [
    { value: 0, expected: '$0.00' },

    // Values below minimum threshold
    { value: 0.000001, expected: '<$0.01' },
    { value: 0.001, expected: '<$0.01' },
    { value: -0.001, expected: '<$0.01' },

    // Values at and above minimum threshold
    { value: 0.01, expected: '$0.01' },
    { value: 0.1, expected: '$0.10' },
    { value: 1, expected: '$1.00' },
    { value: -0.01, expected: '-$0.01' },
    { value: -1, expected: '-$1.00' },
    { value: -100, expected: '-$100.00' },
    { value: 1_000, expected: '$1,000.00' },
    { value: 1_000_000, expected: '$1,000,000.00' },
  ];

  it('formats values correctly', () => {
    testCases.forEach(({ value, expected }) => {
      expect(formatCurrencyWithMinThreshold(value, 'USD')).toBe(expected);
    });
  });

  it('handles invalid values', () => {
    invalidValues.forEach((input) => {
      expect(formatCurrencyWithMinThreshold(input, 'USD')).toBe('');
    });
  });
});

describe('formatCurrencyTokenPrice', () => {
  const { formatCurrencyTokenPrice } = createFormatters({ locale });

  const testCases = [
    { value: 0, expected: '$0.00' },

    // Values below minimum threshold
    { value: 0.000000001, expected: '<$0.00000001' },
    { value: -0.000000001, expected: '<$0.00000001' },

    // Values above minimum threshold but less than 1
    { value: 0.0000123, expected: '$0.0000123' },
    { value: 0.001, expected: '$0.00100' },
    { value: 0.999, expected: '$0.999' },

    // Values at and above 1 but less than 1,000,000
    { value: 1, expected: '$1.00' },
    { value: -1, expected: '-$1.00' },
    { value: -500, expected: '-$500.00' },

    // Values 1,000,000 and above
    { value: 1_000_000, expected: '$1.00M' },
    { value: -2_000_000, expected: '-$2.00M' },
  ];

  it('formats values correctly', () => {
    testCases.forEach(({ value, expected }) => {
      expect(formatCurrencyTokenPrice(value, 'USD')).toBe(expected);
    });
  });

  it('handles invalid values', () => {
    invalidValues.forEach((input) => {
      expect(formatCurrencyTokenPrice(input, 'USD')).toBe('');
    });
  });
});

describe('formatToken', () => {
  const { formatToken } = createFormatters({ locale });

  const testCases = [
    { value: 1.234, symbol: 'ETH', expected: '1.234 ETH' },
    { value: 0, symbol: 'USDC', expected: '0 USDC' },
    { value: 1_000, symbol: 'DAI', expected: '1,000 DAI' },
  ];

  it('formats token values', () => {
    testCases.forEach(({ value, symbol, expected }) => {
      expect(formatToken(value, symbol)).toBe(expected);
    });
  });

  it('handles invalid values', () => {
    invalidValues.forEach((input) => {
      expect(formatToken(input, 'ETH')).toBe('');
    });
  });
});

describe('formatTokenQuantity', () => {
  const { formatTokenQuantity } = createFormatters({ locale });

  const testCases = [
    { value: 0, symbol: 'ETH', expected: '0 ETH' },

    // Values below minimum threshold
    { value: 0.000000001, symbol: 'ETH', expected: '<0.00001 ETH' },
    { value: -0.000000001, symbol: 'ETH', expected: '<0.00001 ETH' },
    { value: 0.0000005, symbol: 'USDC', expected: '<0.00001 USDC' },

    // Values above minimum threshold but less than 1
    { value: 0.00001, symbol: 'ETH', expected: '0.0000100 ETH' },
    { value: 0.001234, symbol: 'BTC', expected: '0.00123 BTC' },
    { value: 0.123456, symbol: 'USDC', expected: '0.123 USDC' },

    // Values 1 and above but less than 1,000,000
    { value: 1, symbol: 'ETH', expected: '1 ETH' },
    { value: -1, symbol: 'ETH', expected: '-1 ETH' },
    { value: -25.5, symbol: 'ETH', expected: '-25.5 ETH' },
    { value: 1.2345678, symbol: 'BTC', expected: '1.235 BTC' },
    { value: 123.45678, symbol: 'USDC', expected: '123.457 USDC' },
    { value: 999_999, symbol: 'DAI', expected: '999,999 DAI' },

    // Values 1,000,000 and above
    { value: 1_000_000, symbol: 'ETH', expected: '1.00M ETH' },
    { value: -1_500_000, symbol: 'ETH', expected: '-1.50M ETH' },
    { value: 1_234_567, symbol: 'BTC', expected: '1.23M BTC' },
    { value: 1_000_000_000, symbol: 'USDC', expected: '1.00B USDC' },
  ];

  it('formats token quantities correctly', () => {
    testCases.forEach(({ value, symbol, expected }) => {
      expect(formatTokenQuantity(value, symbol)).toBe(expected);
    });
  });

  it('handles invalid values', () => {
    invalidValues.forEach((input) => {
      expect(formatTokenQuantity(input, 'ETH')).toBe('');
    });
  });
});

describe('formatTokenAmount', () => {
  const { formatTokenAmount } = createFormatters({ locale });

  const testCases = [
    // Zero: no trailing decimal
    { value: 0, symbol: 'ETH', expected: '0 ETH' },

    // Values below minimum threshold
    { value: 0.000000001, symbol: 'ETH', expected: '<0.00001 ETH' },
    { value: -0.000000001, symbol: 'ETH', expected: '<0.00001 ETH' },

    // Values above threshold but less than 1 (1-4 significant digits)
    { value: 0.5, symbol: 'ETH', expected: '0.5 ETH' },
    { value: 0.1234, symbol: 'BTC', expected: '0.1234 BTC' },

    // Values 1 and above but less than 1,000,000 (no trailing zeros)
    { value: 1, symbol: 'ETH', expected: '1 ETH' },
    { value: 1.5, symbol: 'ETH', expected: '1.5 ETH' },
    { value: 1.2345678, symbol: 'BTC', expected: '1.2346 BTC' },
    { value: 999_999, symbol: 'DAI', expected: '999,999 DAI' },

    // Values 1,000,000 and above (compact, no trailing zeros)
    { value: 1_000_000, symbol: 'ETH', expected: '1M ETH' },
    { value: 1_500_000, symbol: 'ETH', expected: '1.5M ETH' },
    { value: 1_234_567, symbol: 'BTC', expected: '1.23M BTC' },
  ];

  it('formats token amounts without trailing zeros', () => {
    testCases.forEach(({ value, symbol, expected }) => {
      expect(formatTokenAmount(value, symbol)).toBe(expected);
    });
  });

  it('handles invalid values', () => {
    invalidValues.forEach((input) => {
      expect(formatTokenAmount(input, 'ETH')).toBe('');
    });
  });
});

describe('formatPercentWithMinThreshold', () => {
  const { formatPercentWithMinThreshold } = createFormatters({ locale });

  it('formats zero as 0.00%', () => {
    expect(formatPercentWithMinThreshold(0)).toBe('0.00%');
  });

  it('clamps small positive values to 0.01%', () => {
    // 0.00001 ratio = 0.001% which is below 0.01% floor
    expect(formatPercentWithMinThreshold(0.00001)).toBe('0.01%');
  });

  it('clamps small negative values to -0.01%', () => {
    expect(formatPercentWithMinThreshold(-0.00001)).toBe('-0.01%');
  });

  it('formats values at or above threshold normally', () => {
    // 0.1234 ratio = 12.34%
    expect(formatPercentWithMinThreshold(0.1234)).toBe('12.34%');
  });

  it('formats negative values correctly', () => {
    expect(formatPercentWithMinThreshold(-0.05)).toBe('-5.00%');
  });

  it('returns empty string for invalid values', () => {
    invalidValues.forEach((input) => {
      expect(formatPercentWithMinThreshold(input)).toBe('');
    });
  });
});

describe('formatCompact', () => {
  const { formatCompact } = createFormatters({ locale });

  it('formats large numbers in compact notation', () => {
    expect(formatCompact(1_000)).toBe('1.00K');
    expect(formatCompact(1_500_000)).toBe('1.50M');
  });

  it('formats small numbers with two decimal places', () => {
    expect(formatCompact(1.5)).toBe('1.50');
  });

  it('returns empty string for invalid values', () => {
    invalidValues.forEach((input) => {
      expect(formatCompact(input)).toBe('');
    });
  });
});

describe('formatDateTime', () => {
  const { formatDateTime } = createFormatters({ locale });

  it('formats a timestamp as a localized date+time string', () => {
    // March 15, 2024, 2:30 PM UTC
    const timestamp = new Date('2024-03-15T14:30:00Z').getTime();
    const result = formatDateTime(timestamp);
    expect(result).toMatch(/Mar/u);
    expect(result).toMatch(/15/u);
    expect(result).toMatch(/2024/u);
  });

  it('returns empty string for falsy timestamp', () => {
    expect(formatDateTime(0)).toBe('');
    expect(formatDateTime('')).toBe('');
  });

  it('accepts string timestamps', () => {
    const result = formatDateTime('2024-03-15T14:30:00Z');
    expect(result).toMatch(/2024/u);
  });
});
