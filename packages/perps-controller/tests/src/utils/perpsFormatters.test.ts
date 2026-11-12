/* eslint-disable */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FUNDING_RATE_CONFIG,
  PERPS_CONSTANTS,
  PERPS_DISPLAY_PRECISION,
} from '../../../src/constants/perpsConfig.js';
import * as PackageEntry from '../../../src/index.js';
import {
  formatCrossMarginRatio,
  formatFeeBps,
  formatFundingRate,
  formatLiquidationDistance,
  formatPercentage,
  formatPerpsCompact,
  formatPerpsFiat,
  formatPerpsOrderBookPrice,
  formatPerpsUsdInput,
  formatPnl,
  formatPositionSize,
  formatWithSignificantDigits,
  getPerpsOrderBookPriceFormat,
  PRICE_RANGES_MINIMAL_VIEW,
  PRICE_RANGES_UNIVERSAL,
  PRICE_THRESHOLD,
} from '../../../src/utils/perpsFormatters.js';
import type { PerpsIntlFormatters } from '../../../src/utils/perpsFormatters.js';

describe('PRICE_THRESHOLD', () => {
  it('exports expected boundary values', () => {
    expect(PRICE_THRESHOLD.VERY_HIGH).toBe(100_000);
    expect(PRICE_THRESHOLD.HIGH).toBe(10_000);
    expect(PRICE_THRESHOLD.LARGE).toBe(1_000);
    expect(PRICE_THRESHOLD.MEDIUM).toBe(100);
    expect(PRICE_THRESHOLD.MEDIUM_LOW).toBe(10);
    expect(PRICE_THRESHOLD.LOW).toBe(0.01);
    expect(PRICE_THRESHOLD.VERY_SMALL).toBe(0.000001);
  });
});

describe('PRICE_RANGES_MINIMAL_VIEW', () => {
  it('has two ranges', () => {
    expect(PRICE_RANGES_MINIMAL_VIEW).toHaveLength(2);
  });

  it('large range condition matches values >= 1000', () => {
    expect(PRICE_RANGES_MINIMAL_VIEW[0].condition(1000)).toBe(true);
    expect(PRICE_RANGES_MINIMAL_VIEW[0].condition(999)).toBe(false);
  });

  it('fallback range always matches', () => {
    expect(PRICE_RANGES_MINIMAL_VIEW[1].condition(0)).toBe(true);
    expect(PRICE_RANGES_MINIMAL_VIEW[1].condition(-999)).toBe(true);
  });
});

describe('PRICE_RANGES_UNIVERSAL', () => {
  it('has seven ranges', () => {
    expect(PRICE_RANGES_UNIVERSAL).toHaveLength(7);
  });

  it('very-high range condition matches values above 100000', () => {
    expect(PRICE_RANGES_UNIVERSAL[0].condition(100001)).toBe(true);
    expect(PRICE_RANGES_UNIVERSAL[0].condition(100000)).toBe(false);
  });

  it('very-small fallback always matches', () => {
    expect(PRICE_RANGES_UNIVERSAL[6].condition(0)).toBe(true);
  });
});

describe('formatWithSignificantDigits', () => {
  it('returns zero with no decimals for input 0', () => {
    expect(formatWithSignificantDigits(0, 4)).toEqual({
      value: 0,
      decimals: 0,
    });
  });

  it('respects minDecimals for zero', () => {
    expect(formatWithSignificantDigits(0, 4, 2)).toEqual({
      value: 0,
      decimals: 2,
    });
  });

  it('formats integer >= 1 with correct decimals for 5 sig figs', () => {
    // 123.456 has 3 integer digits → 5-3 = 2 decimals
    const result = formatWithSignificantDigits(123.456, 5);
    expect(result.decimals).toBe(2);
    expect(result.value).toBeCloseTo(123.46, 2);
  });

  it('formats large number with 0 decimals when significantDigits exceeded by integer digits', () => {
    // 123456 has 6 integer digits → 5-6 = negative → clamped to 0
    const result = formatWithSignificantDigits(123456, 5);
    expect(result.decimals).toBe(0);
  });

  it('formats decimal < 1 to correct sig figs', () => {
    // 0.003456 to 4 sig figs → 0.003456
    const result = formatWithSignificantDigits(0.003456, 4);
    expect(result.value).toBeCloseTo(0.003456, 6);
  });

  it('respects maxDecimals override', () => {
    // 12.34567 with 5 sig figs would need 4 decimals, capped at 2
    const result = formatWithSignificantDigits(12.34567, 5, undefined, 2);
    expect(result.decimals).toBe(2);
  });

  it('preserves negative sign for values < 1', () => {
    const result = formatWithSignificantDigits(-0.001234, 3);
    expect(result.value).toBeLessThan(0);
  });
});

describe('formatPerpsFiat', () => {
  it('returns fallback for NaN', () => {
    expect(formatPerpsFiat('not-a-number')).toBe('$---');
  });

  it('formats a basic value with default minimal view ranges', () => {
    // PRICE_RANGES_MINIMAL_VIEW: 2 decimals, fiat-style stripping
    expect(formatPerpsFiat(1234.56)).toBe('$1,234.56');
  });

  it('strips .00 with fiat-style stripping (default ranges)', () => {
    expect(formatPerpsFiat(1250)).toBe('$1,250');
    expect(formatPerpsFiat(100)).toBe('$100');
  });

  it('preserves meaningful decimals with fiat-style stripping', () => {
    // $13.40 → stays $13.40 (not $13.4)
    expect(formatPerpsFiat(13.4)).toBe('$13.40');
  });

  it('formats with PRICE_RANGES_UNIVERSAL', () => {
    // $12,345.67 → $12,346 (0 decimals, 5 sig figs for high range)
    const result = formatPerpsFiat(12345.67, {
      ranges: PRICE_RANGES_UNIVERSAL,
    });
    expect(result).toBe('$12,346');
  });

  it('formats small value with universal ranges', () => {
    // $1.3445 → ~$1.3445 (5 sig figs, max 6 decimals)
    const result = formatPerpsFiat(1.3445, { ranges: PRICE_RANGES_UNIVERSAL });
    expect(result).toBe('$1.3445');
  });

  it('formats very small value with universal ranges', () => {
    // < $0.01 → 4 sig figs
    const result = formatPerpsFiat(0.004236, {
      ranges: PRICE_RANGES_UNIVERSAL,
    });
    expect(result).toBe('$0.004236');
  });

  it('respects explicit stripTrailingZeros: false', () => {
    const result = formatPerpsFiat(1250, { stripTrailingZeros: false });
    expect(result).toBe('$1,250.00');
  });

  it('handles numeric string input', () => {
    expect(formatPerpsFiat('500.50')).toBe('$500.50');
  });

  it('accepts custom currency', () => {
    const result = formatPerpsFiat(100, {
      currency: 'EUR',
      stripTrailingZeros: false,
    });
    expect(result).toContain('100');
  });
});

describe('formatPositionSize', () => {
  it('returns "0" for zero', () => {
    expect(formatPositionSize(0)).toBe('0');
  });

  it('returns the data placeholder for NaN', () => {
    expect(formatPositionSize('invalid')).toBe('--');
  });

  it('uses szDecimals when provided', () => {
    expect(formatPositionSize(0.00009, 5)).toBe('0.00009');
    expect(formatPositionSize(44, 1)).toBe('44');
    expect(formatPositionSize(1.5, 5)).toBe('1.5');
  });

  it('strips trailing zeros with szDecimals', () => {
    expect(formatPositionSize(44.0, 2)).toBe('44');
  });

  it('preserves integer trailing zeros when szDecimals=0 (whole-unit assets)', () => {
    expect(formatPositionSize(100, 0)).toBe('100');
    expect(formatPositionSize(20, 0)).toBe('20');
    expect(formatPositionSize(1000, 0)).toBe('1000');
    expect(formatPositionSize(1, 0)).toBe('1');
    expect(formatPositionSize(1.7, 0)).toBe('2');
  });

  it('uses magnitude logic for very small values (< 0.01) without szDecimals', () => {
    const result = formatPositionSize(0.00009);
    expect(result).toBe('0.00009');
  });

  it('uses magnitude logic for small values (< 1) without szDecimals', () => {
    expect(formatPositionSize(0.0024)).toBe('0.0024');
  });

  it('uses 2 decimals for values >= 1 without szDecimals', () => {
    expect(formatPositionSize(44)).toBe('44');
    expect(formatPositionSize(44.5)).toBe('44.5');
  });

  it('handles string input', () => {
    expect(formatPositionSize('1.23')).toBe('1.23');
  });
});

describe('formatPnl', () => {
  it('formats positive PnL with + prefix', () => {
    expect(formatPnl(1234.56)).toBe('+$1,234.56');
  });

  it('formats negative PnL with - prefix', () => {
    expect(formatPnl(-500)).toBe('-$500.00');
  });

  it('formats zero as positive', () => {
    expect(formatPnl(0)).toBe('+$0.00');
  });

  it('returns the price placeholder for NaN', () => {
    expect(formatPnl('invalid')).toBe('$---');
  });

  it('handles string input', () => {
    expect(formatPnl('250.75')).toBe('+$250.75');
  });

  it('formats 2 decimal places always', () => {
    expect(formatPnl(100)).toBe('+$100.00');
    expect(formatPnl(-0.01)).toBe('-$0.01');
  });
});

describe('formatPercentage', () => {
  it('formats positive percentage with + prefix', () => {
    expect(formatPercentage(5.25)).toBe('+5.25%');
  });

  it('formats negative percentage with - prefix', () => {
    expect(formatPercentage(-2.75)).toBe('-2.75%');
  });

  it('formats zero as positive', () => {
    expect(formatPercentage(0)).toBe('+0.00%');
  });

  it('returns the percentage placeholder for NaN', () => {
    expect(formatPercentage('not-a-number')).toBe('--%');
  });

  it('respects custom decimals', () => {
    expect(formatPercentage(5.1234, 4)).toBe('+5.1234%');
    expect(formatPercentage(5.1234, 0)).toBe('+5%');
  });

  it('handles string input', () => {
    expect(formatPercentage('10.5')).toBe('+10.50%');
  });
});

describe('formatFundingRate', () => {
  it('returns the percentage placeholder for undefined', () => {
    expect(formatFundingRate(undefined)).toBe('--%');
  });

  it('tells a missing rate from a negative one once a consumer checks the placeholder first', () => {
    // Consumer pattern (Mobile market statistics): a string other than the
    // zero display that starts with "-" was read as a negative rate. The
    // placeholder also starts with "-", so it must be checked first.
    const readRate = (
      display: string,
    ): 'missing' | 'zero' | 'negative' | 'positive' => {
      if (display === PERPS_CONSTANTS.FallbackPercentageDisplay) {
        return 'missing';
      }
      if (display === FUNDING_RATE_CONFIG.ZeroDisplay) {
        return 'zero';
      }
      return display.startsWith('-') ? 'negative' : 'positive';
    };

    expect(formatFundingRate(undefined)).not.toBe(
      FUNDING_RATE_CONFIG.ZeroDisplay,
    );
    expect(readRate(formatFundingRate(undefined))).toBe('missing');
    expect(readRate(formatFundingRate(Number.NaN))).toBe('missing');
    expect(readRate(formatFundingRate(0))).toBe('zero');
    expect(readRate(formatFundingRate(-0.0001))).toBe('negative');
    expect(readRate(formatFundingRate(0.0001))).toBe('positive');
  });

  it('returns the percentage placeholder for null', () => {
    expect(formatFundingRate(null)).toBe('--%');
  });

  it('formats positive funding rate as percentage', () => {
    // 0.0005 * 100 = 0.05 → "0.0500%"
    expect(formatFundingRate(0.0005)).toBe('0.0500%');
  });

  it('formats negative funding rate as percentage', () => {
    // -0.0001 * 100 = -0.01 → "-0.0100%"
    expect(formatFundingRate(-0.0001)).toBe('-0.0100%');
  });

  it('returns zero display for effectively-zero value', () => {
    expect(formatFundingRate(0)).toBe('0.0000%');
  });

  it('shows a threshold for positive rates below display precision', () => {
    const value = 0.000000059;

    const result = formatFundingRate(value);

    expect(result).toBe('<0.0001%');
  });

  it('shows a threshold for negative rates below display precision', () => {
    const value = -0.000000059;

    const result = formatFundingRate(value);

    expect(result).toBe('-<0.0001%');
  });

  it('returns empty string for undefined when showZero is false', () => {
    expect(formatFundingRate(undefined, { showZero: false })).toBe('');
  });

  it('formats zero value normally when showZero is false (showZero only affects undefined/null)', () => {
    expect(formatFundingRate(0, { showZero: false })).toBe('0.0000%');
  });

  it('still formats non-zero when showZero is false', () => {
    expect(formatFundingRate(0.001, { showZero: false })).toBe('0.1000%');
  });
});

describe('display formatter options', () => {
  // No-break spaces Intl puts between a number and its currency symbol
  const NBSP = String.fromCharCode(0xa0);
  const NNBSP = String.fromCharCode(0x202f);

  /**
   * Same shape and caching as `createFormatters({ locale })` from
   * `@metamask/client-utils`, which clients inject as `formatters`.
   *
   * @param locale - BCP 47 locale.
   * @returns Locale-bound formatters.
   */
  const intl = (locale: string): PerpsIntlFormatters => {
    const cache = new Map<string, Intl.NumberFormat>();
    const get = (options: Intl.NumberFormatOptions): Intl.NumberFormat => {
      const key = JSON.stringify(options);
      let format = cache.get(key);
      if (!format) {
        format = new Intl.NumberFormat(locale, options);
        cache.set(key, format);
      }
      return format;
    };
    return {
      formatNumber: (value, options = {}) => get(options).format(value),
      formatCurrency: (value, currency, options = {}) =>
        get({ style: 'currency', currency, ...options }).format(value),
    };
  };
  const {
    FallbackPriceDisplay,
    FallbackPercentageDisplay,
    FallbackDataDisplay,
  } = PERPS_CONSTANTS;
  const missingInputs = [undefined, null, '', '  ', 'abc', NaN, Infinity];

  describe('PERPS_DISPLAY_PRECISION', () => {
    it('is exported from the package entry with the shared display precisions', () => {
      expect(PackageEntry.PERPS_DISPLAY_PRECISION).toStrictEqual({
        Percentage: 2,
        CrossMarginRatioPercent: 1,
        RoePercent: 1,
        Pnl: 2,
        Fee: 2,
        FeeRatePercent: 3,
        FundingRatePercent: 4,
        SlippageEstimatePercent: 4,
        MaxPriceDecimals: 6,
        FeeBps: 2,
        LiquidationDistancePercent: 2,
        TwapProgressPercent: 2,
        UsdInput: 2,
        UsdInputMaxDigits: 9,
        VolumeCompact: 2,
        VolumeCompactThousands: 0,
        OrderBookCompact: 1,
        OrderBookAbbreviatedPriceMax: 3,
      });
    });

    it('exports the formatters from the package entry', () => {
      expect(PackageEntry.formatPercentage).toBe(formatPercentage);
      expect(PackageEntry.formatCrossMarginRatio).toBe(formatCrossMarginRatio);
      expect(PackageEntry.formatPnl).toBe(formatPnl);
      expect(PackageEntry.formatPerpsFiat).toBe(formatPerpsFiat);
      expect(PackageEntry.formatPositionSize).toBe(formatPositionSize);
      expect(PackageEntry.formatFundingRate).toBe(formatFundingRate);
      expect(PackageEntry.formatFeeBps).toBe(formatFeeBps);
      expect(PackageEntry.formatLiquidationDistance).toBe(
        formatLiquidationDistance,
      );
      expect(PackageEntry.formatPerpsCompact).toBe(formatPerpsCompact);
      expect(PackageEntry.getPerpsOrderBookPriceFormat).toBe(
        getPerpsOrderBookPriceFormat,
      );
      expect(PackageEntry.formatPerpsOrderBookPrice).toBe(
        formatPerpsOrderBookPrice,
      );
      expect(PackageEntry.formatPerpsUsdInput).toBe(formatPerpsUsdInput);
    });
  });

  describe('formatPercentage', () => {
    it.each(missingInputs)(
      'returns the percentage placeholder for %p',
      (input) => {
        expect(formatPercentage(input as never)).toBe(
          FallbackPercentageDisplay,
        );
        expect(
          formatPercentage(input as never, { decimals: 1, sign: 'never' }),
        ).toBe(FallbackPercentageDisplay);
      },
    );

    it('formats RoE with the shared 1-decimal precision', () => {
      expect(
        formatPercentage(10.25, {
          decimals: PERPS_DISPLAY_PRECISION.RoePercent,
        }),
      ).toBe('+10.3%');
      expect(
        formatPercentage(-3.04, {
          decimals: PERPS_DISPLAY_PRECISION.RoePercent,
        }),
      ).toBe('-3.0%');
    });

    it('formats estimated slippage with the shared 4-decimal precision', () => {
      expect(
        formatPercentage(0.0021, {
          decimals: PERPS_DISPLAY_PRECISION.SlippageEstimatePercent,
          sign: 'never',
        }),
      ).toBe('0.0021%');
    });

    it('formats a fee rate with the shared 3-decimal precision', () => {
      expect(
        formatPercentage(0.045, {
          decimals: PERPS_DISPLAY_PRECISION.FeeRatePercent,
          sign: 'never',
        }),
      ).toBe('0.045%');
    });

    it.each([
      ['auto', '+5.25', '5.25%'],
      ['auto', '-5.25', '-5.25%'],
      ['auto', '0', '0.00%'],
      ['always', '5.25', '+5.25%'],
      ['always', '0', '+0.00%'],
      ['always', '-5.25', '-5.25%'],
      ['exceptZero', '5.25', '+5.25%'],
      ['exceptZero', '0', '0.00%'],
      ['exceptZero', '-5.25', '-5.25%'],
      ['never', '-5.25', '5.25%'],
      ['never', '5.25', '5.25%'],
    ] as const)('applies sign %s to %s', (sign, input, expected) => {
      expect(formatPercentage(input, { sign })).toBe(expected);
    });

    it.each(['always', 'auto', 'exceptZero'] as const)(
      'never shows a minus sign for a negative value that rounds to zero (sign %s)',
      (sign) => {
        expect(formatPercentage(-0.004, { sign })).not.toContain('-');
        expect(formatPercentage(-0, { sign })).not.toContain('-');
      },
    );

    it('keeps the legacy default of a plus sign on zero and a rounded negative', () => {
      expect(formatPercentage(-0.004)).toBe('+0.00%');
      expect(formatPercentage(-0)).toBe('+0.00%');
    });

    it.each([
      ['en', '+1,234.50%'],
      ['es', '+1234,50%'],
      ['de', '+1.234,50%'],
      ['ja', '+1,234.50%'],
      ['ko', '+1,234.50%'],
      ['zh', '+1,234.50%'],
    ])('uses the %s separators', (locale, expected) => {
      expect(formatPercentage(1234.5, { formatters: intl(locale) })).toBe(
        expected,
      );
    });

    it('formats a negative value in a locale', () => {
      expect(
        formatPercentage(-12345.67, { decimals: 1, formatters: intl('es') }),
      ).toBe('-12.345,7%');
    });

    it('keeps the legacy positional decimals argument', () => {
      expect(formatPercentage(5.25, 1)).toBe('+5.3%');
      expect(formatPercentage(5.25, { decimals: 1 })).toBe('+5.3%');
    });
  });

  describe('formatPnl', () => {
    it.each(missingInputs)('returns the price placeholder for %p', (input) => {
      expect(formatPnl(input as never)).toBe(FallbackPriceDisplay);
    });

    it.each([
      ['always', 0, '+$0.00'],
      ['exceptZero', 0, '$0.00'],
      ['auto', 12.5, '$12.50'],
      ['never', -12.5, '$12.50'],
      ['exceptZero', -12.5, '-$12.50'],
      ['always', -0.004, '+$0.00'],
    ] as const)('applies sign %s to %p', (sign, input, expected) => {
      expect(formatPnl(input, { sign })).toBe(expected);
    });

    it('uses the decimals option', () => {
      expect(formatPnl(1234.567, { decimals: 0 })).toBe('+$1,235');
    });

    it.each([
      ['es', `+1234,50${NBSP}$`],
      ['de', `+1.234,50${NBSP}$`],
      ['ja', '+$1,234.50'],
    ])('formats PnL in %s', (locale, expected) => {
      expect(formatPnl(1234.5, { formatters: intl(locale) })).toBe(expected);
    });

    it('formats a negative PnL in a locale', () => {
      expect(formatPnl(-1234.5, { formatters: intl('es') })).toBe(
        `-1234,50${NBSP}$`,
      );
    });
  });

  describe('formatPerpsFiat', () => {
    it.each(missingInputs)('returns the price placeholder for %p', (input) => {
      expect(formatPerpsFiat(input as never)).toBe(FallbackPriceDisplay);
      expect(
        formatPerpsFiat(input as never, { ranges: PRICE_RANGES_UNIVERSAL }),
      ).toBe(FallbackPriceDisplay);
    });

    it('formats zero without a sign', () => {
      expect(formatPerpsFiat(0)).toBe('$0');
      expect(formatPerpsFiat(-0, { sign: 'exceptZero' })).toBe('$0');
      expect(formatPerpsFiat(0, { sign: 'always' })).toBe('+$0');
    });

    it('keeps the sign of a negative value below the threshold', () => {
      expect(formatPerpsFiat(-0.004)).toBe('-<$0.01');
      expect(formatPerpsFiat(0.004)).toBe('<$0.01');
      expect(formatPerpsFiat(0.004, { sign: 'always' })).toBe('+<$0.01');
    });

    it.each([
      ['auto', -1234.5, '-$1,234.50'],
      ['always', 1234.5, '+$1,234.50'],
      ['never', -1234.5, '$1,234.50'],
    ] as const)('applies sign %s to %p', (sign, input, expected) => {
      expect(formatPerpsFiat(input, { sign })).toBe(expected);
    });

    it.each([
      ['de', 1234.5, `1.234,50${NBSP}$`],
      ['de', 1250, `1.250${NBSP}$`],
      ['es', 13.4, `13,40${NBSP}$`],
      ['ja', 1234.5, '$1,234.50'],
      ['ko', 1250, '$1,250'],
      ['zh', 0.004, '<$0.01'],
    ])(
      'formats with the %s locale and strips .00 (%p)',
      (locale, input, expected) => {
        expect(formatPerpsFiat(input, { formatters: intl(locale) })).toBe(
          expected,
        );
      },
    );

    it('strips trailing zeros in a locale with universal ranges', () => {
      expect(
        formatPerpsFiat(1.5, {
          formatters: intl('de'),
          ranges: PRICE_RANGES_UNIVERSAL,
        }),
      ).toBe(`1,5${NBSP}$`);
      expect(
        formatPerpsFiat(12.3, {
          formatters: intl('de'),
          ranges: PRICE_RANGES_UNIVERSAL,
        }),
      ).toBe(`12,3${NBSP}$`);
    });

    it('strips trailing zeros for locales with other digits', () => {
      expect(
        formatPerpsFiat(1250, { formatters: intl('ar-EG') }),
      ).not.toContain('٫');
      expect(
        formatPerpsFiat(1.5, {
          formatters: intl('ar-EG'),
          ranges: PRICE_RANGES_UNIVERSAL,
        }),
      ).toBe(formatPerpsFiat(1.5, { formatters: intl('ar-EG'), decimals: 1 }));
    });

    it('does not depend on Intl formatToParts (single literal part on Hermes)', () => {
      const spy = vi
        .spyOn(Intl.NumberFormat.prototype, 'formatToParts')
        .mockImplementation(function (this: Intl.NumberFormat, value) {
          return [{ type: 'literal', value: this.format(value as number) }];
        });
      try {
        expect(formatPerpsFiat(1250, { formatters: intl('fr') })).toBe(
          `1${NNBSP}250${NBSP}$`,
        );
        expect(formatPerpsFiat(12.5, { ranges: PRICE_RANGES_UNIVERSAL })).toBe(
          '$12.5',
        );
        expect(formatPerpsFiat(0, { ranges: PRICE_RANGES_UNIVERSAL })).toBe(
          '$0',
        );
      } finally {
        spy.mockRestore();
      }
    });

    it('formats a fee with the shared fee precision', () => {
      expect(
        formatPerpsFiat(1.5, {
          decimals: PERPS_DISPLAY_PRECISION.Fee,
          stripTrailingZeros: false,
        }),
      ).toBe('$1.50');
    });

    it('lets minimumDecimals and maximumDecimals override decimals', () => {
      expect(
        formatPerpsFiat(1.23456, {
          decimals: 2,
          maximumDecimals: 4,
          stripTrailingZeros: false,
        }),
      ).toBe('$1.2346');
    });

    it('returns a range customFormat output unchanged', () => {
      expect(
        formatPerpsFiat(-5, {
          locale: 'de',
          formatters: intl('fr'),
          ranges: [
            {
              condition: () => true,
              minimumDecimals: 0,
              maximumDecimals: 0,
              customFormat: (value, locale, currency) =>
                `${value}|${locale}|${currency}`,
            },
          ],
        }),
      ).toBe('-5|de|USD');
    });

    it('falls back to 2 decimals when no range matches', () => {
      expect(
        formatPerpsFiat(-1.5, {
          ranges: [
            { condition: () => false, minimumDecimals: 0, maximumDecimals: 0 },
          ],
          stripTrailingZeros: false,
        }),
      ).toBe('-$1.50');
    });
  });

  describe('formatPositionSize', () => {
    it.each(missingInputs)('returns the data placeholder for %p', (input) => {
      expect(formatPositionSize(input as never)).toBe(FallbackDataDisplay);
      expect(formatPositionSize(input as never, 4)).toBe(FallbackDataDisplay);
    });

    it('formats zero and a negative value that rounds to zero as "0"', () => {
      expect(formatPositionSize(0, { sign: 'always' })).toBe('+0');
      expect(formatPositionSize(-0.004, 0)).toBe('0');
      expect(formatPositionSize(-0)).toBe('0');
    });

    it('keeps the minus sign of a negative size', () => {
      expect(formatPositionSize(-1.5, 2)).toBe('-1.5');
      expect(formatPositionSize(-1.5, { decimals: 2, sign: 'never' })).toBe(
        '1.5',
      );
    });

    it('uses locale separators without grouping', () => {
      expect(
        formatPositionSize(-1234.5, { decimals: 2, formatters: intl('es') }),
      ).toBe('-1234,5');
      expect(
        formatPositionSize(12345.678, { decimals: 2, formatters: intl('de') }),
      ).toBe('12345,68');
      expect(formatPositionSize(0.0024, { formatters: intl('ja') })).toBe(
        '0.0024',
      );
    });

    it('treats an options object without decimals like the magnitude fallback', () => {
      expect(formatPositionSize(0.00009, {})).toBe('0.00009');
      expect(formatPositionSize(0.25678, { formatters: intl('de') })).toBe(
        '0,2568',
      );
      expect(formatPositionSize(44.567, { formatters: intl('en') })).toBe(
        '44.57',
      );
    });
  });

  describe('formatFundingRate', () => {
    it.each([...missingInputs])(
      'returns the percentage placeholder for %p',
      (input) => {
        expect(formatFundingRate(input as never)).toBe(
          FallbackPercentageDisplay,
        );
        expect(formatFundingRate(input as never, { showZero: false })).toBe('');
      },
    );

    it('formats a string rate', () => {
      expect(formatFundingRate('0.0005')).toBe('0.0500%');
    });

    it.each([
      ['auto', 0.0005, '0.0500%'],
      ['always', 0.0005, '+0.0500%'],
      ['always', 0, '+0.0000%'],
      ['exceptZero', 0, '0.0000%'],
      ['exceptZero', -0.0005, '-0.0500%'],
      ['never', -0.0005, '0.0500%'],
      ['always', 0.000000059, '+<0.0001%'],
      ['never', -0.000000059, '<0.0001%'],
    ] as const)('applies sign %s to %p', (sign, input, expected) => {
      expect(formatFundingRate(input, { sign })).toBe(expected);
    });

    it('uses the locale and decimals options', () => {
      expect(formatFundingRate(-0.000125, { formatters: intl('es') })).toBe(
        '-0,0125%',
      );
      expect(
        formatFundingRate(0.0005, { formatters: intl('ko'), sign: 'always' }),
      ).toBe('+0.0500%');
      expect(formatFundingRate(0.000000059, { formatters: intl('de') })).toBe(
        '<0,0001%',
      );
      expect(formatFundingRate(0.000125, { decimals: 2 })).toBe('0.01%');
    });
  });
  describe('Intl formatter injection and caching', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('applies the perps rules on the injected formatters and constructs no Intl formatter', () => {
      const constructor = vi.spyOn(Intl, 'NumberFormat');
      const calls: unknown[][] = [];
      const formatters: PerpsIntlFormatters = {
        formatNumber: (value, options) => {
          calls.push(['number', value, options]);
          return `N${value}`;
        },
        formatCurrency: (value, currency, options) => {
          calls.push(['currency', value, currency, options]);
          return `C${value}`;
        },
      };

      expect(formatPercentage(-10.25, { formatters, decimals: 1 })).toBe(
        '-N10.3%',
      );
      expect(formatPnl(0, { formatters })).toBe('+C0');
      expect(formatPerpsFiat(1250, { formatters })).toBe('C1250');
      expect(formatPerpsFiat(-0.004, { formatters })).toBe('-<C0.01');
      expect(formatPositionSize(1.5, { formatters, decimals: 4 })).toBe('N1.5');
      expect(formatFundingRate(0.0005, { formatters, sign: 'always' })).toBe(
        '+N0.05%',
      );
      expect(calls).toStrictEqual([
        [
          'number',
          10.3,
          { minimumFractionDigits: 1, maximumFractionDigits: 1 },
        ],
        [
          'currency',
          0,
          'USD',
          {
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        ],
        [
          'currency',
          1250,
          'USD',
          {
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          },
        ],
        [
          'currency',
          0.01,
          'USD',
          {
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        ],
        [
          'number',
          1.5,
          {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
            useGrouping: false,
          },
        ],
        [
          'number',
          0.05,
          { minimumFractionDigits: 4, maximumFractionDigits: 4 },
        ],
      ]);
      expect(constructor).not.toHaveBeenCalled();
    });

    it('constructs one en-US fallback formatter for the same options formatted twice', () => {
      const constructor = vi.spyOn(Intl, 'NumberFormat');
      // Seven decimals: an option set no other test formats
      const options = { decimals: 7, stripTrailingZeros: false };

      expect(formatPerpsFiat(1.23456789, options)).toBe('$1.2345679');
      expect(formatPerpsFiat(9.87654321, options)).toBe('$9.8765432');
      expect(formatPercentage(1.5, { decimals: 7 })).toBe('+1.5000000%');
      expect(formatPercentage(2.5, { decimals: 7 })).toBe('+2.5000000%');

      expect(constructor).toHaveBeenCalledTimes(2);
    });

    it('keeps the Intl rounding of a tie when deciding the digits to strip', () => {
      // 1.005 is stored below 1.005; Intl rounds its shortest form to 1.01
      expect(formatPerpsFiat(1.005, { ranges: PRICE_RANGES_UNIVERSAL })).toBe(
        '$1.005',
      );
      expect(formatPerpsFiat(1.005)).toBe('$1.01');
      expect(formatPerpsFiat(0.995)).toBe('$1');
      expect(
        formatPerpsFiat(1e-7, {
          ranges: [
            {
              condition: () => true,
              minimumDecimals: 0,
              maximumDecimals: 8,
              threshold: 0,
            },
          ],
        }),
      ).toBe('$0.0000001');
    });

    it('strips trailing zeros of large and exponent-form amounts', () => {
      const sixDecimalsFromZero = [
        {
          condition: () => true,
          minimumDecimals: 0,
          maximumDecimals: 6,
          threshold: 0,
        },
      ];

      expect(formatPerpsFiat(13402822611156.994)).toBe(
        '$13,402,822,611,156.99',
      );
      expect(formatPerpsFiat(1234567890.1234567, { decimals: 6 })).toBe(
        '$1,234,567,890.123457',
      );
      expect(formatPerpsFiat(1.5e21)).toBe('$1,500,000,000,000,000,000,000');
      expect(formatPerpsFiat(1.5e21, { ranges: PRICE_RANGES_UNIVERSAL })).toBe(
        '$1,500,000,000,000,000,000,000',
      );
      expect(formatPerpsFiat(5e-7, { ranges: sixDecimalsFromZero })).toBe(
        '$0.000001',
      );
      expect(formatPerpsFiat(4e-7, { ranges: sixDecimalsFromZero })).toBe('$0');
    });
  });
});

describe('existing formatter outputs (characterization)', () => {
  const NBSP = String.fromCharCode(0xa0);
  const deFormatters: PerpsIntlFormatters = {
    formatNumber: (value, options) =>
      new Intl.NumberFormat('de', options).format(value),
    formatCurrency: (value, currency, options) =>
      new Intl.NumberFormat('de', {
        style: 'currency',
        currency,
        ...options,
      }).format(value),
  };

  it.each([
    ['formatPerpsFiat(1234.56)', () => formatPerpsFiat(1234.56), '$1,234.56'],
    ['formatPerpsFiat(1250)', () => formatPerpsFiat(1250), '$1,250'],
    ['formatPerpsFiat(-0.004)', () => formatPerpsFiat(-0.004), '-<$0.01'],
    [
      'formatPerpsFiat(87123.45, UNIVERSAL)',
      () => formatPerpsFiat(87123.45, { ranges: PRICE_RANGES_UNIVERSAL }),
      '$87,123',
    ],
    [
      'formatPerpsFiat(2480.37, UNIVERSAL)',
      () => formatPerpsFiat(2480.37, { ranges: PRICE_RANGES_UNIVERSAL }),
      '$2,480.4',
    ],
    [
      'formatPerpsFiat(0.001824, UNIVERSAL)',
      () => formatPerpsFiat(0.001824, { ranges: PRICE_RANGES_UNIVERSAL }),
      '$0.001824',
    ],
    [
      'formatPerpsFiat(2480.37, UNIVERSAL, de)',
      () =>
        formatPerpsFiat(2480.37, {
          ranges: PRICE_RANGES_UNIVERSAL,
          formatters: deFormatters,
        }),
      `2.480,4${NBSP}$`,
    ],
    [
      'formatPerpsFiat(33.1, 3 decimals, no strip)',
      () => formatPerpsFiat(33.1, { decimals: 3, stripTrailingZeros: false }),
      '$33.100',
    ],
    ['formatPnl(-500)', () => formatPnl(-500), '-$500.00'],
    ['formatPercentage(25)', () => formatPercentage(25), '+25.00%'],
    [
      'formatPercentage(25, 2 decimals, never)',
      () => formatPercentage(25, { decimals: 2, sign: 'never' }),
      '25.00%',
    ],
    ['formatPercentage(30, 2)', () => formatPercentage(30, 2), '+30.00%'],
    [
      'formatPercentage(1234.5, 2)',
      () => formatPercentage(1234.5, 2),
      '+1,234.50%',
    ],
    ['formatPositionSize(0.5, 5)', () => formatPositionSize(0.5, 5), '0.5'],
    ['formatFundingRate(0.0005)', () => formatFundingRate(0.0005), '0.0500%'],
  ])('%s keeps its output', (_label, format, expected) => {
    expect(format()).toBe(expected);
  });
});

describe('TAT-4574 display formatters', () => {
  const NBSP = String.fromCharCode(0xa0);
  const intl = (locale: string): PerpsIntlFormatters => {
    const cache = new Map<string, Intl.NumberFormat>();
    const get = (options: Intl.NumberFormatOptions): Intl.NumberFormat => {
      const key = JSON.stringify(options);
      let format = cache.get(key);
      if (!format) {
        format = new Intl.NumberFormat(locale, options);
        cache.set(key, format);
      }
      return format;
    };
    return {
      formatNumber: (value, options = {}) => get(options).format(value),
      formatCurrency: (value, currency, options = {}) =>
        get({ style: 'currency', currency, ...options }).format(value),
    };
  };
  const de = intl('de');
  const ar = intl('ar-EG');
  const missingInputs = [undefined, null, '', 'abc', NaN, Infinity];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatFeeBps', () => {
    it.each([
      [0.00045, '4.5 bps'],
      [0.000144, '1.44 bps'],
      [0.0007, '7 bps'],
      [0.0000144, '0.14 bps'],
      ['0.00045', '4.5 bps'],
      [0, '0 bps'],
      [-0.0001, '-1 bps'],
      [0.12345, '1,234.5 bps'],
    ])('formats %s as %s', (rate, expected) => {
      expect(formatFeeBps(rate)).toBe(expected);
    });

    it.each(missingInputs)('renders the placeholder for %s', (rate) => {
      expect(formatFeeBps(rate)).toBe(PERPS_CONSTANTS.FallbackDataDisplay);
    });

    it('takes the locale, decimals and sign options', () => {
      expect(formatFeeBps(0.00045, { formatters: de })).toBe('4,5 bps');
      expect(formatFeeBps(0.000144, { decimals: 1 })).toBe('1.4 bps');
      expect(formatFeeBps(0.00045, { sign: 'always' })).toBe('+4.5 bps');
    });
  });

  describe('formatLiquidationDistance', () => {
    it.each([
      [100, 70, '30.00%'],
      [100, '130', '30.00%'],
      ['100', 99.6, '0.40%'],
      [10, 130, '1,200.00%'],
    ])('formats entry %s and liquidation %s as %s', (entry, liq, expected) => {
      expect(formatLiquidationDistance(entry, liq)).toBe(expected);
    });

    it.each([
      [100, undefined],
      [undefined, 70],
      [null, 70],
      [100, 'abc'],
      [0, 70],
      [100, 0],
      [-100, 70],
      [100, -70],
    ])(
      'renders the placeholder for entry %s and liquidation %s',
      (entry, liq) => {
        expect(formatLiquidationDistance(entry, liq)).toBe(
          PERPS_CONSTANTS.FallbackPercentageDisplay,
        );
      },
    );

    it('takes the locale, decimals and sign options', () => {
      expect(formatLiquidationDistance(100, 70, { formatters: de })).toBe(
        '30,00%',
      );
      expect(formatLiquidationDistance(100, 69.6, { decimals: 0 })).toBe('30%');
      expect(formatLiquidationDistance(100, 70, { sign: 'always' })).toBe(
        '+30.00%',
      );
    });
  });

  describe('formatCrossMarginRatio', () => {
    it.each([
      [0.174, '17.4%'],
      [0.634, '63.4%'],
      [0.63, '63%'],
      [0.30004, '30%'],
      [0, '0%'],
      [1.2345, '123.5%'],
      ['0.63', '63%'],
    ])('formats %s as %s', (ratio, expected) => {
      expect(formatCrossMarginRatio(ratio)).toBe(expected);
    });

    it('keeps a minus on a negative ratio and drops it when the ratio rounds to zero', () => {
      expect(formatCrossMarginRatio(-0.174)).toBe('-17.4%');
      expect(formatCrossMarginRatio(-0.0004)).toBe('0%');
    });

    it.each([undefined, null, '', '  ', 'abc', NaN, Infinity])(
      'returns the percentage placeholder for %p',
      (ratio) => {
        expect(formatCrossMarginRatio(ratio)).toBe(
          PERPS_CONSTANTS.FallbackPercentageDisplay,
        );
      },
    );

    it('uses the locale separators', () => {
      expect(formatCrossMarginRatio(0.174, { formatters: de })).toBe('17,4%');
      expect(formatCrossMarginRatio(12.345, { formatters: de })).toBe(
        '1.234,5%',
      );
    });
  });

  describe('formatPercentage stripTrailingZeros (TWAP progress)', () => {
    const twap = {
      decimals: PERPS_DISPLAY_PRECISION.TwapProgressPercent,
      stripTrailingZeros: true,
      sign: 'never' as const,
    };

    it.each([
      [25, '25%'],
      [33.33, '33.33%'],
      [33.3, '33.3%'],
      [33.333, '33.33%'],
      [99.999, '100%'],
      [0, '0%'],
    ])('formats %s as %s', (value, expected) => {
      expect(formatPercentage(value, twap)).toBe(expected);
    });

    it('keeps the decimals without the option', () => {
      expect(formatPercentage(25, { ...twap, stripTrailingZeros: false })).toBe(
        '25.00%',
      );
    });
  });

  describe('formatPerpsFiat symbol', () => {
    it.each([
      [87123.45, '87,123'],
      [2480.37, '2,480.4'],
      [0.001824, '0.001824'],
      [-2480.37, '-2,480.4'],
    ])('formats %s as %s without the symbol', (value, expected) => {
      expect(
        formatPerpsFiat(value, {
          ranges: PRICE_RANGES_UNIVERSAL,
          symbol: false,
        }),
      ).toBe(expected);
    });

    it('formats in the locale and keeps fiat-style stripping', () => {
      expect(
        formatPerpsFiat(2480.37, {
          ranges: PRICE_RANGES_UNIVERSAL,
          symbol: false,
          formatters: de,
        }),
      ).toBe('2.480,4');
      expect(formatPerpsFiat(1250, { symbol: false })).toBe('1,250');
      expect(formatPerpsFiat(13.4, { symbol: false })).toBe('13.40');
    });

    it('renders the symbol-less placeholder for a missing price', () => {
      expect(formatPerpsFiat(undefined, { symbol: false })).toBe(
        PERPS_CONSTANTS.FallbackDataDisplay,
      );
      expect(formatPerpsFiat(undefined, { symbol: true })).toBe(
        PERPS_CONSTANTS.FallbackPriceDisplay,
      );
    });
  });

  describe('formatPerpsCompact', () => {
    it.each([
      [1234567, '$1.23M'],
      [12345678, '$12.35M'],
      [1234567890, '$1.23B'],
      [2e9, '$2.00B'],
      [1.5e12, '$1.50T'],
      [1.5e15, '$1,500.00T'],
      [123456, '$123K'],
      [1234, '$1K'],
      [999.5, '$999.50'],
      [0, '$0.00'],
      [999999, '$1.00M'],
      [999.996, '$1K'],
      [-1234567, '-$1.23M'],
      ['1234567', '$1.23M'],
    ])('formats volume %s as %s', (value, expected) => {
      expect(formatPerpsCompact(value, { field: 'volume' })).toBe(expected);
    });

    it.each([
      [2100, '$2.1K'],
      [2000, '$2.0K'],
      [1234567, '$1.2M'],
      [999950, '$1.0M'],
      [950, '$950'],
      [0.5, '$0.5'],
      [-2100, '-$2.1K'],
    ])('formats order book USD %s as %s', (value, expected) => {
      expect(formatPerpsCompact(value, { field: 'orderBookUsd' })).toBe(
        expected,
      );
    });

    it.each([
      [604900, undefined, '604.9K'],
      [1000, undefined, '1.0K'],
      [0.5, 5, '0.5'],
      [0.123456, 2, '0.12'],
      [12.5, undefined, '12.5'],
    ])(
      'formats order book size %s (szDecimals %s) as %s',
      (value, szDecimals, expected) => {
        expect(
          formatPerpsCompact(value, { field: 'orderBookSize', szDecimals }),
        ).toBe(expected);
      },
    );

    it.each(missingInputs)('renders the placeholder for %s', (value) => {
      expect(formatPerpsCompact(value, { field: 'volume' })).toBe(
        PERPS_CONSTANTS.FallbackPriceDisplay,
      );
      expect(formatPerpsCompact(value, { field: 'orderBookUsd' })).toBe(
        PERPS_CONSTANTS.FallbackPriceDisplay,
      );
      expect(formatPerpsCompact(value, { field: 'orderBookSize' })).toBe(
        PERPS_CONSTANTS.FallbackDataDisplay,
      );
    });

    it('puts the suffix after the number where the locale puts the symbol', () => {
      expect(
        formatPerpsCompact(1234567, { field: 'volume', formatters: de }),
      ).toBe(`1,23M${NBSP}$`);
      expect(
        formatPerpsCompact(604900, { field: 'orderBookSize', formatters: de }),
      ).toBe('604,9K');
      expect(
        formatPerpsCompact(950, { field: 'orderBookUsd', formatters: de }),
      ).toBe(`950${NBSP}$`);
    });

    it('takes the decimals and sign options', () => {
      expect(formatPerpsCompact(1234, { field: 'volume', decimals: 1 })).toBe(
        '$1.2K',
      );
      expect(
        formatPerpsCompact(1234567, { field: 'orderBookUsd', decimals: 2 }),
      ).toBe('$1.23M');
      expect(
        formatPerpsCompact(1234567, { field: 'volume', sign: 'always' }),
      ).toBe('+$1.23M');
      expect(formatPerpsCompact(0, { field: 'volume', sign: 'always' })).toBe(
        '+$0.00',
      );
    });

    it('appends the suffix when the currency output does not contain the number', () => {
      const formatters: PerpsIntlFormatters = {
        formatNumber: (value) => `N${value}`,
        formatCurrency: (value) => `C${value}`,
      };

      expect(formatPerpsCompact(1234567, { field: 'volume', formatters })).toBe(
        'C1.23M',
      );
    });
  });

  describe('getPerpsOrderBookPriceFormat', () => {
    it.each([
      [1000, 87000, 5, { divisor: 1000, suffix: 'K', decimals: 0 }],
      [1, 87000, 5, { divisor: 1, suffix: '', decimals: 0 }],
      [10, 87000, 5, { divisor: 1000, suffix: 'K', decimals: 2 }],
      [0.001, 33.1, 2, { divisor: 1, suffix: '', decimals: 3 }],
      [0.000001, 0.002, 0, { divisor: 1, suffix: '', decimals: 6 }],
      [0.0001, 33.1, 4, { divisor: 1, suffix: '', decimals: 2 }],
      [0.01, 33.1, undefined, { divisor: 1, suffix: '', decimals: 2 }],
      [1e-7, 1, undefined, { divisor: 1, suffix: '', decimals: 6 }],
      [1000, 5_000_000, 5, { divisor: 1_000_000, suffix: 'M', decimals: 3 }],
      [1, 61470, 5, { divisor: 1, suffix: '', decimals: 0 }],
      [0.1, 61470, 4, { divisor: 1, suffix: '', decimals: 1 }],
      [1, 87000, undefined, { divisor: 1, suffix: '', decimals: 0 }],
      [1, null, 5, { divisor: 1, suffix: '', decimals: 0 }],
    ])(
      'resolves grouping %s at mid %s with szDecimals %s',
      (grouping, midPrice, szDecimals, expected) => {
        expect(
          getPerpsOrderBookPriceFormat(grouping, { midPrice, szDecimals }),
        ).toStrictEqual(expected);
      },
    );

    it.each([null, undefined, 0, -1, NaN, Infinity])(
      'returns null for grouping %s',
      (grouping) => {
        expect(
          getPerpsOrderBookPriceFormat(grouping, {
            midPrice: 87000,
            szDecimals: 5,
          }),
        ).toBeNull();
      },
    );

    it('uses the grouping decimals without ladder context', () => {
      expect(getPerpsOrderBookPriceFormat(0.01)).toStrictEqual({
        divisor: 1,
        suffix: '',
        decimals: 2,
      });
    });
  });

  describe('formatPerpsOrderBookPrice', () => {
    const plain = (decimals: number) => ({ divisor: 1, suffix: '', decimals });

    it.each([
      [87000, { divisor: 1000, suffix: 'K', decimals: 0 }, '$87K'],
      [87010, { divisor: 1000, suffix: 'K', decimals: 2 }, '$87.01K'],
      [87000, plain(0), '$87,000'],
      [33.123, plain(3), '$33.123'],
      [33.1, plain(3), '$33.100'],
      ['0.002101', plain(6), '$0.002101'],
      [0.0000004, plain(6), '$0.000000'],
      [-33.1, plain(1), '-$33.1'],
      [1.005, plain(2), '$1.01'],
      [-0.004, plain(2), '$0.00'],
    ])('formats %s with %o as %s', (price, format, expected) => {
      expect(formatPerpsOrderBookPrice(price, format)).toBe(expected);
    });

    it('uses the universal price ranges without a format', () => {
      expect(formatPerpsOrderBookPrice(87123.45, null)).toBe('$87,123');
      expect(formatPerpsOrderBookPrice(87123.45, null, { symbol: false })).toBe(
        '87,123',
      );
    });

    it('takes the locale and symbol options', () => {
      expect(
        formatPerpsOrderBookPrice(87000, plain(0), { formatters: de }),
      ).toBe(`87.000${NBSP}$`);
      expect(
        formatPerpsOrderBookPrice(
          87000,
          { divisor: 1000, suffix: 'K', decimals: 0 },
          { formatters: de },
        ),
      ).toBe(`87K${NBSP}$`);
      expect(
        formatPerpsOrderBookPrice(87000, plain(0), { symbol: false }),
      ).toBe('87,000');
      expect(
        formatPerpsOrderBookPrice(
          87000,
          { divisor: 1000, suffix: 'K', decimals: 0 },
          { symbol: false },
        ),
      ).toBe('87K');
    });

    it.each(missingInputs)('renders the placeholder for %s', (price) => {
      expect(formatPerpsOrderBookPrice(price, plain(0))).toBe(
        PERPS_CONSTANTS.FallbackPriceDisplay,
      );
      expect(formatPerpsOrderBookPrice(price, null, { symbol: false })).toBe(
        PERPS_CONSTANTS.FallbackDataDisplay,
      );
    });
  });

  describe('formatPerpsUsdInput', () => {
    it.each([
      ['0012.34', '12.34', '12.34'],
      ['12.345', '12.34', '12.34'],
      ['1234567.5', '1234567.5', '1,234,567.5'],
      ['1,234,567.5', '1234567.5', '1,234,567.5'],
      ['$1,234.56', '1234.56', '1,234.56'],
      ['1234.', '1234.', '1,234.'],
      ['.5', '0.5', '0.5'],
      ['.', '0.', '0.'],
      ['000', '0', '0'],
      ['1234567890', '123456789', '123,456,789'],
      ['1234567.89', '1234567.89', '1,234,567.89'],
      ['12345678.9', '12345678.9', '12,345,678.9'],
      ['123456789.5', '123456789.', '123,456,789.'],
      ['1.2.3', '1.23', '1.23'],
      ['-12', '12', '12'],
      ['', '', ''],
      ['abc', '', ''],
    ])('masks %s as value %s, display %s', (input, value, display) => {
      expect(formatPerpsUsdInput(input)).toStrictEqual({ value, display });
    });

    it.each([
      ['1.234.567,5', '1234567.5', '1.234.567,5'],
      ['1234,5', '1234.5', '1.234,5'],
      ['1.234', '1234', '1.234'],
      ['1.2345', '12345', '12.345'],
      ['12.45', '1245', '1.245'],
      ['12.5', '125', '125'],
    ])(
      'masks typed %s in de as value %s, display %s',
      (input, value, display) => {
        expect(formatPerpsUsdInput(input, { formatters: de })).toStrictEqual({
          value,
          display,
        });
      },
    );

    it('keeps the grouping dot while typing digit by digit in de and es', () => {
      for (const formatters of [de, intl('es')]) {
        let display = '';
        for (const key of '123456') {
          ({ display } = formatPerpsUsdInput(`${display}${key}`, {
            formatters,
          }));
        }
        expect(formatPerpsUsdInput(display, { formatters }).value).toBe(
          '123456',
        );
      }
    });

    it('reads a typed dot as the decimal where the locale does not group with it', () => {
      expect(
        formatPerpsUsdInput('1234.5', { formatters: intl('fr') }),
      ).toStrictEqual({
        value: '1234.5',
        display: `1${String.fromCharCode(0x202f)}234,5`,
      });
    });

    it.each([
      ['1234567.5', '1234567.5', '1.234.567,5'],
      ['1.234', '1.23', '1,23'],
      ['0012.5', '12.5', '12,5'],
    ])(
      'masks the stored value %s in de as value %s, display %s',
      (input, value, display) => {
        expect(
          formatPerpsUsdInput(input, { formatters: de, source: 'value' }),
        ).toStrictEqual({ value, display });
      },
    );

    it('reads and writes the locale digits', () => {
      const { display } = formatPerpsUsdInput('1234.5', { formatters: ar });

      expect(display).toBe(
        `${new Intl.NumberFormat('ar-EG').format(1234)}${new Intl.NumberFormat(
          'ar-EG',
          { minimumFractionDigits: 1 },
        )
          .format(1.5)
          .slice(1)}`,
      );
      expect(formatPerpsUsdInput(display, { formatters: ar }).value).toBe(
        '1234.5',
      );
    });

    it('returns the same input for its own display', () => {
      for (const input of ['0', '1234.', '1234567.89', '0.05']) {
        const masked = formatPerpsUsdInput(input, { formatters: de });
        expect(
          formatPerpsUsdInput(masked.display, { formatters: de }),
        ).toStrictEqual(masked);
      }
    });

    it('takes the decimals and maxDigits options', () => {
      expect(formatPerpsUsdInput('12.34', { decimals: 0 })).toStrictEqual({
        value: '12',
        display: '12',
      });
      expect(formatPerpsUsdInput('.', { decimals: 0 })).toStrictEqual({
        value: '',
        display: '',
      });
      expect(formatPerpsUsdInput('12345.67', { maxDigits: 6 })).toStrictEqual({
        value: '12345.6',
        display: '12,345.6',
      });
      expect(
        formatPerpsUsdInput('12345678901234567890', { maxDigits: 20 }),
      ).toStrictEqual({
        value: '123456789012345',
        display: '123,456,789,012,345',
      });
    });

    it('reads the locale symbols once per formatter set', () => {
      const formatters = intl('it');
      const formatNumber = vi.spyOn(formatters, 'formatNumber');
      formatPerpsUsdInput('1', { formatters });
      formatNumber.mockClear();

      formatPerpsUsdInput('1234,5', { formatters });

      expect(formatNumber).toHaveBeenCalledTimes(1);
    });

    it('falls back to ASCII digits when the locale sample is not ten glyphs', () => {
      const formatters: PerpsIntlFormatters = {
        formatNumber: (value, options) =>
          new Intl.NumberFormat('en-US', options).format(value),
        formatCurrency: (value) => String(value),
      };
      vi.spyOn(formatters, 'formatNumber').mockImplementation(
        (value, options) =>
          value === 1234567890
            ? '1,234,567,890'
            : new Intl.NumberFormat('en-US', options).format(value),
      );

      expect(formatPerpsUsdInput('1234.5', { formatters })).toStrictEqual({
        value: '1234.5',
        display: '1,234.5',
      });
    });
  });

  describe('Intl construction', () => {
    it('constructs no Intl formatter with injected formatters', () => {
      const formatters = intl('fr');
      const calls: string[] = [];
      const recording: PerpsIntlFormatters = {
        formatNumber: (value, options) => {
          calls.push('number');
          return formatters.formatNumber(value, options);
        },
        formatCurrency: (value, currency, options) => {
          calls.push('currency');
          return formatters.formatCurrency(value, currency, options);
        },
      };

      const formatAll = (): void => {
        formatFeeBps(0.00045, { formatters: recording });
        formatLiquidationDistance(100, 70, { formatters: recording });
        formatCrossMarginRatio(0.174, { formatters: recording });
        formatPerpsCompact(1234567, { field: 'volume', formatters: recording });
        formatPerpsOrderBookPrice(87000, null, { formatters: recording });
        formatPerpsUsdInput('1234.5', { formatters: recording });
      };
      // The first pass fills the injected formatters' own cache
      formatAll();
      const constructor = vi.spyOn(Intl, 'NumberFormat');
      formatAll();

      expect(calls.length).toBeGreaterThan(0);
      expect(constructor).not.toHaveBeenCalled();
    });

    it('builds the en-US fallback once per option set', () => {
      const constructor = vi.spyOn(Intl, 'NumberFormat');
      const formatAll = (index: number): void => {
        formatFeeBps(0.00045 + index / 1e7);
        formatCrossMarginRatio(0.174 + index / 1e5);
        formatPerpsCompact(1234567 + index, { field: 'volume' });
        formatPerpsUsdInput(`${1234 + index}.5`);
        formatPerpsOrderBookPrice(87000 + index, {
          divisor: 1,
          suffix: '',
          decimals: 0,
        });
        formatLiquidationDistance(100, 70 + index / 10);
      };
      formatAll(0);
      constructor.mockClear();

      for (let index = 1; index < 100; index += 1) {
        formatAll(index);
      }

      expect(constructor).not.toHaveBeenCalled();
    });
  });
});
