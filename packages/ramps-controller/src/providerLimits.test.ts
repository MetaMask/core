import { getProviderBuyLimit } from './providerLimits.js';
import type { Provider, ProviderLimit } from './RampsService.js';

const ETH_ASSET_ID = 'eip155:1/slip44:60';
const BNB_ASSET_ID = 'eip155:56/slip44:714';

const buildLimit = (minAmount: number, maxAmount: number): ProviderLimit => ({
  minAmount,
  maxAmount,
  feeFixedRate: 0.1,
  feeDynamicRate: 0.2,
});

const buildProvider = (limits?: Provider['limits']): Provider => ({
  id: '/providers/coinbase',
  name: 'Coinbase',
  environmentType: 'STAGING',
  description: '',
  hqAddress: '',
  links: [],
  logos: { light: '', dark: '', height: 24, width: 77 },
  ...(limits ? { limits } : {}),
});

describe('getProviderBuyLimit', () => {
  it('returns the fiat limit when no per-asset limits are published', () => {
    const fiatLimit = buildLimit(2, 6400);
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': fiatLimit } },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'EUR',
        paymentMethodId: 'debit-credit-card',
      }),
    ).toBe(fiatLimit);
  });

  it('lowercases the fiat currency for the lookup', () => {
    const fiatLimit = buildLimit(2, 6400);
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': fiatLimit } },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'Eur',
        paymentMethodId: 'debit-credit-card',
      }),
    ).toBe(fiatLimit);
  });

  it('matches payment method ids regardless of /payments/ prefix on either side', () => {
    const fiatLimit = buildLimit(2, 6400);
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': fiatLimit } },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: '/payments/debit-credit-card',
      }),
    ).toBe(fiatLimit);

    const prefixedFiatLimit = buildLimit(2, 6400);
    const prefixedProvider = buildProvider({
      fiat: { eur: { '/payments/debit-credit-card': prefixedFiatLimit } },
    });

    expect(
      getProviderBuyLimit({
        provider: prefixedProvider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
      }),
    ).toBe(prefixedFiatLimit);
  });

  it('intersects the fiat limit with the per-asset limit', () => {
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': buildLimit(2, 6400) } },
      assets: { [BNB_ASSET_ID]: buildLimit(5, 4000) },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toStrictEqual({
      minAmount: 5,
      maxAmount: 4000,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });
  });

  it('keeps the fiat limit when the per-asset limit is wider', () => {
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': buildLimit(2, 6400) } },
      assets: { [BNB_ASSET_ID]: buildLimit(1, 10000) },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toStrictEqual({
      minAmount: 2,
      maxAmount: 6400,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });
  });

  it('takes fees from the fiat limit when intersecting', () => {
    const provider = buildProvider({
      fiat: {
        eur: {
          'debit-credit-card': { ...buildLimit(2, 6400), feeFixedRate: 0.5 },
        },
      },
      assets: {
        [BNB_ASSET_ID]: { ...buildLimit(5, 4000), feeFixedRate: 0.9 },
      },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      })?.feeFixedRate,
    ).toBe(0.5);
  });

  it('prefers the per-payment breakdown of the asset limit', () => {
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': buildLimit(2, 6400) } },
      assets: {
        [BNB_ASSET_ID]: {
          ...buildLimit(5, 4000),
          payments: [
            {
              payment: 'debit-credit-card',
              ...buildLimit(10, 2000),
            },
          ],
        },
      },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toStrictEqual({
      minAmount: 10,
      maxAmount: 2000,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });
  });

  it('matches the per-payment breakdown with a /payments/ prefix', () => {
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': buildLimit(2, 6400) } },
      assets: {
        [BNB_ASSET_ID]: {
          ...buildLimit(5, 4000),
          payments: [
            {
              payment: '/payments/debit-credit-card',
              ...buildLimit(10, 2000),
            },
          ],
        },
      },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: '/payments/debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toStrictEqual({
      minAmount: 10,
      maxAmount: 2000,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });
  });

  it('ignores the asset-level limit when a non-matching per-payment breakdown exists', () => {
    const fiatLimit = buildLimit(2, 6400);
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': fiatLimit } },
      assets: {
        [BNB_ASSET_ID]: {
          ...buildLimit(5, 4000),
          payments: [
            {
              payment: 'bank-transfer',
              ...buildLimit(10, 2000),
            },
          ],
        },
      },
    });

    // Mirrors the backend: a non-empty breakdown is authoritative, so an
    // unmatched payment method means no crypto limit applies.
    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toBe(fiatLimit);
  });

  it('returns only the per-asset limit when no fiat limit is published for the payment method', () => {
    const provider = buildProvider({
      assets: { [BNB_ASSET_ID]: buildLimit(5, 4000) },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toStrictEqual({
      minAmount: 5,
      maxAmount: 4000,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });
  });

  it('returns the per-payment entry without the payment field when no fiat limit is published', () => {
    const provider = buildProvider({
      assets: {
        [BNB_ASSET_ID]: {
          ...buildLimit(5, 4000),
          payments: [
            {
              payment: 'debit-credit-card',
              ...buildLimit(10, 2000),
            },
          ],
        },
      },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toStrictEqual({
      minAmount: 10,
      maxAmount: 2000,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });
  });

  it('falls back to the fiat limit when the asset has no published limits', () => {
    const fiatLimit = buildLimit(2, 6400);
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': fiatLimit } },
      assets: { [ETH_ASSET_ID]: buildLimit(2, 6400) },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: 'eip155:1/erc20:0xusdt',
      }),
    ).toBe(fiatLimit);
  });

  it('matches EVM asset ids case-insensitively', () => {
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': buildLimit(2, 6400) } },
      assets: { [BNB_ASSET_ID]: buildLimit(5, 4000) },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: 'EIP155:56/SLIP44:714',
      }),
    ).toStrictEqual({
      minAmount: 5,
      maxAmount: 4000,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });
  });

  it('keeps non-EVM asset ids case-sensitive', () => {
    const solanaAssetId =
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const fiatLimit = buildLimit(2, 6400);
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': fiatLimit } },
      assets: { [solanaAssetId]: buildLimit(5, 4000) },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: solanaAssetId.toUpperCase(),
      }),
    ).toBe(fiatLimit);
  });

  it('returns undefined when the provider has no limits', () => {
    expect(
      getProviderBuyLimit({
        provider: buildProvider(),
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toBeUndefined();
  });

  it('returns undefined when the fiat map has no entry for the payment method', () => {
    const provider = buildProvider({
      fiat: { eur: { 'bank-transfer': buildLimit(2, 6400) } },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
      }),
    ).toBeUndefined();
  });

  it('treats a maxAmount of 0 as unbounded when intersecting', () => {
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': buildLimit(2, 0) } },
      assets: { [BNB_ASSET_ID]: buildLimit(5, 4000) },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toStrictEqual({
      minAmount: 5,
      maxAmount: 4000,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });

    const unboundedAssetProvider = buildProvider({
      fiat: { eur: { 'debit-credit-card': buildLimit(2, 6400) } },
      assets: { [BNB_ASSET_ID]: buildLimit(5, 0) },
    });

    expect(
      getProviderBuyLimit({
        provider: unboundedAssetProvider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toStrictEqual({
      minAmount: 5,
      maxAmount: 6400,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });
  });

  it('falls back to the asset-level limit when the per-payment breakdown is empty', () => {
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': buildLimit(2, 6400) } },
      assets: {
        [BNB_ASSET_ID]: {
          ...buildLimit(5, 4000),
          payments: [],
        },
      },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toStrictEqual({
      minAmount: 5,
      maxAmount: 4000,
      feeFixedRate: 0.1,
      feeDynamicRate: 0.2,
    });
  });

  it('falls back to the fiat limit when the asset id is provided but no per-asset limits are published', () => {
    const fiatLimit = buildLimit(2, 6400);
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': fiatLimit } },
    });

    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
        assetId: BNB_ASSET_ID,
      }),
    ).toBe(fiatLimit);
  });

  it('returns undefined when required arguments are missing', () => {
    const provider = buildProvider({
      fiat: { eur: { 'debit-credit-card': buildLimit(2, 6400) } },
    });

    expect(
      getProviderBuyLimit({
        provider: null,
        fiatCurrency: 'eur',
        paymentMethodId: 'debit-credit-card',
      }),
    ).toBeUndefined();
    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: null,
        paymentMethodId: 'debit-credit-card',
      }),
    ).toBeUndefined();
    expect(
      getProviderBuyLimit({
        provider,
        fiatCurrency: 'eur',
        paymentMethodId: '',
      }),
    ).toBeUndefined();
  });
});
