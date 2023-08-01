import { expectAssignable, expectNotAssignable } from 'tsd';

import type {
  CaipAccountAddress,
  CaipAccountId,
  CaipChainId,
  CaipNamespace,
  CaipReference,
} from '.';

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
