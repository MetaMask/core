import {
  getSmartSelectedQuote,
  validateBuyAmount,
  fitsProviderLimits,
} from './quoteSelection';
import type { ProviderScope } from './RampsController';
import type {
  Provider,
  ProviderLimit,
  Quote,
  QuotesResponse,
} from './RampsService';

const NATIVE = '/providers/transak-native';
const MOONPAY = '/providers/moonpay';
const REVOLUT = '/providers/revolut';
const COINBASE = '/providers/coinbase';
const PAYPAL = '/providers/paypal';
const PAYMENT_METHOD = '/payments/debit-credit-card';
const FIAT = 'usd';

/**
 * Builds a fiat limits map for a provider keyed by the shared fiat/payment
 * method used across these tests.
 *
 * @param minAmount - Minimum fiat amount.
 * @param maxAmount - Maximum fiat amount.
 * @returns The provider limits.
 */
const fiatLimits = (minAmount: number, maxAmount: number): Provider['limits'] => ({
  fiat: {
    [FIAT]: {
      [PAYMENT_METHOD]: {
        minAmount,
        maxAmount,
        feeFixedRate: 0,
        feeDynamicRate: 0,
      },
    },
  },
});

/**
 * Builds a provider fixture.
 *
 * @param id - The provider id.
 * @param type - Provider classification.
 * @param limits - Optional published limits.
 * @returns The provider.
 */
const provider = (
  id: string,
  type: 'native' | 'aggregator' = 'aggregator',
  limits?: Provider['limits'],
): Provider => ({
  id,
  name: id,
  type,
  environmentType: 'STAGING',
  description: '',
  hqAddress: '',
  links: [],
  logos: { light: '', dark: '', height: 24, width: 77 },
  ...(limits ? { limits } : {}),
});

/**
 * Builds an in-app WebView quote (browser hint `APP_BROWSER`).
 *
 * @param providerId - The provider id.
 * @param reliability - Reliability score for metadata.
 * @returns The quote.
 */
const inAppQuote = (providerId: string, reliability = 50): Quote => ({
  provider: providerId,
  quote: {
    amountIn: 100,
    amountOut: '0.05',
    paymentMethod: PAYMENT_METHOD,
    buyWidget: { url: 'https://widget.example/checkout', browser: 'APP_BROWSER' },
  },
  metadata: { reliability },
});

/**
 * Builds an external-browser quote (browser hint `IN_APP_OS_BROWSER`).
 *
 * @param providerId - The provider id.
 * @param reliability - Reliability score for metadata.
 * @returns The quote.
 */
const externalQuote = (providerId: string, reliability = 50): Quote => ({
  provider: providerId,
  quote: {
    amountIn: 100,
    amountOut: '0.05',
    paymentMethod: PAYMENT_METHOD,
    buyWidget: {
      url: 'https://widget.example/checkout',
      browser: 'IN_APP_OS_BROWSER',
    },
  },
  metadata: { reliability },
});

/**
 * Builds a quote carrying the inline `isCustomAction` flag.
 *
 * @param providerId - The provider id.
 * @param reliability - Reliability score for metadata.
 * @returns The quote.
 */
const customActionQuote = (providerId: string, reliability = 50): Quote => {
  const quote = inAppQuote(providerId, reliability);
  (quote.quote as { isCustomAction?: boolean }).isCustomAction = true;
  return quote;
};

const catalog = [
  provider(NATIVE, 'native'),
  provider(MOONPAY),
  provider(REVOLUT),
  provider(COINBASE),
  provider(PAYPAL),
];

/**
 * Invokes `getSmartSelectedQuote` with sensible defaults for these tests.
 *
 * @param response - The quotes response.
 * @param overrides - Selection option overrides.
 * @returns The selected quote or `undefined`.
 */
const select = (
  response: QuotesResponse,
  overrides: Partial<{
    scope: ProviderScope;
    amount: number;
    fiat: string;
    providers: Provider[];
    preferredProviderIds: string[];
  }> = {},
): Quote | undefined =>
  getSmartSelectedQuote(response, {
    scope: 'in-app',
    amount: 100,
    fiat: FIAT,
    providers: catalog,
    ...overrides,
  });

describe('getSmartSelectedQuote', () => {
  describe('ranking', () => {
    it('picks the reliability winner among eligible candidates', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY, 90), inAppQuote(REVOLUT, 80)],
        sorted: [{ sortBy: 'reliability', ids: [MOONPAY, REVOLUT] }],
        error: [],
        customActions: [],
      };

      expect(select(response)?.provider).toBe(MOONPAY);
    });

    it('falls back to the price order when there is no reliability order', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY), inAppQuote(REVOLUT)],
        sorted: [{ sortBy: 'price', ids: [REVOLUT, MOONPAY] }],
        error: [],
        customActions: [],
      };

      expect(select(response)?.provider).toBe(REVOLUT);
    });

    it('falls back to the first surviving candidate when no sort order matches', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(REVOLUT), inAppQuote(MOONPAY)],
        sorted: [],
        error: [],
        customActions: [],
      };

      expect(select(response)?.provider).toBe(REVOLUT);
    });

    it('prefers reliability over price when both orders exist', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY), inAppQuote(REVOLUT)],
        sorted: [
          { sortBy: 'reliability', ids: [MOONPAY, REVOLUT] },
          { sortBy: 'price', ids: [REVOLUT, MOONPAY] },
        ],
        error: [],
        customActions: [],
      };

      expect(select(response)?.provider).toBe(MOONPAY);
    });

    it('skips a reliability leader that was filtered out and picks the next eligible one', () => {
      const response: QuotesResponse = {
        success: [
          inAppQuote(MOONPAY, 90),
          inAppQuote(REVOLUT, 80),
          externalQuote(COINBASE, 99),
        ],
        sorted: [
          { sortBy: 'reliability', ids: [COINBASE, MOONPAY, REVOLUT] },
        ],
        error: [],
        customActions: [],
      };

      expect(select(response)?.provider).toBe(MOONPAY);
    });
  });

  describe('preferredProviderIds rung', () => {
    it('prefers a preferred provider over the reliability winner', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY, 90), inAppQuote(REVOLUT, 80)],
        sorted: [{ sortBy: 'reliability', ids: [MOONPAY, REVOLUT] }],
        error: [],
        customActions: [],
      };

      expect(
        select(response, { preferredProviderIds: [REVOLUT] })?.provider,
      ).toBe(REVOLUT);
    });

    it('honors the priority order of preferredProviderIds', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY, 90), inAppQuote(REVOLUT, 80)],
        sorted: [{ sortBy: 'reliability', ids: [MOONPAY, REVOLUT] }],
        error: [],
        customActions: [],
      };

      expect(
        select(response, {
          preferredProviderIds: [COINBASE, REVOLUT, MOONPAY],
        })?.provider,
      ).toBe(REVOLUT);
    });

    it('ignores a preferred provider that is not an eligible candidate and falls through to reliability', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY, 90), externalQuote(COINBASE, 99)],
        sorted: [{ sortBy: 'reliability', ids: [COINBASE, MOONPAY] }],
        error: [],
        customActions: [],
      };

      // COINBASE is preferred but external (filtered out under in-app), so the
      // reliability winner among eligible candidates wins instead.
      expect(
        select(response, { preferredProviderIds: [COINBASE] })?.provider,
      ).toBe(MOONPAY);
    });

    it('matches preferred ids regardless of the /providers/ prefix', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY, 90), inAppQuote(REVOLUT, 80)],
        sorted: [{ sortBy: 'reliability', ids: [MOONPAY, REVOLUT] }],
        error: [],
        customActions: [],
      };

      expect(
        select(response, { preferredProviderIds: ['revolut'] })?.provider,
      ).toBe(REVOLUT);
    });
  });

  describe('in-app filter', () => {
    it('excludes external-browser quotes under in-app scope', () => {
      const response: QuotesResponse = {
        success: [externalQuote(COINBASE, 99), inAppQuote(MOONPAY, 50)],
        sorted: [{ sortBy: 'reliability', ids: [COINBASE, MOONPAY] }],
        error: [],
        customActions: [],
      };

      expect(select(response, { scope: 'in-app' })?.provider).toBe(MOONPAY);
    });

    it('excludes quotes carrying the inline isCustomAction flag under in-app scope', () => {
      const response: QuotesResponse = {
        success: [customActionQuote(PAYPAL, 99), inAppQuote(MOONPAY, 50)],
        sorted: [{ sortBy: 'reliability', ids: [PAYPAL, MOONPAY] }],
        error: [],
        customActions: [],
      };

      expect(select(response, { scope: 'in-app' })?.provider).toBe(MOONPAY);
    });

    it('excludes providers listed in the response customActions array under in-app scope', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(PAYPAL, 99), inAppQuote(MOONPAY, 50)],
        sorted: [{ sortBy: 'reliability', ids: [PAYPAL, MOONPAY] }],
        error: [],
        customActions: [
          {
            buy: { providerId: PAYPAL },
            paymentMethodId: PAYMENT_METHOD,
            supportedPaymentMethodIds: [PAYMENT_METHOD],
          },
        ],
      };

      expect(select(response, { scope: 'in-app' })?.provider).toBe(MOONPAY);
    });

    it('returns undefined when every candidate is filtered out', () => {
      const response: QuotesResponse = {
        success: [externalQuote(COINBASE, 99), customActionQuote(PAYPAL, 80)],
        sorted: [{ sortBy: 'reliability', ids: [COINBASE, PAYPAL] }],
        error: [],
        customActions: [],
      };

      expect(select(response, { scope: 'in-app' })).toBeUndefined();
    });

    it('treats scope off like in-app for filtering (native-only gate is applied earlier)', () => {
      const response: QuotesResponse = {
        success: [externalQuote(COINBASE, 99), inAppQuote(MOONPAY, 50)],
        sorted: [{ sortBy: 'reliability', ids: [COINBASE, MOONPAY] }],
        error: [],
        customActions: [],
      };

      expect(select(response, { scope: 'off' })?.provider).toBe(MOONPAY);
    });
  });

  describe('all scope', () => {
    it('keeps external-browser quotes eligible', () => {
      const response: QuotesResponse = {
        success: [externalQuote(COINBASE, 99), inAppQuote(MOONPAY, 50)],
        sorted: [{ sortBy: 'reliability', ids: [COINBASE, MOONPAY] }],
        error: [],
        customActions: [],
      };

      expect(select(response, { scope: 'all' })?.provider).toBe(COINBASE);
    });

    it('keeps custom-action quotes eligible', () => {
      const response: QuotesResponse = {
        success: [customActionQuote(PAYPAL, 99), inAppQuote(MOONPAY, 50)],
        sorted: [{ sortBy: 'reliability', ids: [PAYPAL, MOONPAY] }],
        error: [],
        customActions: [
          {
            buy: { providerId: PAYPAL },
            paymentMethodId: PAYMENT_METHOD,
            supportedPaymentMethodIds: [PAYMENT_METHOD],
          },
        ],
      };

      expect(select(response, { scope: 'all' })?.provider).toBe(PAYPAL);
    });
  });

  describe('provider-limit enforcement', () => {
    it('drops a candidate whose amount is below the provider minimum', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY, 90), inAppQuote(REVOLUT, 80)],
        sorted: [{ sortBy: 'reliability', ids: [MOONPAY, REVOLUT] }],
        error: [],
        customActions: [],
      };

      const providers = [
        provider(MOONPAY, 'aggregator', fiatLimits(200, 1000)),
        provider(REVOLUT, 'aggregator', fiatLimits(10, 1000)),
      ];

      expect(select(response, { amount: 100, providers })?.provider).toBe(
        REVOLUT,
      );
    });

    it('drops a candidate whose amount is above the provider maximum', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY, 90), inAppQuote(REVOLUT, 80)],
        sorted: [{ sortBy: 'reliability', ids: [MOONPAY, REVOLUT] }],
        error: [],
        customActions: [],
      };

      const providers = [
        provider(MOONPAY, 'aggregator', fiatLimits(10, 50)),
        provider(REVOLUT, 'aggregator', fiatLimits(10, 1000)),
      ];

      expect(select(response, { amount: 100, providers })?.provider).toBe(
        REVOLUT,
      );
    });

    it('accepts a candidate exactly at the provider bounds', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY, 90)],
        sorted: [{ sortBy: 'reliability', ids: [MOONPAY] }],
        error: [],
        customActions: [],
      };

      const providers = [provider(MOONPAY, 'aggregator', fiatLimits(100, 100))];

      expect(select(response, { amount: 100, providers })?.provider).toBe(
        MOONPAY,
      );
    });

    it('treats a candidate with no published limits as eligible', () => {
      const response: QuotesResponse = {
        success: [inAppQuote(MOONPAY, 90)],
        sorted: [{ sortBy: 'reliability', ids: [MOONPAY] }],
        error: [],
        customActions: [],
      };

      expect(
        select(response, { amount: 100_000, providers: [provider(MOONPAY)] })
          ?.provider,
      ).toBe(MOONPAY);
    });
  });

  it('returns undefined for an empty success list', () => {
    const response: QuotesResponse = {
      success: [],
      sorted: [],
      error: [],
      customActions: [],
    };

    expect(select(response)).toBeUndefined();
  });
});

describe('validateBuyAmount', () => {
  const limit: ProviderLimit = {
    minAmount: 20,
    maxAmount: 500,
    feeFixedRate: 0,
    feeDynamicRate: 0,
  };

  it('is valid when there is no limit to enforce', () => {
    expect(validateBuyAmount({ amount: 1_000_000 })).toStrictEqual({
      valid: true,
    });
  });

  it('rejects an amount below the minimum with the offending limit', () => {
    expect(validateBuyAmount({ amount: 10, limit })).toStrictEqual({
      valid: false,
      reason: 'below_minimum',
      limit,
    });
  });

  it('rejects an amount above the maximum with the offending limit', () => {
    expect(validateBuyAmount({ amount: 900, limit })).toStrictEqual({
      valid: false,
      reason: 'above_maximum',
      limit,
    });
  });

  it('accepts an amount at the inclusive minimum bound', () => {
    expect(validateBuyAmount({ amount: 20, limit })).toStrictEqual({
      valid: true,
    });
  });

  it('accepts an amount at the inclusive maximum bound', () => {
    expect(validateBuyAmount({ amount: 500, limit })).toStrictEqual({
      valid: true,
    });
  });
});

describe('fitsProviderLimits', () => {
  it('resolves the provider limit and accepts an in-bounds amount', () => {
    expect(
      fitsProviderLimits(inAppQuote(MOONPAY), {
        amount: 100,
        fiat: FIAT,
        providers: [provider(MOONPAY, 'aggregator', fiatLimits(10, 1000))],
      }),
    ).toBe(true);
  });

  it('rejects an out-of-bounds amount for the resolved provider limit', () => {
    expect(
      fitsProviderLimits(inAppQuote(MOONPAY), {
        amount: 5,
        fiat: FIAT,
        providers: [provider(MOONPAY, 'aggregator', fiatLimits(10, 1000))],
      }),
    ).toBe(false);
  });

  it('treats a quote whose provider is absent from the catalog as eligible', () => {
    expect(
      fitsProviderLimits(inAppQuote(MOONPAY), {
        amount: 100,
        fiat: FIAT,
        providers: [provider(REVOLUT, 'aggregator', fiatLimits(200, 300))],
      }),
    ).toBe(true);
  });

  it('matches the provider regardless of the /providers/ prefix', () => {
    const quote = inAppQuote('moonpay');
    expect(
      fitsProviderLimits(quote, {
        amount: 5,
        fiat: FIAT,
        providers: [provider(MOONPAY, 'aggregator', fiatLimits(10, 1000))],
      }),
    ).toBe(false);
  });
});
