import { deepFreeze } from './utils.js';

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
