import { expectAssignable, expectNotAssignable } from 'tsd';

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

// Valid caip strings:

expectAssignable<CaipChainId>('namespace:reference');
expectAssignable<CaipChainId>('namespace:');
expectAssignable<CaipChainId>(':reference');
expectAssignable<CaipChainId>(`${embeddedString}:${embeddedString}`);

expectAssignable<CaipNamespace>('string');
expectAssignable<CaipNamespace>(`${embeddedString}`);

expectAssignable<CaipReference>('string');
expectAssignable<CaipReference>(`${embeddedString}`);

expectAssignable<CaipAccountId>('namespace:reference:accountAddress');
expectAssignable<CaipAccountId>('namespace:reference:');
expectAssignable<CaipAccountId>(':reference:accountAddress');
expectAssignable<CaipAccountId>(
  `${embeddedString}:${embeddedString}:${embeddedString}`,
);

expectAssignable<CaipAccountAddress>('string');
expectAssignable<CaipAccountAddress>(`${embeddedString}`);

expectAssignable<CaipAssetNamespace>('string');
expectAssignable<CaipAssetNamespace>(`${embeddedString}`);

expectAssignable<CaipAssetReference>('string');
expectAssignable<CaipAssetReference>(`${embeddedString}`);

expectAssignable<CaipAssetType>(
  'namespace:reference/assetNamespace:assetReference',
);
expectAssignable<CaipAssetType>('namespace:reference/:');
expectAssignable<CaipAssetType>(':reference/assetNamespace:');
expectAssignable<CaipAssetType>(
  `${embeddedString}:${embeddedString}/${embeddedString}:${embeddedString}`,
);

expectAssignable<CaipAssetId>(
  'namespace:reference/assetNamespace:assetReference/tokenId',
);
expectAssignable<CaipAssetId>('namespace:reference/:assetReference/');
expectAssignable<CaipAssetId>(':reference/assetNamespace:/');
expectAssignable<CaipAssetId>(
  `${embeddedString}:${embeddedString}/${embeddedString}:${embeddedString}/${embeddedString}`,
);

// Not valid caip strings:

expectAssignable<CaipChainId>('namespace:😀');
expectAssignable<CaipChainId>('😀:reference');
expectNotAssignable<CaipChainId>(0);
expectNotAssignable<CaipChainId>('🙃');

expectNotAssignable<CaipNamespace>(0);

expectNotAssignable<CaipReference>(0);

expectAssignable<CaipAccountId>('namespace:reference:😀');
expectAssignable<CaipAccountId>('😀:reference:accountAddress');
expectNotAssignable<CaipAccountId>(0);
expectNotAssignable<CaipAccountId>('🙃');

expectNotAssignable<CaipAccountAddress>(0);

expectNotAssignable<CaipAssetNamespace>(0);

expectNotAssignable<CaipAssetReference>(0);

expectNotAssignable<CaipAssetType>(0);
expectNotAssignable<CaipAssetType>('🙃');

expectNotAssignable<CaipAssetId>(0);
expectNotAssignable<CaipAssetId>('🙃');
