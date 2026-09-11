/* eslint-disable @typescript-eslint/consistent-type-definitions */

import type { Infer } from '@metamask/superstruct';
import { boolean, number, optional, string } from '@metamask/superstruct';
import { describe, expect, test } from 'tstyche';

import type { Json } from './index.js';
import { exactOptional, object } from './index.js';

describe('Json', () => {
  test('accepts valid JSON', () => {
    expect(null).type.toBeAssignableTo<Json>();

    expect(false).type.toBeAssignableTo<Json>();

    expect('').type.toBeAssignableTo<Json>();

    expect(0).type.toBeAssignableTo<Json>();

    expect([]).type.toBeAssignableTo<Json>();

    expect({}).type.toBeAssignableTo<Json>();

    expect([0]).type.toBeAssignableTo<Json>();

    expect({ a: 0 }).type.toBeAssignableTo<Json>();

    expect({
      deeply: [{ nested: 1 }, 'mixed', 'types', 0],
    }).type.toBeAssignableTo<Json>();

    expect([
      'array',
      { nested: { mixed: true, types: null } },
      0,
    ]).type.toBeAssignableTo<Json>();

    type JsonCompatibleType = {
      c: number;
    };
    const jsonCompatibleType: JsonCompatibleType = { c: 0 };
    expect(jsonCompatibleType).type.toBeAssignableTo<Json>();
  });

  test('rejects invalid JSON', () => {
    expect(undefined).type.not.toBeAssignableTo<Json>();

    expect(new Date()).type.not.toBeAssignableTo<Json>();

    expect(() => 0).type.not.toBeAssignableTo<Json>();

    expect(new Set()).type.not.toBeAssignableTo<Json>();

    expect(new Map()).type.not.toBeAssignableTo<Json>();

    expect(Symbol('test')).type.not.toBeAssignableTo<Json>();

    expect({ a: new Date() }).type.not.toBeAssignableTo<Json>();

    expect(5 as number | undefined).type.not.toBeAssignableTo<Json>();
  });

  test('rejects interfaces and types with non-JSON members', () => {
    interface InterfaceWithOptionalProperty {
      a?: number;
    }
    const interfaceWithOptionalProperty: InterfaceWithOptionalProperty = {
      a: 0,
    };
    expect(interfaceWithOptionalProperty).type.not.toBeAssignableTo<Json>();

    interface InterfaceWithDate {
      a: Date;
    }
    const interfaceWithDate: InterfaceWithDate = { a: new Date() };
    expect(interfaceWithDate).type.not.toBeAssignableTo<Json>();

    interface InterfaceWithOptionalDate {
      a?: Date;
    }
    const interfaceWithOptionalDate: InterfaceWithOptionalDate = {
      a: new Date(),
    };
    expect(interfaceWithOptionalDate).type.not.toBeAssignableTo<Json>();

    interface InterfaceWithUndefinedTypeUnion {
      a: number | undefined;
    }
    const interfaceWithUndefinedTypeUnion: InterfaceWithUndefinedTypeUnion = {
      a: 0,
    };
    expect(interfaceWithUndefinedTypeUnion).type.not.toBeAssignableTo<Json>();

    interface InterfaceWithFunction {
      a: () => number;
    }
    const interfaceWithFunction: InterfaceWithFunction = { a: () => 0 };
    expect(interfaceWithFunction).type.not.toBeAssignableTo<Json>();

    type TypeWithDate = {
      a: Date;
    };
    const typeWithDate: TypeWithDate = { a: new Date() };
    expect(typeWithDate).type.not.toBeAssignableTo<Json>();

    type TypeWithOptionalDate = {
      a?: Date;
    };
    const typeWithOptionalDate: TypeWithOptionalDate = { a: new Date() };
    expect(typeWithOptionalDate).type.not.toBeAssignableTo<Json>();

    type TypeWithUndefinedTypeUnion = {
      a: number | undefined;
    };
    const typeWithUndefinedTypeUnion: TypeWithUndefinedTypeUnion = {
      a: 0,
    };
    expect(typeWithUndefinedTypeUnion).type.not.toBeAssignableTo<Json>();

    type TypeWithFunction = {
      a: () => number;
    };
    const typeWithFunction: TypeWithFunction = { a: () => 0 };
    expect(typeWithFunction).type.not.toBeAssignableTo<Json>();

    type TypeWithOptionalProperty = {
      a?: number | undefined;
    };
    const typeWithOptionalProperty: TypeWithOptionalProperty = { a: undefined };
    expect(typeWithOptionalProperty).type.not.toBeAssignableTo<Json>();
  });

  test('has known edge cases', () => {
    // The Json type doesn't protect against the `any` type. Passing `any`
    // explicitly is the point of the test, so it must not be removed.
    expect<any>().type.toBeAssignableTo<Json>();

    // The Json type gets confused by interfaces. This interface is valid Json,
    // but it's incompatible with the Json type.
    interface A {
      a: number;
    }
    const a: A = { a: 0 };
    expect(a).type.not.toBeAssignableTo<Json>();

    // The Json type gets confused by classes. This class instance is valid
    // Json, but it's incompatible with the Json type.
    class Foo {
      a!: number;
    }
    const foo = new Foo();
    expect(foo).type.not.toBeAssignableTo<Json>();
  });
});

describe('exactOptional', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Type-level test fixture; consumed via `typeof`.
  const exactOptionalObject = object({
    a: number(),
    b: optional(string()),
    c: exactOptional(boolean()),
  });

  type ExactOptionalObject = Infer<typeof exactOptionalObject>;

  test('distinguishes optional from exactOptional members', () => {
    expect({ a: 0 }).type.toBeAssignableTo<ExactOptionalObject>();
    expect({ a: 0, b: 'test' }).type.toBeAssignableTo<ExactOptionalObject>();
    expect({
      a: 0,
      b: 'test',
      c: true,
    }).type.toBeAssignableTo<ExactOptionalObject>();
    expect({
      a: 0,
      b: 'test',
      c: 0,
    }).type.not.toBeAssignableTo<ExactOptionalObject>();
    expect({
      a: 0,
      b: 'test',
      c: undefined,
    }).type.not.toBeAssignableTo<ExactOptionalObject>();
  });
});
