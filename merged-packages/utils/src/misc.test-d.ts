import { expectAssignable, expectNotAssignable, expectType } from 'tsd';

import { isObject, hasProperty, RuntimeObject } from './misc';

//=============================================================================
// isObject
//=============================================================================

// eslint-disable-next-line @typescript-eslint/ban-types
const unknownValue = {} as unknown;

expectNotAssignable<RuntimeObject>(unknownValue);

if (isObject(unknownValue)) {
  expectAssignable<RuntimeObject>(unknownValue);
}

// Does not interfere with satisfaction of static type
const constObjectType = { foo: 'foo' } as const;
if (hasProperty(constObjectType, 'foo')) {
  expectAssignable<{ foo: 'foo' }>(constObjectType);
}

//=============================================================================
// hasProperty
//=============================================================================

// eslint-disable-next-line @typescript-eslint/ban-types
const unknownObject = {} as Object;

// Establish that `Object` is not accepted when a specific property is needed.
expectNotAssignable<Record<'foo', unknown>>(unknownObject);

// Establish that `RuntimeObject` is not accepted when a specific property is needed.
if (isObject(unknownObject)) {
  expectNotAssignable<Record<'foo', unknown>>(unknownObject);
}

// An object is accepted after `hasProperty` is used to prove that it has the required property.
if (isObject(unknownObject) && hasProperty(unknownObject, 'foo')) {
  expectAssignable<Record<'foo', unknown>>(unknownObject);
}

// An object is accepted after `hasProperty` is used to prove that it has all required properties.
if (
  isObject(unknownObject) &&
  hasProperty(unknownObject, 'foo') &&
  hasProperty(unknownObject, 'bar')
) {
  expectAssignable<Record<'foo' | 'bar', unknown>>(unknownObject);
}

// An object is not accepted after `hasProperty` has only been used to establish that some required properties exist.
if (isObject(unknownObject) && hasProperty(unknownObject, 'foo')) {
  expectNotAssignable<Record<'foo' | 'bar', unknown>>(unknownObject);
}

// Does not interfere with satisfaction of non-overlapping types
const overlappingTypesExample = { foo: 'foo', baz: 'baz' };
if (hasProperty(overlappingTypesExample, 'foo')) {
  expectAssignable<Record<'baz', unknown>>(overlappingTypesExample);
}

const exampleErrorWithCode = new Error('test');
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
exampleErrorWithCode.code = 999;

// Establish that trying to check for a custom property on an error results in failure
expectNotAssignable<{ code: any }>(exampleErrorWithCode);

// Using custom Error property is allowed after checking with `hasProperty`
if (hasProperty(exampleErrorWithCode, 'code')) {
  expectType<unknown>(exampleErrorWithCode.code);
}

// `hasProperty` is compatible with interfaces
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface HasPropertyInterfaceExample {
  a: number;
}
const hasPropertyInterfaceExample: HasPropertyInterfaceExample = { a: 0 };
hasProperty(hasPropertyInterfaceExample, 'a');

// `hasProperty` is compatible with classes
class HasPropertyClassExample {
  a!: number;
}
const hasPropertyClassExample = new HasPropertyClassExample();
hasProperty(hasPropertyClassExample, 'a');

type HasPropertyTypeExample = {
  a?: number;
};

// It keeps the original type when defined.
const hasPropertyTypeExample: HasPropertyTypeExample = {};
if (hasProperty(hasPropertyTypeExample, 'a')) {
  expectType<number | undefined>(hasPropertyTypeExample.a);
}

//=============================================================================
// RuntimeObject
//=============================================================================

// Valid runtime objects:

expectAssignable<RuntimeObject>({});

expectAssignable<RuntimeObject>({ foo: 'foo' });

// eslint-disable-next-line @typescript-eslint/naming-convention
expectAssignable<RuntimeObject>({ 0: 'foo' });

expectAssignable<RuntimeObject>({ [Symbol('foo')]: 'foo' });

// Invalid runtime objects:

expectNotAssignable<RuntimeObject>(null);

expectNotAssignable<RuntimeObject>(undefined);

expectNotAssignable<RuntimeObject>('foo');

expectNotAssignable<RuntimeObject>(0);

expectNotAssignable<RuntimeObject>([]);

expectNotAssignable<RuntimeObject>(new Date());

expectNotAssignable<RuntimeObject>(() => 0);

expectNotAssignable<RuntimeObject>(new Set());

expectNotAssignable<RuntimeObject>(new Map());

expectNotAssignable<RuntimeObject>(Symbol('test'));

// The RuntimeObject type gets confused by interfaces. This interface is a valid object,
// but it's incompatible with the RuntimeObject type.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface RuntimeObjectInterfaceExample {
  a: number;
}
const runtimeObjectInterfaceExample: RuntimeObjectInterfaceExample = { a: 0 };
expectNotAssignable<RuntimeObject>(runtimeObjectInterfaceExample);

class RuntimeObjectClassExample {
  a!: number;
}
const runtimeObjectClassExample = new RuntimeObjectClassExample();
expectNotAssignable<RuntimeObject>(runtimeObjectClassExample);
