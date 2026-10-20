/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { describe, expectTypeOf, test } from 'vitest';

import type { Json } from './json.js';

describe('Json', () => {
  test('accepts valid JSON', () => {
    expectTypeOf(null).toExtend<Json>();

    expectTypeOf(false).toExtend<Json>();

    expectTypeOf('').toExtend<Json>();

    expectTypeOf(0).toExtend<Json>();

    expectTypeOf([]).toExtend<Json>();

    expectTypeOf({}).toExtend<Json>();

    expectTypeOf([0]).toExtend<Json>();

    expectTypeOf({ a: 0 }).toExtend<Json>();

    expectTypeOf({
      deeply: [{ nested: 1 }, 'mixed', 'types', 0],
    }).toExtend<Json>();

    expectTypeOf([
      'array',
      { nested: { mixed: true, types: null } },
      0,
    ]).toExtend<Json>();

    type JsonCompatibleType = {
      c: number;
    };
    const jsonCompatibleType: JsonCompatibleType = { c: 0 };
    expectTypeOf(jsonCompatibleType).toExtend<Json>();
  });

  test('rejects invalid JSON', () => {
    expectTypeOf(undefined).not.toExtend<Json>();

    expectTypeOf(new Date()).not.toExtend<Json>();

    expectTypeOf(() => 0).not.toExtend<Json>();

    expectTypeOf(new Set()).not.toExtend<Json>();

    expectTypeOf(new Map()).not.toExtend<Json>();

    expectTypeOf(Symbol('test')).not.toExtend<Json>();

    expectTypeOf({ a: new Date() }).not.toExtend<Json>();

    expectTypeOf(5 as number | undefined).not.toExtend<Json>();
  });

  test('rejects interfaces and types with non-JSON members', () => {
    interface InterfaceWithOptionalProperty {
      a?: number;
    }
    const interfaceWithOptionalProperty: InterfaceWithOptionalProperty = {
      a: 0,
    };
    expectTypeOf(interfaceWithOptionalProperty).not.toExtend<Json>();

    interface InterfaceWithDate {
      a: Date;
    }
    const interfaceWithDate: InterfaceWithDate = { a: new Date() };
    expectTypeOf(interfaceWithDate).not.toExtend<Json>();

    interface InterfaceWithOptionalDate {
      a?: Date;
    }
    const interfaceWithOptionalDate: InterfaceWithOptionalDate = {
      a: new Date(),
    };
    expectTypeOf(interfaceWithOptionalDate).not.toExtend<Json>();

    interface InterfaceWithUndefinedTypeUnion {
      a: number | undefined;
    }
    const interfaceWithUndefinedTypeUnion: InterfaceWithUndefinedTypeUnion = {
      a: 0,
    };
    expectTypeOf(interfaceWithUndefinedTypeUnion).not.toExtend<Json>();

    interface InterfaceWithFunction {
      a: () => number;
    }
    const interfaceWithFunction: InterfaceWithFunction = { a: () => 0 };
    expectTypeOf(interfaceWithFunction).not.toExtend<Json>();

    type TypeWithDate = {
      a: Date;
    };
    const typeWithDate: TypeWithDate = { a: new Date() };
    expectTypeOf(typeWithDate).not.toExtend<Json>();

    type TypeWithOptionalDate = {
      a?: Date;
    };
    const typeWithOptionalDate: TypeWithOptionalDate = { a: new Date() };
    expectTypeOf(typeWithOptionalDate).not.toExtend<Json>();

    type TypeWithUndefinedTypeUnion = {
      a: number | undefined;
    };
    const typeWithUndefinedTypeUnion: TypeWithUndefinedTypeUnion = {
      a: 0,
    };
    expectTypeOf(typeWithUndefinedTypeUnion).not.toExtend<Json>();

    type TypeWithFunction = {
      a: () => number;
    };
    const typeWithFunction: TypeWithFunction = { a: () => 0 };
    expectTypeOf(typeWithFunction).not.toExtend<Json>();

    type TypeWithOptionalProperty = {
      a?: number | undefined;
    };
    const typeWithOptionalProperty: TypeWithOptionalProperty = { a: undefined };
    expectTypeOf(typeWithOptionalProperty).not.toExtend<Json>();
  });

  test('has known edge cases', () => {
    // The Json type doesn't protect against the `any` type. Passing `any`
    // explicitly is the point of the test, so it must not be removed.
    // oxlint-disable-next-line typescript/no-explicit-any
    expectTypeOf<any>().toExtend<Json>();

    // The Json type gets confused by interfaces. This interface is valid Json,
    // but it's incompatible with the Json type.
    // oxlint-disable-next-line id-length
    interface A {
      a: number;
    }
    const a: A = { a: 0 };
    expectTypeOf(a).not.toExtend<Json>();

    // The Json type gets confused by classes. This class instance is valid
    // Json, but it's incompatible with the Json type.
    class Foo {
      a!: number;
    }
    const foo = new Foo();
    expectTypeOf(foo).not.toExtend<Json>();
  });
});
