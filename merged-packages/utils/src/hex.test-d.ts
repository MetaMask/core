import { expectAssignable, expectNotAssignable } from 'tsd';

import { Hex } from '.';

// Valid hex strings:

expectAssignable<Hex>('0x');

expectAssignable<Hex>('0x0');

expectAssignable<Hex>('0x😀');

const embeddedString = 'test';
expectAssignable<Hex>(`0x${embeddedString}`);

// Not valid hex strings:

expectNotAssignable<Hex>(`0X${embeddedString}`);

expectNotAssignable<Hex>(`1x${embeddedString}`);

expectNotAssignable<Hex>(0);

expectNotAssignable<Hex>('0');

expectNotAssignable<Hex>('🙃');
