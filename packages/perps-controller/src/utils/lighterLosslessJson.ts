const MAX_JSON_LENGTH = 2_000_000;
const MAX_JSON_DEPTH = 32;

/**
 * Decode venue JSON without rounding integer identity tokens. Unsafe integers
 * remain decimal strings. Uses only ordinary string parsing available on Hermes;
 * no JSON reviver source extension, BigInt serialization or payload rewriting.
 * Duplicate keys are refused instead of choosing one financial identity.
 *
 * @param raw - Untrusted JSON response or signed transaction.
 * @returns Parsed JSON with exact integer identities.
 */
export function parseLighterLosslessJson(raw: string): unknown {
  if (typeof raw !== 'string' || raw.length > MAX_JSON_LENGTH) {
    throw new Error('Invalid Lighter JSON length');
  }
  let offset = 0;
  const fail = (): never => {
    throw new Error('Invalid Lighter JSON');
  };
  const whitespace = (): void => {
    while (/[\t\n\r ]/u.test(raw[offset] ?? 'x')) {
      offset += 1;
    }
  };
  const readString = (): string => {
    if (raw[offset] !== '"') {
      return fail();
    }
    const start = offset;
    offset += 1;
    while (offset < raw.length) {
      const character = raw[offset];
      offset += 1;
      if (character === '\\') {
        offset += 1;
      } else if (character === '"') {
        try {
          const value: unknown = JSON.parse(raw.slice(start, offset));
          return typeof value === 'string' ? value : fail();
        } catch {
          return fail();
        }
      }
    }
    return fail();
  };
  const value = (depth: number): unknown => {
    if (depth > MAX_JSON_DEPTH) {
      return fail();
    }
    whitespace();
    const character = raw[offset];
    if (character === '"') {
      return readString();
    }
    if (character === '{' || character === '[') {
      const object = character === '{';
      const closing = object ? '}' : ']';
      const entries = Object.create(null) as Record<string, unknown>;
      const items: unknown[] = [];
      offset += 1;
      whitespace();
      if (raw[offset] === closing) {
        offset += 1;
        return object ? entries : items;
      }
      while (offset < raw.length) {
        whitespace();
        if (object) {
          const key = readString();
          if (Object.prototype.hasOwnProperty.call(entries, key)) {
            return fail();
          }
          whitespace();
          if (raw[offset] !== ':') {
            return fail();
          }
          offset += 1;
          entries[key] = value(depth + 1);
        } else {
          items.push(value(depth + 1));
        }
        whitespace();
        const separator = raw[offset];
        offset += 1;
        if (separator === closing) {
          return object ? entries : items;
        }
        if (separator !== ',') {
          return fail();
        }
      }
      return fail();
    }
    for (const [literal, parsed] of [
      ['null', null],
      ['true', true],
      ['false', false],
    ] as const) {
      if (raw.startsWith(literal, offset)) {
        offset += literal.length;
        return parsed;
      }
    }
    const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(
      raw.slice(offset),
    )?.[0];
    if (token === undefined) {
      return fail();
    }
    offset += token.length;
    const numeric = Number(token);
    if (/^-?\d+$/u.test(token) && !Number.isSafeInteger(numeric)) {
      return token;
    }
    if (
      !Number.isFinite(numeric) ||
      Math.abs(numeric) > Number.MAX_SAFE_INTEGER
    ) {
      return fail();
    }
    // An integer-looking number can hide a rounded fraction or exponent.
    // Identity consumers accept only canonical integer tokens.
    if (
      Number.isInteger(numeric) &&
      !/^(?:0|[1-9]\d*|-[1-9]\d*)$/u.test(token)
    ) {
      return token;
    }
    return numeric;
  };
  const result = value(0);
  whitespace();
  if (offset !== raw.length) {
    return fail();
  }
  return result;
}
