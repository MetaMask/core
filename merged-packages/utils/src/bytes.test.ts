import {
  assertIsBytes,
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  bytesToNumber,
  bytesToSignedBigInt,
  bytesToString,
  concatBytes,
  hexToBytes,
  isBytes,
  numberToBytes,
  signedBigIntToBytes,
  stringToBytes,
  valueToBytes,
} from './bytes';
import {
  BYTES_FIXTURES,
  INVALID_BYTES_FIXTURES,
  LARGE_BYTES_FIXTURES,
  TWOS_COMPLEMENT_BYTES_FIXTURES,
  UPPER_CASE_HEX_FIXTURES,
  UTF_8_BYTES_FIXTURES,
} from './__fixtures__/bytes';

describe('isBytes', () => {
  it('returns true for a Node.js Buffer', () => {
    expect(isBytes(Buffer.from('foo'))).toBe(true);
  });

  it('returns true for a Uint8Array', () => {
    expect(isBytes(new Uint8Array())).toBe(true);
  });

  it.each(INVALID_BYTES_FIXTURES)('returns false for other values', (value) => {
    expect(isBytes(value)).toBe(false);
  });
});

describe('assertIsBytes', () => {
  it('does not throw for a Node.js Buffer', () => {
    expect(() => assertIsBytes(Buffer.from('foo'))).not.toThrow();
  });

  it('does not throw for a Uint8Array', () => {
    expect(() => assertIsBytes(new Uint8Array())).not.toThrow();
  });

  it.each(INVALID_BYTES_FIXTURES)('throws for other values', (value) => {
    expect(() => assertIsBytes(value)).toThrow('Value must be a Uint8Array.');
  });
});

describe('bytesToHex', () => {
  it.each(BYTES_FIXTURES)(
    'returns a hex string from a byte array',
    ({ bytes, hex }) => {
      expect(bytesToHex(bytes)).toBe(hex);
    },
  );

  it.each(LARGE_BYTES_FIXTURES)(
    'returns a hex string from a large byte array',
    ({ bytes, hex }) => {
      expect(bytesToHex(bytes)).toBe(hex);
    },
  );

  it('adds a 0x-prefix to the string', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 2])).startsWith('0x')).toBe(true);
  });

  it('returns 0x for an empty byte array', () => {
    expect(bytesToHex(new Uint8Array())).toBe('0x');
  });

  it.each(INVALID_BYTES_FIXTURES)(
    'throws an error for invalid byte arrays',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => bytesToHex(value)).toThrow('Value must be a Uint8Array.');
    },
  );
});

describe('bytesToBigInt', () => {
  it.each(BYTES_FIXTURES)(
    'returns a bigint from a byte array',
    ({ bytes, bigint }) => {
      expect(bytesToBigInt(bytes)).toBe(bigint);
    },
  );

  it.each(LARGE_BYTES_FIXTURES)(
    'returns a hex string from a large byte array',
    ({ bytes, bigint }) => {
      expect(bytesToBigInt(bytes)).toBe(bigint);
    },
  );

  it.each(INVALID_BYTES_FIXTURES)(
    'throws an error for invalid byte arrays',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => bytesToBigInt(value)).toThrow('Value must be a Uint8Array.');
    },
  );
});

describe('bytesToSignedBigInt', () => {
  it.each(TWOS_COMPLEMENT_BYTES_FIXTURES)(
    'returns a signed bigint from a byte array',
    ({ bytes, bigint }) => {
      expect(bytesToSignedBigInt(bytes)).toBe(bigint);
    },
  );

  it.each(INVALID_BYTES_FIXTURES)(
    'throws an error for invalid byte arrays',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => bytesToSignedBigInt(value)).toThrow(
        'Value must be a Uint8Array.',
      );
    },
  );
});

describe('bytesToNumber', () => {
  it.each(BYTES_FIXTURES)(
    'returns a number from a byte array',
    ({ bytes, number }) => {
      expect(bytesToNumber(bytes)).toBe(number);
    },
  );

  it.each(LARGE_BYTES_FIXTURES)(
    'throws an error when the resulting number is not a safe integer',
    ({ bytes }) => {
      expect(() => bytesToNumber(bytes)).toThrow(
        'Number is not a safe integer. Use `bytesToBigInt` instead.',
      );
    },
  );

  it.each(INVALID_BYTES_FIXTURES)(
    'throws an error for invalid byte arrays',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => bytesToNumber(value)).toThrow('Value must be a Uint8Array.');
    },
  );
});

describe('bytesToString', () => {
  it.each(UTF_8_BYTES_FIXTURES)(
    'returns a string from a byte array',
    ({ bytes, string }) => {
      expect(bytesToString(bytes)).toBe(string);
    },
  );

  it.each(INVALID_BYTES_FIXTURES)(
    'throws an error for invalid byte arrays',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => bytesToString(value)).toThrow('Value must be a Uint8Array.');
    },
  );
});

describe('hexToBytes', () => {
  it.each(BYTES_FIXTURES)(
    'returns a byte array from a hex string',
    ({ bytes, hex }) => {
      expect(hexToBytes(hex)).toStrictEqual(bytes);
    },
  );

  it.each(LARGE_BYTES_FIXTURES)(
    'returns a byte array from a large hex string',
    ({ bytes, hex }) => {
      expect(hexToBytes(hex)).toStrictEqual(bytes);
    },
  );

  it.each(UPPER_CASE_HEX_FIXTURES)(
    'returns a byte array from an upper case hex string',
    ({ bytes, hex }) => {
      expect(hexToBytes(hex)).toStrictEqual(bytes);
    },
  );

  it('supports a string with an odd length', () => {
    expect(hexToBytes('abc')).toStrictEqual(new Uint8Array([10, 188]));
  });

  it('returns an empty byte array for 0x', () => {
    expect(hexToBytes('0x')).toStrictEqual(new Uint8Array());
  });

  it.each([true, false, null, undefined, 0, 1, '', [], {}])(
    'throws an error for invalid hex strings',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => hexToBytes(value)).toThrow(
        'Value must be a hexadecimal string.',
      );
    },
  );
});

describe('bigIntToBytes', () => {
  it.each(BYTES_FIXTURES)(
    'returns a byte array from a bigint',
    ({ bytes, bigint }) => {
      expect(bigIntToBytes(bigint)).toStrictEqual(bytes);
    },
  );

  it.each(LARGE_BYTES_FIXTURES)(
    'returns a byte array from a large bigint',
    ({ bytes, bigint }) => {
      expect(bigIntToBytes(bigint)).toStrictEqual(bytes);
    },
  );

  it.each([true, false, null, undefined, 0, 1, '', '0x', [], {}])(
    'throws an error for invalid bigints',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => bigIntToBytes(value)).toThrow('Value must be a bigint.');
    },
  );

  it('throws for negative bigints', () => {
    expect(() => bigIntToBytes(BigInt(-1))).toThrow(
      'Value must be a non-negative bigint.',
    );
  });
});

describe('signedBigIntToBytes', () => {
  it.each(TWOS_COMPLEMENT_BYTES_FIXTURES)(
    'returns a byte array from a signed bigint',
    ({ bytes, bigint, length }) => {
      expect(signedBigIntToBytes(bigint, length)).toStrictEqual(bytes);
    },
  );

  it.each([true, false, null, undefined, 0, 1, '', '0x', [], {}])(
    'throws an error for invalid bigints',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => signedBigIntToBytes(value, 1)).toThrow(
        'Value must be a bigint.',
      );
    },
  );

  it.each([true, false, null, undefined, '', '0x', [], {}])(
    'throws an error for invalid lengths',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => signedBigIntToBytes(BigInt(1), value)).toThrow(
        'Byte length must be a number.',
      );
    },
  );

  it('throws for byte lengths that are less than 1', () => {
    expect(() => signedBigIntToBytes(BigInt(1), 0)).toThrow(
      'Byte length must be greater than 0.',
    );
  });

  it.each([
    {
      bigint: BigInt(128),
      length: 1,
    },
    {
      bigint: BigInt(65536),
      length: 2,
    },
    {
      bigint: BigInt(2147483648),
      length: 4,
    },
    {
      bigint: BigInt(-129),
      length: 1,
    },
    {
      bigint: BigInt(-65537),
      length: 2,
    },
    {
      bigint: BigInt(-2147483649),
      length: 4,
    },
  ])('throws if the byte length is too small', ({ bigint, length }) => {
    expect(() => signedBigIntToBytes(bigint, length)).toThrow(
      'Byte length is too small to represent the given value.',
    );
  });
});

describe('numberToBytes', () => {
  it.each(BYTES_FIXTURES)(
    'returns a byte array from a number',
    ({ bytes, number }) => {
      expect(numberToBytes(number)).toStrictEqual(bytes);
    },
  );

  it.each(LARGE_BYTES_FIXTURES)(
    'throws an error when the number is not a safe integer',
    ({ bigint }) => {
      expect(() => numberToBytes(Number(bigint))).toThrow(
        'Value is not a safe integer. Use `bigIntToBytes` instead.',
      );
    },
  );

  it.each([
    true,
    false,
    null,
    undefined,
    BigInt(0),
    BigInt(1),
    '',
    '0x',
    [],
    {},
  ])('throws an error for invalid numbers', (value) => {
    // @ts-expect-error Invalid type.
    expect(() => numberToBytes(value)).toThrow('Value must be a number.');
  });

  it('throws for negative numbers', () => {
    expect(() => numberToBytes(-1)).toThrow(
      'Value must be a non-negative number.',
    );
  });
});

describe('stringToBytes', () => {
  it.each(UTF_8_BYTES_FIXTURES)(
    'returns a byte array from a string',
    ({ bytes, string }) => {
      expect(stringToBytes(string)).toStrictEqual(bytes);
    },
  );

  it.each([true, false, null, undefined, 0, 1, [], {}])(
    'throws an error for invalid strings',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => stringToBytes(value)).toThrow('Value must be a string.');
    },
  );
});

describe('valueToBytes', () => {
  it.each(BYTES_FIXTURES)(
    'returns a byte array from a value',
    ({ bigint, number, hex, bytes }) => {
      expect(valueToBytes(bigint)).toStrictEqual(bytes);
      expect(valueToBytes(number)).toStrictEqual(bytes);
      expect(valueToBytes(hex)).toStrictEqual(bytes);
      expect(valueToBytes(bytes)).toBe(bytes);
    },
  );

  it.each(LARGE_BYTES_FIXTURES)(
    'returns a byte array from a large value',
    ({ bigint, hex, bytes }) => {
      expect(valueToBytes(bigint)).toStrictEqual(bytes);
      expect(valueToBytes(hex)).toStrictEqual(bytes);
      expect(valueToBytes(bytes)).toBe(bytes);
    },
  );

  it.each(UTF_8_BYTES_FIXTURES)(
    'returns a byte array from a string',
    ({ bytes, string }) => {
      expect(valueToBytes(string)).toStrictEqual(bytes);
    },
  );

  it.each(INVALID_BYTES_FIXTURES)(
    'throws an error when the value cannot be converted to bytes',
    (value) => {
      // @ts-expect-error Invalid value.
      expect(() => valueToBytes(value)).toThrow(
        /Unsupported value type: ".+"\./u,
      );
    },
  );
});

describe('concatBytes', () => {
  it('returns a byte array from multiple byte arrays', () => {
    expect(
      concatBytes([new Uint8Array([1]), new Uint8Array([2])]),
    ).toStrictEqual(Uint8Array.from([1, 2]));
  });

  it('returns a byte array from multiple byte arrays and values', () => {
    expect(
      concatBytes([new Uint8Array([1]), 2, BigInt(3), '4', '0x5']),
    ).toStrictEqual(Uint8Array.from([1, 2, 3, 52, 5]));
  });
});
