import { describe, expect, test } from 'tstyche';

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
    expect('namespace:reference').type.toBeAssignableTo<CaipChainId>();
    expect('namespace:').type.toBeAssignableTo<CaipChainId>();
    expect(':reference').type.toBeAssignableTo<CaipChainId>();
    expect(
      `${embeddedString}:${embeddedString}`,
    ).type.toBeAssignableTo<CaipChainId>();

    expect('string').type.toBeAssignableTo<CaipNamespace>();
    expect(`${embeddedString}`).type.toBeAssignableTo<CaipNamespace>();

    expect('string').type.toBeAssignableTo<CaipReference>();
    expect(`${embeddedString}`).type.toBeAssignableTo<CaipReference>();

    expect(
      'namespace:reference:accountAddress',
    ).type.toBeAssignableTo<CaipAccountId>();
    expect('namespace:reference:').type.toBeAssignableTo<CaipAccountId>();
    expect(':reference:accountAddress').type.toBeAssignableTo<CaipAccountId>();
    expect(
      `${embeddedString}:${embeddedString}:${embeddedString}`,
    ).type.toBeAssignableTo<CaipAccountId>();

    expect('string').type.toBeAssignableTo<CaipAccountAddress>();
    expect(`${embeddedString}`).type.toBeAssignableTo<CaipAccountAddress>();

    expect('string').type.toBeAssignableTo<CaipAssetNamespace>();
    expect(`${embeddedString}`).type.toBeAssignableTo<CaipAssetNamespace>();

    expect('string').type.toBeAssignableTo<CaipAssetReference>();
    expect(`${embeddedString}`).type.toBeAssignableTo<CaipAssetReference>();

    expect(
      'namespace:reference/assetNamespace:assetReference',
    ).type.toBeAssignableTo<CaipAssetType>();
    expect('namespace:reference/:').type.toBeAssignableTo<CaipAssetType>();
    expect(':reference/assetNamespace:').type.toBeAssignableTo<CaipAssetType>();
    expect(
      `${embeddedString}:${embeddedString}/${embeddedString}:${embeddedString}`,
    ).type.toBeAssignableTo<CaipAssetType>();

    expect(
      'namespace:reference/assetNamespace:assetReference/tokenId',
    ).type.toBeAssignableTo<CaipAssetId>();
    expect(
      'namespace:reference/:assetReference/',
    ).type.toBeAssignableTo<CaipAssetId>();
    expect(':reference/assetNamespace:/').type.toBeAssignableTo<CaipAssetId>();
    expect(
      `${embeddedString}:${embeddedString}/${embeddedString}:${embeddedString}/${embeddedString}`,
    ).type.toBeAssignableTo<CaipAssetId>();
  });

  test('reject invalid CAIP strings', () => {
    // Emoji are not excluded by the patterns, only checked at runtime.
    expect('namespace:😀').type.toBeAssignableTo<CaipChainId>();
    expect('😀:reference').type.toBeAssignableTo<CaipChainId>();
    expect(0).type.not.toBeAssignableTo<CaipChainId>();
    expect('🙃').type.not.toBeAssignableTo<CaipChainId>();

    expect(0).type.not.toBeAssignableTo<CaipNamespace>();

    expect(0).type.not.toBeAssignableTo<CaipReference>();

    expect('namespace:reference:😀').type.toBeAssignableTo<CaipAccountId>();
    expect(
      '😀:reference:accountAddress',
    ).type.toBeAssignableTo<CaipAccountId>();
    expect(0).type.not.toBeAssignableTo<CaipAccountId>();
    expect('🙃').type.not.toBeAssignableTo<CaipAccountId>();

    expect(0).type.not.toBeAssignableTo<CaipAccountAddress>();

    expect(0).type.not.toBeAssignableTo<CaipAssetNamespace>();

    expect(0).type.not.toBeAssignableTo<CaipAssetReference>();

    expect(0).type.not.toBeAssignableTo<CaipAssetType>();
    expect('🙃').type.not.toBeAssignableTo<CaipAssetType>();

    expect(0).type.not.toBeAssignableTo<CaipAssetId>();
    expect('🙃').type.not.toBeAssignableTo<CaipAssetId>();
  });
});
