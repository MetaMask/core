/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { expectAssignable, expectNotAssignable } from 'tsd';
import type { Json } from '.';

// Valid Json:

expectAssignable<Json>(null);

expectAssignable<Json>(false);

expectAssignable<Json>('');

expectAssignable<Json>(0);

expectAssignable<Json>([]);

expectAssignable<Json>({});

expectAssignable<Json>([0]);

expectAssignable<Json>({ a: 0 });

expectAssignable<Json>({ deeply: [{ nested: 1 }, 'mixed', 'types', 0] });

expectAssignable<Json>(['array', { nested: { mixed: true, types: null } }, 0]);

type JsonCompatibleType = {
  c: number;
};
const jsonCompatibleType: JsonCompatibleType = { c: 0 };
expectAssignable<Json>(jsonCompatibleType);

// Invalid Json:

expectNotAssignable<Json>(undefined);

expectNotAssignable<Json>(new Date());

expectNotAssignable<Json>(() => 0);

expectNotAssignable<Json>(new Set());

expectNotAssignable<Json>(new Map());

expectNotAssignable<Json>(Symbol('test'));

expectNotAssignable<Json>({ a: new Date() });

expectNotAssignable<Json>(5 as number | undefined);

interface InterfaceWithOptionalProperty {
  a?: number;
}
const interfaceWithOptionalProperty: InterfaceWithOptionalProperty = { a: 0 };
expectNotAssignable<Json>(interfaceWithOptionalProperty);

interface InterfaceWithDate {
  a: Date;
}
const interfaceWithDate: InterfaceWithDate = { a: new Date() };
expectNotAssignable<Json>(interfaceWithDate);

interface InterfaceWithOptionalDate {
  a?: Date;
}
const interfaceWithOptionalDate: InterfaceWithOptionalDate = { a: new Date() };
expectNotAssignable<Json>(interfaceWithOptionalDate);

interface InterfaceWithUndefinedTypeUnion {
  a: number | undefined;
}
const interfaceWithUndefinedTypeUnion: InterfaceWithUndefinedTypeUnion = {
  a: 0,
};
expectNotAssignable<Json>(interfaceWithUndefinedTypeUnion);

interface InterfaceWithFunction {
  a: () => number;
}
const interfaceWithFunction: InterfaceWithFunction = { a: () => 0 };
expectNotAssignable<Json>(interfaceWithFunction);

type TypeWithDate = {
  a: Date;
};
const typeWithDate: TypeWithDate = { a: new Date() };
expectNotAssignable<Json>(typeWithDate);

type TypeWithOptionalDate = {
  a?: Date;
};
const typeWithOptionalDate: TypeWithOptionalDate = { a: new Date() };
expectNotAssignable<Json>(typeWithOptionalDate);

type TypeWithUndefinedTypeUnion = {
  a: number | undefined;
};
const typeWithUndefinedTypeUnion: TypeWithUndefinedTypeUnion = {
  a: 0,
};
expectNotAssignable<Json>(typeWithUndefinedTypeUnion);

type TypeWithFunction = {
  a: () => number;
};
const typeWithFunction: TypeWithFunction = { a: () => 0 };
expectNotAssignable<Json>(typeWithFunction);

type TypeWithOptionalProperty = {
  a?: number | undefined;
};
const typeWithOptionalProperty: TypeWithOptionalProperty = { a: undefined };
expectNotAssignable<Json>(typeWithOptionalProperty);

// Edge cases:

// The Json type doesn't protect against the `any` type.
expectAssignable<Json>(null as any);

// The Json type gets confused by interfaces. This interface is valid Json,
// but it's incompatible with the Json type.
interface A {
  a: number;
}
const a: A = { a: 0 };
expectNotAssignable<Json>(a);

// The Json type gets confused by classes. This class instance is valid Json,
// but it's incompatible with the Json type.
class B {
  a!: number;
}
const b = new B();
expectNotAssignable<Json>(b);
