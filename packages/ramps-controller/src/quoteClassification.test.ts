import {
  isCustomActionQuote,
  isExternalBrowserQuote,
  isInAppOnlyQuote,
} from './quoteClassification.js';
import type { Quote } from './RampsService.js';

const buildQuote = (
  overrides: {
    browser?: string;
    isCustomAction?: boolean;
  } = {},
): Quote =>
  ({
    provider: 'moonpay',
    quote: {
      amountIn: 100,
      amountOut: '0.05',
      paymentMethod: 'credit_debit_card',
      ...(overrides.browser
        ? {
            buyWidget: {
              url: 'https://widget.example',
              browser: overrides.browser,
            },
          }
        : {}),
      ...(overrides.isCustomAction === undefined
        ? {}
        : { isCustomAction: overrides.isCustomAction }),
    },
    metadata: { reliability: 1 },
  }) as unknown as Quote;

describe('isExternalBrowserQuote', () => {
  it('returns true when the buy widget targets the OS browser', () => {
    expect(
      isExternalBrowserQuote(buildQuote({ browser: 'IN_APP_OS_BROWSER' })),
    ).toBe(true);
  });

  it('returns false for an in-app widget browser', () => {
    expect(isExternalBrowserQuote(buildQuote({ browser: 'APP_BROWSER' }))).toBe(
      false,
    );
  });

  it('returns false when no browser hint is present', () => {
    expect(isExternalBrowserQuote(buildQuote())).toBe(false);
  });
});

describe('isCustomActionQuote', () => {
  it('returns true when the inline isCustomAction flag is set', () => {
    expect(isCustomActionQuote(buildQuote({ isCustomAction: true }))).toBe(
      true,
    );
  });

  it('returns false when the flag is false or absent', () => {
    expect(isCustomActionQuote(buildQuote({ isCustomAction: false }))).toBe(
      false,
    );
    expect(isCustomActionQuote(buildQuote())).toBe(false);
  });
});

describe('isInAppOnlyQuote', () => {
  it('returns true for a plain in-app aggregator quote', () => {
    expect(isInAppOnlyQuote(buildQuote({ browser: 'APP_BROWSER' }))).toBe(true);
  });

  it('returns false for an external-browser quote', () => {
    expect(isInAppOnlyQuote(buildQuote({ browser: 'IN_APP_OS_BROWSER' }))).toBe(
      false,
    );
  });

  it('returns false for a custom-action quote', () => {
    expect(isInAppOnlyQuote(buildQuote({ isCustomAction: true }))).toBe(false);
  });
});
