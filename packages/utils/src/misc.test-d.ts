import { describe, expectTypeOf, test } from 'vitest';

import type { PublicInterface, RuntimeObject } from './misc.js';
import { isObject, hasProperty, getKnownPropertyNames } from './misc.js';

describe('PublicInterface', () => {
  class ClassWithPrivateProperties {
    // eslint-disable-next-line no-unused-private-class-members -- Type-level test fixture; never read at runtime.
    readonly #foo: string;

    bar: string;

    constructor({ foo, bar }: { foo: string; bar: string }) {
      this.#foo = foo;
      this.bar = bar;
    }
  }

  test('does not require private properties', () => {
    expectTypeOf({
      bar: 'bar',
    }).toExtend<PublicInterface<ClassWithPrivateProperties>>();
  });

  test('still requires public properties', () => {
    expectTypeOf({}).not.toExtend<
      PublicInterface<ClassWithPrivateProperties>
    >();
  });
});

describe('isObject', () => {
  test('narrows an unknown value to a runtime object', () => {
    const unknownValue = {} as unknown;

    expectTypeOf(unknownValue).not.toExtend<RuntimeObject>();

    if (isObject(unknownValue)) {
      expectTypeOf(unknownValue).toExtend<RuntimeObject>();
    }
  });

  test('does not interfere with satisfaction of static type', () => {
    const constObjectType = { foo: 'foo' } as const;
    if (hasProperty(constObjectType, 'foo')) {
      expectTypeOf(constObjectType).toExtend<{ foo: 'foo' }>();
    }
  });
});

describe('hasProperty', () => {
  const unknownObject = {} as object;

  test('rejects objects that have not been proven to have the property', () => {
    // Establish that `Object` is not accepted when a specific property is needed.
    expectTypeOf(unknownObject).not.toExtend<Record<'foo', unknown>>();

    // Establish that `RuntimeObject` is not accepted when a specific property is needed.
    if (isObject(unknownObject)) {
      expectTypeOf(unknownObject).not.toExtend<Record<'foo', unknown>>();
    }
  });

  test('accepts an object once the property is proven', () => {
    if (isObject(unknownObject) && hasProperty(unknownObject, 'foo')) {
      expectTypeOf(unknownObject).toExtend<Record<'foo', unknown>>();
    }
  });

  test('accepts an object once all required properties are proven', () => {
    if (
      isObject(unknownObject) &&
      hasProperty(unknownObject, 'foo') &&
      hasProperty(unknownObject, 'bar')
    ) {
      expectTypeOf(unknownObject).toExtend<Record<'foo' | 'bar', unknown>>();
    }
  });

  test('rejects an object when only some required properties are proven', () => {
    if (isObject(unknownObject) && hasProperty(unknownObject, 'foo')) {
      expectTypeOf(unknownObject).not.toExtend<
        Record<'foo' | 'bar', unknown>
      >();
    }
  });

  test('does not interfere with satisfaction of non-overlapping types', () => {
    const overlappingTypesExample = { foo: 'foo', baz: 'baz' };
    if (hasProperty(overlappingTypesExample, 'foo')) {
      expectTypeOf(overlappingTypesExample).toExtend<Record<'baz', unknown>>();
    }
  });

  test('allows custom error properties once proven', () => {
    const exampleErrorWithCode = new Error('test');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    exampleErrorWithCode.code = 999;

    // Establish that trying to check for a custom property on an error results in failure
    expectTypeOf(exampleErrorWithCode).not.toExtend<{ code: any }>();

    if (hasProperty(exampleErrorWithCode, 'code')) {
      expectTypeOf(exampleErrorWithCode.code).toEqualTypeOf<unknown>();
    }
  });

  test('is compatible with interfaces and classes', () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface HasPropertyInterfaceExample {
      a: number;
    }
    const hasPropertyInterfaceExample: HasPropertyInterfaceExample = { a: 0 };
    hasProperty(hasPropertyInterfaceExample, 'a');

    class HasPropertyClassExample {
      a!: number;
    }
    const hasPropertyClassExample = new HasPropertyClassExample();
    hasProperty(hasPropertyClassExample, 'a');
  });

  test('keeps the original type when defined', () => {
    type HasPropertyTypeExample = {
      a?: number;
    };

    const hasPropertyTypeExample: HasPropertyTypeExample = {};
    if (hasProperty(hasPropertyTypeExample, 'a')) {
      expectTypeOf(hasPropertyTypeExample.a).toEqualTypeOf<
        number | undefined
      >();
    }
  });
});

describe('getKnownPropertyNames', () => {
  enum GetKnownPropertyNamesEnumExample {
    Foo = 'bar',
    Baz = 'qux',
  }

  test('returns the known keys of an enum', () => {
    expectTypeOf(
      getKnownPropertyNames(GetKnownPropertyNamesEnumExample),
    ).toEqualTypeOf<('Foo' | 'Baz')[]>();
  });
});

describe('RuntimeObject', () => {
  test('accepts valid runtime objects', () => {
    expectTypeOf({}).toExtend<RuntimeObject>();

    expectTypeOf({ foo: 'foo' }).toExtend<RuntimeObject>();

    expectTypeOf({ 0: 'foo' }).toExtend<RuntimeObject>();

    expectTypeOf({ [Symbol('foo')]: 'foo' }).toExtend<RuntimeObject>();
  });

  test('rejects invalid runtime objects', () => {
    expectTypeOf(null).not.toExtend<RuntimeObject>();

    expectTypeOf(undefined).not.toExtend<RuntimeObject>();

    expectTypeOf('foo').not.toExtend<RuntimeObject>();

    expectTypeOf(0).not.toExtend<RuntimeObject>();

    expectTypeOf([]).not.toExtend<RuntimeObject>();

    expectTypeOf(new Date()).not.toExtend<RuntimeObject>();

    expectTypeOf(() => 0).not.toExtend<RuntimeObject>();

    expectTypeOf(new Set()).not.toExtend<RuntimeObject>();

    expectTypeOf(new Map()).not.toExtend<RuntimeObject>();

    expectTypeOf(Symbol('test')).not.toExtend<RuntimeObject>();
  });

  test('gets confused by interfaces and classes', () => {
    // The RuntimeObject type gets confused by interfaces. This interface is a
    // valid object, but it's incompatible with the RuntimeObject type.
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface RuntimeObjectInterfaceExample {
      a: number;
    }
    const runtimeObjectInterfaceExample: RuntimeObjectInterfaceExample = {
      a: 0,
    };
    expectTypeOf(runtimeObjectInterfaceExample).not.toExtend<RuntimeObject>();

    class RuntimeObjectClassExample {
      a!: number;
    }
    const runtimeObjectClassExample = new RuntimeObjectClassExample();
    expectTypeOf(runtimeObjectClassExample).not.toExtend<RuntimeObject>();
  });
});
