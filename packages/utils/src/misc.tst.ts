import { describe, expect, test } from 'tstyche';

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
    expect({
      bar: 'bar',
    }).type.toBeAssignableTo<PublicInterface<ClassWithPrivateProperties>>();
  });

  test('still requires public properties', () => {
    expect(
      {},
    ).type.not.toBeAssignableTo<PublicInterface<ClassWithPrivateProperties>>();
  });
});

describe('isObject', () => {
  test('narrows an unknown value to a runtime object', () => {
    const unknownValue = {} as unknown;

    expect(unknownValue).type.not.toBeAssignableTo<RuntimeObject>();

    if (isObject(unknownValue)) {
      expect(unknownValue).type.toBeAssignableTo<RuntimeObject>();
    }
  });

  test('does not interfere with satisfaction of static type', () => {
    const constObjectType = { foo: 'foo' } as const;
    if (hasProperty(constObjectType, 'foo')) {
      expect(constObjectType).type.toBeAssignableTo<{ foo: 'foo' }>();
    }
  });
});

describe('hasProperty', () => {
  const unknownObject = {} as object;

  test('rejects objects that have not been proven to have the property', () => {
    // Establish that `Object` is not accepted when a specific property is needed.
    expect(unknownObject).type.not.toBeAssignableTo<Record<'foo', unknown>>();

    // Establish that `RuntimeObject` is not accepted when a specific property is needed.
    if (isObject(unknownObject)) {
      expect(unknownObject).type.not.toBeAssignableTo<Record<'foo', unknown>>();
    }
  });

  test('accepts an object once the property is proven', () => {
    if (isObject(unknownObject) && hasProperty(unknownObject, 'foo')) {
      expect(unknownObject).type.toBeAssignableTo<Record<'foo', unknown>>();
    }
  });

  test('accepts an object once all required properties are proven', () => {
    if (
      isObject(unknownObject) &&
      hasProperty(unknownObject, 'foo') &&
      hasProperty(unknownObject, 'bar')
    ) {
      expect(unknownObject).type.toBeAssignableTo<
        Record<'foo' | 'bar', unknown>
      >();
    }
  });

  test('rejects an object when only some required properties are proven', () => {
    if (isObject(unknownObject) && hasProperty(unknownObject, 'foo')) {
      expect(unknownObject).type.not.toBeAssignableTo<
        Record<'foo' | 'bar', unknown>
      >();
    }
  });

  test('does not interfere with satisfaction of non-overlapping types', () => {
    const overlappingTypesExample = { foo: 'foo', baz: 'baz' };
    if (hasProperty(overlappingTypesExample, 'foo')) {
      expect(overlappingTypesExample).type.toBeAssignableTo<
        Record<'baz', unknown>
      >();
    }
  });

  test('allows custom error properties once proven', () => {
    const exampleErrorWithCode = new Error('test');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    exampleErrorWithCode.code = 999;

    // Establish that trying to check for a custom property on an error results in failure
    expect(exampleErrorWithCode).type.not.toBeAssignableTo<{ code: any }>();

    if (hasProperty(exampleErrorWithCode, 'code')) {
      expect(exampleErrorWithCode.code).type.toBe<unknown>();
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
      expect(hasPropertyTypeExample.a).type.toBe<number | undefined>();
    }
  });
});

describe('getKnownPropertyNames', () => {
  enum GetKnownPropertyNamesEnumExample {
    Foo = 'bar',
    Baz = 'qux',
  }

  test('returns the known keys of an enum', () => {
    expect(getKnownPropertyNames(GetKnownPropertyNamesEnumExample)).type.toBe<
      ('Foo' | 'Baz')[]
    >();
  });
});

describe('RuntimeObject', () => {
  test('accepts valid runtime objects', () => {
    expect({}).type.toBeAssignableTo<RuntimeObject>();

    expect({ foo: 'foo' }).type.toBeAssignableTo<RuntimeObject>();

    expect({ 0: 'foo' }).type.toBeAssignableTo<RuntimeObject>();

    expect({ [Symbol('foo')]: 'foo' }).type.toBeAssignableTo<RuntimeObject>();
  });

  test('rejects invalid runtime objects', () => {
    expect(null).type.not.toBeAssignableTo<RuntimeObject>();

    expect(undefined).type.not.toBeAssignableTo<RuntimeObject>();

    expect('foo').type.not.toBeAssignableTo<RuntimeObject>();

    expect(0).type.not.toBeAssignableTo<RuntimeObject>();

    expect([]).type.not.toBeAssignableTo<RuntimeObject>();

    expect(new Date()).type.not.toBeAssignableTo<RuntimeObject>();

    expect(() => 0).type.not.toBeAssignableTo<RuntimeObject>();

    expect(new Set()).type.not.toBeAssignableTo<RuntimeObject>();

    expect(new Map()).type.not.toBeAssignableTo<RuntimeObject>();

    expect(Symbol('test')).type.not.toBeAssignableTo<RuntimeObject>();
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
    expect(
      runtimeObjectInterfaceExample,
    ).type.not.toBeAssignableTo<RuntimeObject>();

    class RuntimeObjectClassExample {
      a!: number;
    }
    const runtimeObjectClassExample = new RuntimeObjectClassExample();
    expect(
      runtimeObjectClassExample,
    ).type.not.toBeAssignableTo<RuntimeObject>();
  });
});
