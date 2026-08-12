import { object, sensitive, string, StructError } from '@metamask/superstruct';

import { deepFreeze, formatValidationErrorMessages } from './utils.js';

describe('deepFreeze', () => {
  it('returns primitives unchanged', () => {
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze('hello')).toBe('hello');
    expect(deepFreeze(true)).toBe(true);
  });

  it('returns null unchanged', () => {
    expect(deepFreeze(null)).toBeNull();
  });

  it('freezes a flat object', () => {
    const obj = { a: 1, b: 2 };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
  });

  it('freezes nested objects', () => {
    const obj = { a: { b: { c: 3 } } };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.a)).toBe(true);
    expect(Object.isFrozen(obj.a.b)).toBe(true);
  });

  it('freezes arrays', () => {
    const arr = [1, 2, 3];
    deepFreeze(arr);
    expect(Object.isFrozen(arr)).toBe(true);
  });

  it('freezes objects nested inside arrays', () => {
    const arr = [{ x: 1 }, { x: 2 }];
    deepFreeze(arr);
    expect(Object.isFrozen(arr[0])).toBe(true);
    expect(Object.isFrozen(arr[1])).toBe(true);
  });

  it('returns the same reference', () => {
    const obj = { a: 1 };
    expect(deepFreeze(obj)).toBe(obj);
  });

  it('prevents mutation of frozen objects in strict mode', () => {
    const obj = deepFreeze({ a: { b: 1 } });
    expect(() => {
      (obj.a as { b: number }).b = 99;
    }).toThrow(TypeError);
  });
});

describe('formatValidationErrorMessages', () => {
  function makeStructError(value: unknown): StructError {
    const schema = object({ name: string() });
    let caught: StructError | undefined;
    try {
      schema.assert(value);
    } catch (error) {
      if (error instanceof StructError) {
        caught = error;
      }
    }
    if (!caught) {
      throw new Error('Expected a StructError');
    }
    return caught;
  }

  it('formats a single root-level failure', () => {
    const error = makeStructError(null);
    const result = formatValidationErrorMessages(error);
    expect(result).toContain('<root>');
    expect(result).toContain('expected:');
  });

  it('formats a nested field failure with a dotted path', () => {
    const error = makeStructError({ name: 42 });
    const result = formatValidationErrorMessages(error);
    expect(result).toContain('[name]');
    expect(result).toContain('expected: string');
  });

  it('joins multiple failures with a comma', () => {
    const schema = object({ a: string(), b: string() });
    let caught: StructError | undefined;
    try {
      schema.assert({ a: 1, b: 2 });
    } catch (error) {
      if (error instanceof StructError) {
        caught = error;
      }
    }
    expect(caught).toBeDefined();
    const result = formatValidationErrorMessages(caught as StructError);
    expect(result.split(', ').length).toBeGreaterThan(1);
  });

  it('uses type/refinement and never failure.message', () => {
    // sensitive() redacts the value to *** in failure.message — if
    // formatValidationErrorMessages were to use message instead of type, *** would
    // appear in the output. Asserting it does not pins the mechanism.
    const schema = object({ secret: sensitive(string()) });
    const error = makeStructError({ secret: 12345 });
    const result = formatValidationErrorMessages(error);
    expect(result).toContain('expected: string');
    expect(result).not.toContain('***');
  });

  it('sensitive() redacts the actual value in failure.message', () => {
    // This pins the superstruct behaviour we rely on: sensitive() must produce
    // *** in failure.message so that any code path using message is also safe.
    const schema = object({ secret: sensitive(string()) });
    let caught: StructError | undefined;
    try {
      schema.assert({ secret: 12345 });
    } catch (error) {
      if (error instanceof StructError) {
        caught = error;
      }
    }
    expect(caught).toBeDefined();
    const failure = caught!.failures()[0];
    expect(failure?.message).toContain('***');
    expect(failure?.message).not.toContain('12345');
  });
});
