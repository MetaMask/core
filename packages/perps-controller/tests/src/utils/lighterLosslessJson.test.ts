import { parseLighterLosslessJson } from '../../../src/utils/lighterLosslessJson.js';

describe('parseLighterLosslessJson', () => {
  it('retains unquoted int64 identities and decodes ordinary JSON without a reviver', () => {
    expect(
      parseLighterLosslessJson(
        '{"id":288230376151711745,"small":42,"negative":-9007199254740993,"array":[true,null,"\\u0061\\\"b",1.25]}',
      ),
    ).toMatchObject({
      id: '288230376151711745',
      small: 42,
      negative: '-9007199254740993',
      array: [true, null, 'a"b', 1.25],
    });
  });

  it.each([
    '{"id":1,"id":2}',
    '{"id":01}',
    '[1,]',
    'true false',
    '"\\q"',
    '{"id":1e400}',
    '{',
    '"unterminated',
  ])('rejects ambiguous or malformed JSON %s', (raw) => {
    expect(() => parseLighterLosslessJson(raw)).toThrow(Error);
  });

  it('does not silently integerize fractional or exponent identity tokens', () => {
    expect(
      parseLighterLosslessJson('[1.00000000000000001,1e0,-0]'),
    ).toStrictEqual(['1.00000000000000001', '1e0', '-0']);
  });

  it('bounds length and recursion and treats prototype keys as plain data', () => {
    expect(() => parseLighterLosslessJson(' '.repeat(2_000_001))).toThrow(
      Error,
    );
    expect(() =>
      parseLighterLosslessJson(`${'['.repeat(34)}0${']'.repeat(34)}`),
    ).toThrow(Error);
    const parsed = parseLighterLosslessJson('{"__proto__":{"polluted":true}}');
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect({}).not.toHaveProperty('polluted');
  });
});
