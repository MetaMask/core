/* eslint-disable */
import { describe, expect, it, vi } from 'vitest';

import {
  PERPS_CONSTANTS,
  PERPS_DISPLAY_PRECISION,
} from '../../../src/constants/perpsConfig.js';
import * as PackageEntry from '../../../src/index.js';
import {
  formatFundingRate,
  formatPercentage,
  formatPerpsFiat,
  formatPnl,
  formatPositionSize,
  formatWithSignificantDigits,
  PRICE_RANGES_MINIMAL_VIEW,
  PRICE_RANGES_UNIVERSAL,
  PRICE_THRESHOLD,
} from '../../../src/utils/perpsFormatters.js';

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
        RoePercent: 1,
        Pnl: 2,
        Fee: 2,
        FeeRatePercent: 3,
        FundingRatePercent: 4,
        SlippageEstimatePercent: 4,
        MaxPriceDecimals: 6,
      });
    });

    it('exports the formatters from the package entry', () => {
      expect(PackageEntry.formatPercentage).toBe(formatPercentage);
      expect(PackageEntry.formatPnl).toBe(formatPnl);
      expect(PackageEntry.formatPerpsFiat).toBe(formatPerpsFiat);
      expect(PackageEntry.formatPositionSize).toBe(formatPositionSize);
      expect(PackageEntry.formatFundingRate).toBe(formatFundingRate);
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
      expect(formatPercentage(1234.5, { locale })).toBe(expected);
    });

    it('formats a negative value in a locale', () => {
      expect(formatPercentage(-12345.67, { decimals: 1, locale: 'es' })).toBe(
        '-12.345,7%',
      );
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
      expect(formatPnl(1234.5, { locale })).toBe(expected);
    });

    it('formats a negative PnL in a locale', () => {
      expect(formatPnl(-1234.5, { locale: 'es' })).toBe(`-1234,50${NBSP}$`);
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
      'formats with the %s locale and strips .00 by parts (%p)',
      (locale, input, expected) => {
        expect(formatPerpsFiat(input, { locale })).toBe(expected);
      },
    );

    it('strips trailing zeros by parts in a locale with universal ranges', () => {
      expect(
        formatPerpsFiat(1.5, { locale: 'de', ranges: PRICE_RANGES_UNIVERSAL }),
      ).toBe(`1,5${NBSP}$`);
      expect(
        formatPerpsFiat(12.3, { locale: 'de', ranges: PRICE_RANGES_UNIVERSAL }),
      ).toBe(`12,3${NBSP}$`);
    });

    it('strips trailing zeros for locales with other digits', () => {
      expect(formatPerpsFiat(1250, { locale: 'ar-EG' })).not.toContain('٫');
      expect(
        formatPerpsFiat(1.5, {
          locale: 'ar-EG',
          ranges: PRICE_RANGES_UNIVERSAL,
        }),
      ).toBe(formatPerpsFiat(1.5, { locale: 'ar-EG', decimals: 1 }));
    });

    it('does not depend on Intl formatToParts (single literal part on Hermes)', () => {
      const spy = vi
        .spyOn(Intl.NumberFormat.prototype, 'formatToParts')
        .mockImplementation(function (this: Intl.NumberFormat, value) {
          return [{ type: 'literal', value: this.format(value as number) }];
        });
      try {
        expect(formatPerpsFiat(1250, { locale: 'fr' })).toBe(
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

    it('falls back to en-US for a locale that is not a BCP 47 tag', () => {
      expect(formatPerpsFiat(1250, { locale: 'zh_CN' })).toBe('$1,250');
      expect(formatPercentage(1234.5, { locale: 'pt_BR' })).toBe('+1,234.50%');
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
      expect(formatPositionSize(-1234.5, { decimals: 2, locale: 'es' })).toBe(
        '-1234,5',
      );
      expect(formatPositionSize(12345.678, { decimals: 2, locale: 'de' })).toBe(
        '12345,68',
      );
      expect(formatPositionSize(0.0024, { locale: 'ja' })).toBe('0.0024');
    });

    it('treats an options object without decimals like the magnitude fallback', () => {
      expect(formatPositionSize(0.00009, {})).toBe('0.00009');
      expect(formatPositionSize(0.25678, { locale: 'de' })).toBe('0,2568');
      expect(formatPositionSize(44.567, { locale: 'en' })).toBe('44.57');
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
      expect(formatFundingRate(-0.000125, { locale: 'es' })).toBe('-0,0125%');
      expect(formatFundingRate(0.0005, { locale: 'ko', sign: 'always' })).toBe(
        '+0.0500%',
      );
      expect(formatFundingRate(0.000000059, { locale: 'de' })).toBe('<0,0001%');
      expect(formatFundingRate(0.000125, { decimals: 2 })).toBe('0.01%');
    });
  });
});
