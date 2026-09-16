import type { CaipAssetType } from '@metamask/utils';

import type { DeepPartial } from '../types.js';
import type { AmountsAndAsset } from '../validators/amount-and-asset.js';
import { sumAmounts, sumAmountsByAssetId } from './number-formatters.js';

const ETH = 'eip155:1/slip44:60' as CaipAssetType;
const USDC =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as CaipAssetType;
const USDC_MIXED_CASE =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as CaipAssetType;

const dest = ({
  assetId,
  amount,
  normalizedAmount,
  minAmount,
  minAmountNormalized,
  valueInCurrency,
  usd,
  minAmountValueInCurrency,
  minAmountUsd,
}: {
  assetId?: CaipAssetType;
  amount?: string;
  normalizedAmount?: string;
  minAmount?: string;
  minAmountNormalized?: string;
  valueInCurrency?: string;
  usd?: string;
  minAmountValueInCurrency?: string;
  minAmountUsd?: string;
}): DeepPartial<AmountsAndAsset> => ({
  ...(assetId && { asset: { assetId } }),
  ...(amount && { amount }),
  ...(normalizedAmount && { normalizedAmount }),
  ...(minAmount && { minAmount }),
  ...(minAmountNormalized && { minAmountNormalized }),
  ...(valueInCurrency && { valueInCurrency }),
  ...(usd && { usd }),
  ...(minAmountValueInCurrency && { minAmountValueInCurrency }),
  ...(minAmountUsd && { minAmountUsd }),
});

describe('sumAmounts', () => {
  it('returns undefined when there are no fees', () => {
    expect(sumAmounts()).toBeUndefined();
    expect(sumAmounts(undefined, [])).toBeUndefined();
  });

  it('returns the fee when there is only one', () => {
    const fee = dest({
      assetId: ETH,
      amount: '100',
      usd: '4',
    });

    expect(sumAmounts([fee])).toStrictEqual(fee);
  });

  it('adds amount and fiat keys when assetIds match', () => {
    expect(
      sumAmounts(
        [
          dest({
            assetId: ETH,
            amount: '1',
            normalizedAmount: '0.1',
            minAmount: '10',
            minAmountNormalized: '1',
            valueInCurrency: '2',
            usd: '3',
            minAmountValueInCurrency: '4',
            minAmountUsd: '5',
          }),
          dest({
            assetId: ETH,
            amount: '2',
            normalizedAmount: '0.2',
            minAmount: '20',
            minAmountNormalized: '2',
            valueInCurrency: '20',
            usd: '30',
            minAmountValueInCurrency: '40',
            minAmountUsd: '50',
          }),
        ],
        [
          dest({
            assetId: ETH,
            amount: '3',
            normalizedAmount: '0.3',
            minAmount: '30',
            minAmountNormalized: '3',
            valueInCurrency: '200',
            usd: '300',
            minAmountValueInCurrency: '400',
            minAmountUsd: '500',
          }),
        ],
      ),
    ).toStrictEqual({
      asset: { assetId: ETH },
      amount: '6',
      normalizedAmount: '0.6',
      minAmount: '60',
      minAmountNormalized: '6',
      valueInCurrency: '222',
      usd: '333',
      minAmountValueInCurrency: '444',
      minAmountUsd: '555',
    });
  });

  it('adds amount keys when EVM assetIds match case-insensitively', () => {
    expect(
      sumAmounts([
        dest({ assetId: USDC, amount: '10', usd: '10' }),
        dest({ assetId: USDC_MIXED_CASE, amount: '15', usd: '15' }),
      ]),
    ).toStrictEqual({
      asset: { assetId: USDC_MIXED_CASE },
      amount: '25',
      usd: '25',
    });
  });

  it('adds only fiat keys when assetIds do not match', () => {
    expect(
      sumAmounts([
        dest({ assetId: ETH, amount: '1', usd: '10', valueInCurrency: '11' }),
        dest({ assetId: USDC, amount: '2', usd: '20', valueInCurrency: '22' }),
      ]),
    ).toStrictEqual({
      usd: '30',
      valueInCurrency: '33',
    });
  });

  it('skips null and undefined fees', () => {
    expect(
      sumAmounts([
        null,
        dest({ assetId: ETH, amount: '4', usd: '8' }),
        undefined,
      ]),
    ).toStrictEqual(dest({ assetId: ETH, amount: '4', usd: '8' }));
  });
});

describe('sumAmountsByAssetId', () => {
  it('returns an empty array when there are no fees', () => {
    expect(sumAmountsByAssetId()).toStrictEqual([]);
    expect(sumAmountsByAssetId(undefined, [])).toStrictEqual([]);
  });

  it('returns the fee when there is only one', () => {
    const fee = dest({
      assetId: ETH,
      amount: '100',
      usd: '4',
    });

    expect(sumAmountsByAssetId([fee])).toStrictEqual([fee]);
  });

  it('adds amount and fiat keys when assetIds match', () => {
    expect(
      sumAmountsByAssetId([
        dest({ assetId: ETH, amount: '1', usd: '3' }),
        dest({ assetId: ETH, amount: '2', usd: '30' }),
        dest({ assetId: ETH, amount: '3', usd: '300' }),
      ]),
    ).toStrictEqual([
      {
        asset: { assetId: ETH },
        amount: '6',
        usd: '333',
      },
    ]);
  });

  it('keeps separate entries when assetIds do not match', () => {
    expect(
      sumAmountsByAssetId([
        dest({ assetId: ETH, amount: '1', usd: '10', valueInCurrency: '11' }),
        dest({ assetId: USDC, amount: '2', usd: '20', valueInCurrency: '22' }),
      ]),
    ).toStrictEqual([
      dest({ assetId: ETH, amount: '1', usd: '10', valueInCurrency: '11' }),
      dest({ assetId: USDC, amount: '2', usd: '20', valueInCurrency: '22' }),
    ]);
  });
});
