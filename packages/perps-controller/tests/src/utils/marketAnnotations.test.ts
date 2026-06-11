import { HYPERLIQUID_ASSET_NAMES } from '../../../src/constants/hyperLiquidConfig';
import type { PerpConciseAnnotationEntry } from '../../../src/utils/marketAnnotations';
import {
  mergeAssetNamesWithAnnotations,
  extractAssetKeywords,
} from '../../../src/utils/marketAnnotations';

describe('mergeAssetNamesWithAnnotations', () => {
  it('returns a copy of the curated map when there are no annotations', () => {
    expect(mergeAssetNamesWithAnnotations(undefined)).toStrictEqual(
      HYPERLIQUID_ASSET_NAMES,
    );
    expect(mergeAssetNamesWithAnnotations([])).toStrictEqual(
      HYPERLIQUID_ASSET_NAMES,
    );
    // Must be a copy, not the shared reference.
    expect(mergeAssetNamesWithAnnotations(undefined)).not.toBe(
      HYPERLIQUID_ASSET_NAMES,
    );
  });

  it('lets curated names win over annotation display names', () => {
    const curated = { BTC: 'Bitcoin' };
    const annotations: PerpConciseAnnotationEntry[] = [
      ['BTC', { category: 'crypto', displayName: 'Bitcoin (annotation)' }],
    ];
    expect(mergeAssetNamesWithAnnotations(annotations, curated)).toStrictEqual({
      BTC: 'Bitcoin',
    });
  });

  it('fills gaps from annotation display names where curated has no entry', () => {
    const curated = { BTC: 'Bitcoin' };
    const annotations: PerpConciseAnnotationEntry[] = [
      ['flx:DOGE', { category: 'crypto', displayName: 'Dogecoin' }],
    ];
    expect(mergeAssetNamesWithAnnotations(annotations, curated)).toStrictEqual({
      BTC: 'Bitcoin',
      'flx:DOGE': 'Dogecoin',
    });
  });

  it('ignores annotations with a missing or blank display name', () => {
    const annotations: PerpConciseAnnotationEntry[] = [
      ['NOPE', { category: 'crypto' }],
      ['BLANK', { category: 'crypto', displayName: '   ' }],
      ['OK', { category: 'crypto', displayName: '  Trimmed  ' }],
    ];
    expect(mergeAssetNamesWithAnnotations(annotations, {})).toStrictEqual({
      OK: 'Trimmed',
    });
  });

  it('defaults the curated map to the bundled HYPERLIQUID_ASSET_NAMES', () => {
    const annotations: PerpConciseAnnotationEntry[] = [
      ['BTC', { category: 'crypto', displayName: 'Should not override' }],
    ];
    const result = mergeAssetNamesWithAnnotations(annotations);
    expect(result.BTC).toBe(HYPERLIQUID_ASSET_NAMES.BTC);
  });
});

describe('extractAssetKeywords', () => {
  it('returns an empty map when there are no annotations', () => {
    expect(extractAssetKeywords(undefined)).toStrictEqual({});
    expect(extractAssetKeywords([])).toStrictEqual({});
  });

  it('collects trimmed, non-empty keywords per asset', () => {
    const annotations: PerpConciseAnnotationEntry[] = [
      ['BTC', { category: 'crypto', keywords: [' digital gold ', 'btc'] }],
    ];
    expect(extractAssetKeywords(annotations)).toStrictEqual({
      BTC: ['digital gold', 'btc'],
    });
  });

  it('omits assets with no keywords or only blank keywords', () => {
    const annotations: PerpConciseAnnotationEntry[] = [
      ['NONE', { category: 'crypto' }],
      ['EMPTY', { category: 'crypto', keywords: [] }],
      ['BLANK', { category: 'crypto', keywords: ['  ', ''] }],
      ['OK', { category: 'crypto', keywords: ['valid'] }],
    ];
    expect(extractAssetKeywords(annotations)).toStrictEqual({
      OK: ['valid'],
    });
  });
});
