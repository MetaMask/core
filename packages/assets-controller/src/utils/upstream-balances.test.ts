import type { AssetBalance, Caip19AssetId } from '../types.js';
import {
  findUpstreamAmount,
  isUpstreamBalanceEmpty,
} from './upstream-balances.js';

const CHECKSUMMED_ASSET =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
const LOWER_CASED_ASSET =
  CHECKSUMMED_ASSET.toLowerCase() as Caip19AssetId;
const OTHER_ASSET = 'eip155:1/slip44:60' as Caip19AssetId;

function balances(
  entries: Record<string, string>,
): Record<string, AssetBalance> {
  return Object.fromEntries(
    Object.entries(entries).map(([assetId, amount]) => [assetId, { amount }]),
  ) as Record<string, AssetBalance>;
}

describe('findUpstreamAmount', () => {
  it('returns undefined when there are no balances', () => {
    expect(findUpstreamAmount(undefined, CHECKSUMMED_ASSET)).toBeUndefined();
  });

  it('returns the amount for an exact asset ID match', () => {
    expect(
      findUpstreamAmount(balances({ [CHECKSUMMED_ASSET]: '5' }), CHECKSUMMED_ASSET),
    ).toBe('5');
  });

  it('matches asset IDs case-insensitively', () => {
    expect(
      findUpstreamAmount(
        balances({ [LOWER_CASED_ASSET]: '7' }),
        CHECKSUMMED_ASSET,
      ),
    ).toBe('7');
  });

  it('returns undefined when the asset is absent', () => {
    expect(
      findUpstreamAmount(balances({ [OTHER_ASSET]: '1' }), CHECKSUMMED_ASSET),
    ).toBeUndefined();
  });
});

describe('isUpstreamBalanceEmpty', () => {
  it('treats an omitted asset as empty', () => {
    expect(
      isUpstreamBalanceEmpty(balances({ [OTHER_ASSET]: '1' }), CHECKSUMMED_ASSET),
    ).toBe(true);
  });

  it('treats a zero amount as empty', () => {
    expect(
      isUpstreamBalanceEmpty(
        balances({ [CHECKSUMMED_ASSET]: '0' }),
        CHECKSUMMED_ASSET,
      ),
    ).toBe(true);
  });

  it('treats a non-numeric amount as empty', () => {
    expect(
      isUpstreamBalanceEmpty(
        balances({ [CHECKSUMMED_ASSET]: 'not-a-number' }),
        CHECKSUMMED_ASSET,
      ),
    ).toBe(true);
  });

  it('treats a positive amount as not empty', () => {
    expect(
      isUpstreamBalanceEmpty(
        balances({ [CHECKSUMMED_ASSET]: '0.0001' }),
        CHECKSUMMED_ASSET,
      ),
    ).toBe(false);
  });
});
