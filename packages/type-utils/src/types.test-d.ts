import { describe, it, expectTypeOf } from 'vitest';

import { PublicInterface } from './types.js';

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

  it('does not require private properties', () => {
    expectTypeOf({
      bar: 'bar',
    }).toExtend<PublicInterface<ClassWithPrivateProperties>>();
  });

  it('still requires public properties', () => {
    expectTypeOf({}).not.toExtend<
      PublicInterface<ClassWithPrivateProperties>
    >();
  });
});
