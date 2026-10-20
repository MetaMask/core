import { describe, expectTypeOf, test } from 'vitest';

import type {
  CaipAccountAddress,
  CaipAccountId,
  CaipAssetId,
  CaipAssetNamespace,
  CaipAssetReference,
  CaipAssetType,
  CaipChainId,
  CaipNamespace,
  CaipReference,
} from './index.js';

const embeddedString = 'test';

describe('CAIP types', () => {
  test('accept valid CAIP strings', () => {
    expectTypeOf('namespace:reference' as const).toExtend<CaipChainId>();
    expectTypeOf('namespace:' as const).toExtend<CaipChainId>();
    expectTypeOf(':reference' as const).toExtend<CaipChainId>();
    expectTypeOf(
      `${embeddedString}:${embeddedString}` as const,
    ).toExtend<CaipChainId>();

    expectTypeOf('string' as const).toExtend<CaipNamespace>();
    expectTypeOf(`${embeddedString}` as const).toExtend<CaipNamespace>();

    expectTypeOf('string' as const).toExtend<CaipReference>();
    expectTypeOf(`${embeddedString}` as const).toExtend<CaipReference>();

    expectTypeOf(
      'namespace:reference:accountAddress' as const,
    ).toExtend<CaipAccountId>();
    expectTypeOf('namespace:reference:' as const).toExtend<CaipAccountId>();
    expectTypeOf(
      ':reference:accountAddress' as const,
    ).toExtend<CaipAccountId>();
    expectTypeOf(
      `${embeddedString}:${embeddedString}:${embeddedString}` as const,
    ).toExtend<CaipAccountId>();

    expectTypeOf('string' as const).toExtend<CaipAccountAddress>();
    expectTypeOf(`${embeddedString}` as const).toExtend<CaipAccountAddress>();

    expectTypeOf('string' as const).toExtend<CaipAssetNamespace>();
    expectTypeOf(`${embeddedString}` as const).toExtend<CaipAssetNamespace>();

    expectTypeOf('string' as const).toExtend<CaipAssetReference>();
    expectTypeOf(`${embeddedString}` as const).toExtend<CaipAssetReference>();

    expectTypeOf(
      'namespace:reference/assetNamespace:assetReference' as const,
    ).toExtend<CaipAssetType>();
    expectTypeOf('namespace:reference/:' as const).toExtend<CaipAssetType>();
    expectTypeOf(
      ':reference/assetNamespace:' as const,
    ).toExtend<CaipAssetType>();
    expectTypeOf(
      `${embeddedString}:${embeddedString}/${embeddedString}:${embeddedString}` as const,
    ).toExtend<CaipAssetType>();

    expectTypeOf(
      'namespace:reference/assetNamespace:assetReference/tokenId' as const,
    ).toExtend<CaipAssetId>();
    expectTypeOf(
      'namespace:reference/:assetReference/' as const,
    ).toExtend<CaipAssetId>();
    expectTypeOf(
      ':reference/assetNamespace:/' as const,
    ).toExtend<CaipAssetId>();
    expectTypeOf(
      `${embeddedString}:${embeddedString}/${embeddedString}:${embeddedString}/${embeddedString}` as const,
    ).toExtend<CaipAssetId>();
  });

  test('reject invalid CAIP strings', () => {
    // Emoji are not excluded by the patterns, only checked at runtime.
    expectTypeOf('namespace:😀' as const).toExtend<CaipChainId>();
    expectTypeOf('😀:reference' as const).toExtend<CaipChainId>();
    expectTypeOf(0).not.toExtend<CaipChainId>();
    expectTypeOf('🙃' as const).not.toExtend<CaipChainId>();

    expectTypeOf(0).not.toExtend<CaipNamespace>();

    expectTypeOf(0).not.toExtend<CaipReference>();

    expectTypeOf('namespace:reference:😀' as const).toExtend<CaipAccountId>();
    expectTypeOf(
      '😀:reference:accountAddress' as const,
    ).toExtend<CaipAccountId>();
    expectTypeOf(0).not.toExtend<CaipAccountId>();
    expectTypeOf('🙃' as const).not.toExtend<CaipAccountId>();

    expectTypeOf(0).not.toExtend<CaipAccountAddress>();

    expectTypeOf(0).not.toExtend<CaipAssetNamespace>();

    expectTypeOf(0).not.toExtend<CaipAssetReference>();

    expectTypeOf(0).not.toExtend<CaipAssetType>();
    expectTypeOf('🙃' as const).not.toExtend<CaipAssetType>();

    expectTypeOf(0).not.toExtend<CaipAssetId>();
    expectTypeOf('🙃' as const).not.toExtend<CaipAssetId>();
  });
});
