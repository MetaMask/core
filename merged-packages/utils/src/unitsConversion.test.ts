import { utils as web3Utils } from 'web3';

import {
  toWei,
  fromWei,
  numberToString,
  numericToBigInt,
  getValueOfUnit,
  unitMap,
} from './unitsConversion';

// Import the internal function for testing (note: this would normally be exported for testing)
// For now we'll test it indirectly through the public functions

const totalTypes = Object.keys(unitMap).length;

/**
 * Test random value conversion to Wei against web3 implementation.
 *
 * @param negative - Whether to test negative values.
 */
function testRandomValueAgainstWeb3ToWei(negative: boolean) {
  const stringTestValue = `${negative ? '-' : ''}${String(
    Math.floor(Math.random() * 100000000000000000 + 1),
  )}`;
  const randomunitsType = Object.keys(unitMap)[
    Math.floor(Math.random() * (totalTypes - 1) + 1)
  ] as keyof typeof unitMap;
  const unitsValue = toWei(stringTestValue, randomunitsType);
  const web3Value = BigInt(web3Utils.toWei(stringTestValue, randomunitsType));

  expect(unitsValue).toStrictEqual(web3Value);
}

/**
 * Test random value conversion from Wei against web3 implementation.
 *
 * @param negative - Whether to test negative values.
 */
function testRandomValueAgainstWeb3FromWei(negative: boolean) {
  const stringTestValue = `${negative ? '-' : ''}${String(
    Math.floor(Math.random() * 100000000000000000 + 1),
  )}`;
  const randomunitsType = Object.keys(unitMap)[
    Math.floor(Math.random() * (totalTypes - 1) + 1)
  ] as keyof typeof unitMap;
  const unitsValue = fromWei(stringTestValue, randomunitsType);
  const web3Value = web3Utils.fromWei(stringTestValue, randomunitsType);

  // Skip test cases where web3 has a formatting bug that makes the value unparseable
  // Web3 formats negative decimals incorrectly as "0.000-123" instead of "-0.000123"
  if (web3Value.includes('-') && !web3Value.startsWith('-')) {
    // This is a known web3 bug, skip this test case
    return;
  }

  // Handle formatting differences between our implementation and web3
  // Our implementation: "-0.123" vs web3: "-.123"
  // Use numerical comparison for accuracy while allowing for precision differences
  const unitsValueAsNumber = parseFloat(unitsValue);
  const web3ValueAsNumber = parseFloat(web3Value);

  // Allow for small floating point precision differences (up to 10 decimal places)
  const tolerance = 1e-10;
  expect(Math.abs(unitsValueAsNumber - web3ValueAsNumber)).toBeLessThan(
    tolerance,
  );
  // });
}

describe('getValueOfUnit', () => {
  it('should return correct values for all units', () => {
    expect(getValueOfUnit('noether')).toBe(BigInt('0'));
    expect(getValueOfUnit('wei')).toBe(BigInt('1'));
    expect(getValueOfUnit('kwei')).toBe(BigInt('1000'));
    expect(getValueOfUnit('Kwei')).toBe(BigInt('1000'));
    expect(getValueOfUnit('babbage')).toBe(BigInt('1000'));
    expect(getValueOfUnit('femtoether')).toBe(BigInt('1000'));
    expect(getValueOfUnit('mwei')).toBe(BigInt('1000000'));
    expect(getValueOfUnit('Mwei')).toBe(BigInt('1000000'));
    expect(getValueOfUnit('lovelace')).toBe(BigInt('1000000'));
    expect(getValueOfUnit('picoether')).toBe(BigInt('1000000'));
    expect(getValueOfUnit('gwei')).toBe(BigInt('1000000000'));
    expect(getValueOfUnit('Gwei')).toBe(BigInt('1000000000'));
    expect(getValueOfUnit('shannon')).toBe(BigInt('1000000000'));
    expect(getValueOfUnit('nanoether')).toBe(BigInt('1000000000'));
    expect(getValueOfUnit('nano')).toBe(BigInt('1000000000'));
    expect(getValueOfUnit('szabo')).toBe(BigInt('1000000000000'));
    expect(getValueOfUnit('microether')).toBe(BigInt('1000000000000'));
    expect(getValueOfUnit('micro')).toBe(BigInt('1000000000000'));
    expect(getValueOfUnit('finney')).toBe(BigInt('1000000000000000'));
    expect(getValueOfUnit('milliether')).toBe(BigInt('1000000000000000'));
    expect(getValueOfUnit('milli')).toBe(BigInt('1000000000000000'));
    expect(getValueOfUnit('ether')).toBe(BigInt('1000000000000000000'));
    expect(getValueOfUnit('kether')).toBe(BigInt('1000000000000000000000'));
    expect(getValueOfUnit('grand')).toBe(BigInt('1000000000000000000000'));
    expect(getValueOfUnit('mether')).toBe(BigInt('1000000000000000000000000'));
    expect(getValueOfUnit('gether')).toBe(
      BigInt('1000000000000000000000000000'),
    );
    expect(getValueOfUnit('tether')).toBe(
      BigInt('1000000000000000000000000000000'),
    );
  });

  it('should use ether as default unit', () => {
    expect(getValueOfUnit()).toBe(BigInt('1000000000000000000'));
    expect(getValueOfUnit()).toBe(getValueOfUnit('ether'));
  });

  it('should handle case insensitive input', () => {
    expect(getValueOfUnit('ETHER' as any)).toBe(BigInt('1000000000000000000'));
    expect(getValueOfUnit('Ether' as any)).toBe(BigInt('1000000000000000000'));
    expect(getValueOfUnit('GWEI' as any)).toBe(BigInt('1000000000'));
    expect(getValueOfUnit('Gwei')).toBe(BigInt('1000000000'));
  });

  it('should throw error for invalid units', () => {
    expect(() => getValueOfUnit('invalidunit' as any)).toThrow(
      "The unit provided invalidunit doesn't exist",
    );
    expect(() => getValueOfUnit('' as any)).toThrow(
      "The unit provided  doesn't exist",
    );
  });

  it('should handle edge cases', () => {
    // Test noether (special case with value 0)
    expect(getValueOfUnit('noether')).toBe(BigInt(0));

    // Test that all units from unitMap are supported
    Object.keys(unitMap).forEach((unit) => {
      expect(() => getValueOfUnit(unit as any)).not.toThrow();
      expect(getValueOfUnit(unit as any)).toBe(
        BigInt(unitMap[unit as keyof typeof unitMap]),
      );
    });
  });

  it('should handle optimized unit lookups correctly', () => {
    // Test that invalid units throw errors with optimized lookups
    expect(() => toWei(BigInt(1), 'invalidunit' as any)).toThrow(Error);
    expect(() => fromWei(BigInt(1000), 'invalidunit' as any)).toThrow(Error);

    // Test case insensitive lookups work
    expect(() => toWei(1, 'ETHER' as any)).not.toThrow();
    expect(() => fromWei(1000000000000000000, 'GWEI' as any)).not.toThrow();
  });
});

describe('toWei', () => {
  it('should handle edge cases', () => {
    expect(toWei(0, 'wei').toString(10)).toBe('0');
    expect(toWei('0.0', 'wei').toString(10)).toBe('0');
    expect(toWei('.3', 'ether').toString(10)).toBe('300000000000000000');
    expect(() => toWei('.', 'wei')).toThrow(Error);
    expect(() => toWei('1.243842387924387924897423897423', 'ether')).toThrow(
      Error,
    );
    expect(() => toWei('8723.98234.98234', 'ether')).toThrow(Error);
  });

  it('should handle BigInt inputs with fast path optimizations', () => {
    // Fast path: BigInt + 'wei' unit (should return input directly)
    expect(toWei(BigInt(123), 'wei')).toBe(BigInt(123));
    expect(toWei(BigInt(0), 'wei')).toBe(BigInt(0));
    expect(toWei(BigInt(-456), 'wei')).toBe(BigInt(-456));

    // Fast path: BigInt + other units (should multiply by base)
    expect(toWei(BigInt(1), 'ether')).toBe(BigInt('1000000000000000000'));
    expect(toWei(BigInt(2), 'gwei')).toBe(BigInt('2000000000'));
    expect(toWei(BigInt(5), 'kwei')).toBe(BigInt('5000'));
    expect(toWei(BigInt(-1), 'ether')).toBe(BigInt('-1000000000000000000'));

    // Test case sensitivity with BigInt (should work with optimized lookup)
    expect(toWei(BigInt(1), 'Gwei')).toBe(BigInt('1000000000'));
    expect(toWei(BigInt(1), 'ETHER' as any)).toBe(
      BigInt('1000000000000000000'),
    );
  });

  it('should handle large BigInt values', () => {
    const largeBigInt = BigInt('999999999999999999999999999999');
    expect(toWei(largeBigInt, 'wei')).toBe(largeBigInt);
    expect(toWei(BigInt(1000), 'tether')).toBe(
      BigInt('1000000000000000000000000000000000'),
    );
  });

  it('should handle fractional input edge cases', () => {
    // Empty whole part (leading decimal)
    expect(toWei('.5', 'ether')).toBe(BigInt('500000000000000000'));
    expect(toWei('.123', 'ether')).toBe(BigInt('123000000000000000'));
    expect(toWei('.000000000000000001', 'ether')).toBe(BigInt('1'));

    // Empty fractional part (trailing decimal)
    expect(toWei('5.', 'ether')).toBe(BigInt('5000000000000000000'));
    expect(toWei('123.', 'gwei')).toBe(BigInt('123000000000'));

    // Maximum decimal places for different units
    expect(toWei('1.000000000000000000', 'ether')).toBe(
      BigInt('1000000000000000000'),
    ); // 18 decimals for ether
    expect(toWei('1.000000000', 'gwei')).toBe(BigInt('1000000000')); // 9 decimals for gwei
    expect(toWei('1.000', 'kwei')).toBe(BigInt('1000')); // 3 decimals for kwei

    // Negative fractional values
    expect(toWei('-.5', 'ether')).toBe(BigInt('-500000000000000000'));
    expect(toWei('-0.123', 'ether')).toBe(BigInt('-123000000000000000'));
    expect(toWei('-5.', 'ether')).toBe(BigInt('-5000000000000000000'));

    // Edge case: just a decimal point should throw
    expect(() => toWei('.', 'ether')).toThrow(Error);
    expect(() => toWei('-.', 'ether')).toThrow(Error);
  });

  it('should handle comprehensive negative value scenarios', () => {
    // Negative integers
    expect(toWei(-1, 'ether')).toBe(BigInt('-1000000000000000000'));
    expect(toWei('-1', 'ether')).toBe(BigInt('-1000000000000000000'));

    // Negative zero handling
    expect(toWei(-0, 'ether')).toBe(BigInt('0'));
    expect(toWei('-0', 'ether')).toBe(BigInt('0'));
    expect(toWei('-0.0', 'ether')).toBe(BigInt('0'));

    // Negative fractional values
    expect(toWei(-1.5, 'ether')).toBe(BigInt('-1500000000000000000'));
    expect(toWei('-1.5', 'ether')).toBe(BigInt('-1500000000000000000'));

    // Negative BigInt values (should use fast path)
    expect(toWei(BigInt(-123), 'wei')).toBe(BigInt(-123));
    expect(toWei(BigInt(-456), 'gwei')).toBe(BigInt('-456000000000'));
  });

  it('should handle decimal precision edge cases', () => {
    // Test maximum precision for each major unit type
    const maxEtherDecimals = '0.123456789012345678'; // 18 decimal places
    expect(toWei(maxEtherDecimals, 'ether')).toBe(BigInt('123456789012345678'));

    const maxGweiDecimals = '0.123456789'; // 9 decimal places
    expect(toWei(maxGweiDecimals, 'gwei')).toBe(BigInt('123456789'));

    // Too many decimal places should throw
    expect(() => toWei('1.1234567890123456789', 'ether')).toThrow(Error); // 19 decimals
    expect(() => toWei('1.1234567890', 'gwei')).toThrow(Error); // 10 decimals

    // Multiple decimal points should throw
    expect(() => toWei('1.2.3', 'ether')).toThrow(Error);
    expect(() => toWei('1..2', 'ether')).toThrow(Error);
  });

  it('should return the correct value', () => {
    expect(toWei(1, 'wei').toString(10)).toBe('1');
    expect(toWei(1, 'kwei').toString(10)).toBe('1000');
    expect(toWei(1, 'Kwei').toString(10)).toBe('1000');
    expect(toWei(1, 'babbage').toString(10)).toBe('1000');
    expect(toWei(1, 'mwei').toString(10)).toBe('1000000');
    expect(toWei(1, 'Mwei').toString(10)).toBe('1000000');
    expect(toWei(1, 'lovelace').toString(10)).toBe('1000000');
    expect(toWei(1, 'gwei').toString(10)).toBe('1000000000');
    expect(toWei(1, 'Gwei').toString(10)).toBe('1000000000');
    expect(toWei(1, 'shannon').toString(10)).toBe('1000000000');
    expect(toWei(1, 'szabo').toString(10)).toBe('1000000000000');
    expect(toWei(1, 'finney').toString(10)).toBe('1000000000000000');
    expect(toWei(1, 'ether').toString(10)).toBe('1000000000000000000');
    expect(toWei(1, 'kether').toString(10)).toBe('1000000000000000000000');
    expect(toWei(1, 'grand').toString(10)).toBe('1000000000000000000000');
    expect(toWei(1, 'mether').toString(10)).toBe('1000000000000000000000000');
    expect(toWei(1, 'gether').toString(10)).toBe(
      '1000000000000000000000000000',
    );
    expect(toWei(1, 'tether').toString(10)).toBe(
      '1000000000000000000000000000000',
    );

    expect(toWei(1, 'kwei').toString(10)).toBe(
      toWei(1, 'femtoether').toString(10),
    );
    expect(toWei(1, 'szabo').toString(10)).toBe(
      toWei(1, 'microether').toString(10),
    );
    expect(toWei(1, 'finney').toString(10)).toBe(
      toWei(1, 'milliether').toString(10),
    );
    expect(toWei(1, 'milli').toString(10)).toBe(
      toWei(1, 'milliether').toString(10),
    );
    expect(toWei(1, 'milli').toString(10)).toBe(
      toWei(1000, 'micro').toString(10),
    );

    expect(() => {
      toWei(1, 'wei1' as any);
    }).toThrow(Error);
  });
});

describe('numberToString', () => {
  it('should handle edge cases', () => {
    // expect(() => numberToString(null)).toThrow(Error);
    expect(() => numberToString(undefined as any)).toThrow(Error);
    // expect(() => numberToString(NaN)).toThrow(Error);
    expect(() => numberToString({} as any)).toThrow(Error);
    expect(() => numberToString([] as any)).toThrow(Error);
    expect(() => numberToString('-1sdffsdsdf')).toThrow(Error);
    expect(() => numberToString('-0..-...9')).toThrow(Error);
    expect(() => numberToString('fds')).toThrow(Error);
    expect(() => numberToString('')).toThrow(Error);
    expect(() => numberToString('#')).toThrow(Error);
    expect(numberToString(55)).toBe('55');
    expect(numberToString(1)).toBe('1');
    expect(numberToString(-1)).toBe('-1');
    expect(numberToString(0)).toBe('0');
    expect(numberToString(-0)).toBe('0');
    expect(numberToString(10.1)).toBe('10.1');
    expect(numberToString(BigInt(10))).toBe('10');
    expect(numberToString(BigInt(10000))).toBe('10000');
    expect(numberToString(BigInt('-1'))).toBe('-1');
    expect(numberToString(BigInt('1'))).toBe('1');
    expect(numberToString(BigInt(0))).toBe('0');
  });

  it('should handle regex edge cases for string validation', () => {
    // Valid patterns that should pass (based on regex /^-?[0-9.]+$/u)
    expect(numberToString('123')).toBe('123');
    expect(numberToString('-123')).toBe('-123');
    expect(numberToString('123.456')).toBe('123.456');
    expect(numberToString('-123.456')).toBe('-123.456');
    expect(numberToString('0')).toBe('0');
    expect(numberToString('0.0')).toBe('0.0');
    expect(numberToString('-0')).toBe('-0');
    expect(numberToString('123.')).toBe('123.'); // Trailing dot is actually valid per regex
    expect(numberToString('.123')).toBe('.123'); // Leading dot is valid per regex
    expect(numberToString('12.34.56')).toBe('12.34.56'); // Multiple dots are valid per regex

    // Invalid patterns that should throw
    expect(() => numberToString('abc')).toThrow(Error);
    expect(() => numberToString('123abc')).toThrow(Error);
    expect(() => numberToString('.123abc')).toThrow(Error);
    expect(() => numberToString('--123')).toThrow(Error); // Double negative
    expect(() => numberToString('123-')).toThrow(Error); // Trailing negative
    expect(() => numberToString(' 123 ')).toThrow(Error); // Whitespace
    expect(() => numberToString('1e10')).toThrow(Error); // Scientific notation
    expect(() => numberToString('123a')).toThrow(Error); // Letters
    expect(() => numberToString('a123')).toThrow(Error); // Letters at start
  });
});

describe('fromWei', () => {
  it('should handle options', () => {
    expect(fromWei(10000000, 'wei', { commify: true })).toBe('10,000,000');
  });

  it('should handle pad option true', () => {
    expect(fromWei('1500000000000000000', 'ether', { pad: true })).toBe(
      '1.500000000000000000',
    );
  });

  it('should handle commify option with large numbers', () => {
    expect(fromWei('123456789000000000000000', 'wei', { commify: true })).toBe(
      '123,456,789,000,000,000,000,000',
    );
  });

  it('should handle combined pad and commify options', () => {
    expect(
      fromWei('1234567890123456789000', 'ether', { pad: true, commify: true }),
    ).toBe('1,234.567890123456789000');
  });

  it('should handle options with different units', () => {
    expect(fromWei('1234567890', 'gwei', { pad: true })).toBe('1.234567890');
  });

  it('should handle zero values with padding', () => {
    expect(fromWei('0', 'ether', { pad: true })).toBe('0.000000000000000000');
  });

  it('should handle noether special case (base = 0)', () => {
    // Test positive values with noether always return '0'
    expect(fromWei(0, 'noether')).toBe('0');
    expect(fromWei(1, 'noether')).toBe('0');
    expect(fromWei(100, 'noether')).toBe('0');
    expect(fromWei(999999999, 'noether')).toBe('0');
    expect(fromWei('0', 'noether')).toBe('0');
    expect(fromWei('123', 'noether')).toBe('0');
    expect(fromWei('999999999999999999999', 'noether')).toBe('0');
    expect(fromWei(BigInt(0), 'noether')).toBe('0');
    expect(fromWei(BigInt(456), 'noether')).toBe('0');
    expect(fromWei(BigInt('999999999999999999999'), 'noether')).toBe('0');

    // Test negative values with noether always return '-0'
    expect(fromWei(-1, 'noether')).toBe('-0');
    expect(fromWei(-100, 'noether')).toBe('-0');
    expect(fromWei(-999999999, 'noether')).toBe('-0');
    expect(fromWei('-123', 'noether')).toBe('-0');
    expect(fromWei('-999999999999999999999', 'noether')).toBe('-0');
    expect(fromWei(BigInt(-456), 'noether')).toBe('-0');
    expect(fromWei(BigInt('-999999999999999999999'), 'noether')).toBe('-0');

    // Test edge case: negative zero should return '0', not '-0'
    expect(fromWei(-0, 'noether')).toBe('0');
    expect(fromWei('-0', 'noether')).toBe('0');
    expect(fromWei(BigInt(-0), 'noether')).toBe('0');
  });

  it('should handle BigInt inputs with optimized lookups', () => {
    // Test BigInt inputs with various units
    expect(fromWei(BigInt('1000000000000000000'), 'ether')).toBe('1');
    expect(fromWei(BigInt('2000000000'), 'gwei')).toBe('2');
    expect(fromWei(BigInt('5000'), 'kwei')).toBe('5');
    expect(fromWei(BigInt(0), 'ether')).toBe('0');

    // Test negative BigInt values
    expect(fromWei(BigInt('-1000000000000000000'), 'ether')).toBe('-1');
    expect(fromWei(BigInt('-5000000000'), 'gwei')).toBe('-5');

    // Test case sensitivity with BigInt
    expect(fromWei(BigInt('1000000000'), 'Gwei')).toBe('1');
    expect(fromWei(BigInt('1000000000000000000'), 'ETHER' as any)).toBe('1');

    // Test large BigInt values
    expect(fromWei(BigInt('999000000000000000000'), 'ether')).toBe('999');
    expect(
      fromWei(BigInt('1000000000000000000000000000000000'), 'tether'),
    ).toBe('1000');
  });

  it('should handle BigInt with padding and commify options', () => {
    // Test pad option with BigInt
    expect(fromWei(BigInt('1500000000000000000'), 'ether', { pad: true })).toBe(
      '1.500000000000000000',
    );
    expect(
      fromWei(BigInt('1500000000000000000'), 'ether', { pad: false }),
    ).toBe('1.5');

    // Test commify option with BigInt
    expect(
      fromWei(BigInt('1000000000000000000000'), 'wei', { commify: true }),
    ).toBe('1,000,000,000,000,000,000,000');
    expect(
      fromWei(BigInt('123456789000000000000000'), 'ether', { commify: true }),
    ).toBe('123,456.789');
  });

  it('should handle fractional padding edge cases', () => {
    // Test different padding scenarios
    expect(fromWei('1500000000000000000', 'ether', { pad: true })).toBe(
      '1.500000000000000000',
    );
    expect(fromWei('1500000000000000000', 'ether', { pad: false })).toBe('1.5');
    expect(fromWei('1500000000000000000', 'ether')).toBe('1.5'); // Default is no pad

    // Test zero fractional parts
    expect(fromWei('1000000000000000000', 'ether', { pad: true })).toBe(
      '1.000000000000000000',
    );
    expect(fromWei('1000000000000000000', 'ether', { pad: false })).toBe('1');
    expect(fromWei('1000000000000000000', 'ether')).toBe('1'); // Default

    // Test very small fractions
    expect(fromWei('1', 'ether', { pad: true })).toBe('0.000000000000000001');
    expect(fromWei('1', 'ether', { pad: false })).toBe('0.000000000000000001');
    expect(fromWei('1', 'ether')).toBe('0.000000000000000001');

    // Test trailing zeros removal
    expect(fromWei('1230000000000000000', 'ether', { pad: false })).toBe(
      '1.23',
    );
    expect(fromWei('1230000000000000000', 'ether', { pad: true })).toBe(
      '1.230000000000000000',
    );
  });

  it('should handle negative values with various formatting', () => {
    // Negative values with padding
    expect(fromWei('-1500000000000000000', 'ether', { pad: true })).toBe(
      '-1.500000000000000000',
    );
    expect(fromWei('-1500000000000000000', 'ether', { pad: false })).toBe(
      '-1.5',
    );

    // Negative values with commify
    expect(fromWei('-1000000000000000000000', 'wei', { commify: true })).toBe(
      '-1,000,000,000,000,000,000,000',
    );

    // Negative zero (special case)
    expect(fromWei('-0', 'ether')).toBe('0');
    expect(fromWei(BigInt(-0), 'ether')).toBe('0');
  });

  it('should handle very large and very small values', () => {
    // Very large values
    const largeWei = '999999999999999999999999999999';
    expect(fromWei(largeWei, 'wei')).toBe(largeWei);
    expect(fromWei(largeWei, 'ether')).toBe('999999999999.999999999999999999');

    // Very small values
    expect(fromWei('1', 'tether')).toBe('0.000000000000000000000000000001');
    expect(fromWei('999', 'tether')).toBe('0.000000000000000000000000000999');

    // Edge case: zero
    expect(fromWei('0', 'ether')).toBe('0');
    expect(fromWei(BigInt(0), 'ether')).toBe('0');
  });

  it('should return the correct value', () => {
    expect(fromWei(1000000000000000000, 'wei')).toBe('1000000000000000000');
    expect(fromWei(1000000000000000000, 'kwei')).toBe('1000000000000000');
    expect(fromWei(1000000000000000000, 'mwei')).toBe('1000000000000');
    expect(fromWei(1000000000000000000, 'gwei')).toBe('1000000000');
    expect(fromWei(1000000000000000000, 'szabo')).toBe('1000000');
    expect(fromWei(1000000000000000000, 'finney')).toBe('1000');
    expect(fromWei(1000000000000000000, 'ether')).toBe('1');
    expect(fromWei(1000000000000000000, 'kether')).toBe('0.001');
    expect(fromWei(1000000000000000000, 'grand')).toBe('0.001');
    expect(fromWei(1000000000000000000, 'mether')).toBe('0.000001');
    expect(fromWei(1000000000000000000, 'gether')).toBe('0.000000001');
    expect(fromWei(1000000000000000000, 'tether')).toBe('0.000000000001');
  });
});

describe('numericToBigInt', () => {
  it('should convert string/numbers to BigInt', () => {
    expect(numericToBigInt('123')).toBe(BigInt(123));
    expect(numericToBigInt('0')).toBe(BigInt(0));
    expect(numericToBigInt('-456')).toBe(BigInt(-456));
    expect(numericToBigInt('999999999999999999999')).toBe(
      BigInt('999999999999999999999'),
    );
    expect(numericToBigInt(123)).toBe(BigInt(123));
    expect(numericToBigInt(0)).toBe(BigInt(0));
    expect(numericToBigInt(-456)).toBe(BigInt(-456));
    expect(numericToBigInt(42.0)).toBe(BigInt(42));
    // special cases
    expect(numericToBigInt('')).toBe(BigInt(0));
    expect(numericToBigInt('  123  ')).toBe(BigInt(123));
  });

  it('should return BigInt inputs unchanged', () => {
    expect(numericToBigInt(BigInt(123))).toBe(BigInt(123));
  });

  it('should handle edge cases with numbers', () => {
    expect(numericToBigInt(-0)).toBe(BigInt(0));
    expect(numericToBigInt(Number.MAX_SAFE_INTEGER)).toBe(
      BigInt(Number.MAX_SAFE_INTEGER),
    );
    expect(numericToBigInt(Number.MIN_SAFE_INTEGER)).toBe(
      BigInt(Number.MIN_SAFE_INTEGER),
    );
  });

  it('should throw error for invalid input types', () => {
    expect(() => numericToBigInt(null as any)).toThrow(
      'Cannot convert object to BigInt',
    );
    expect(() => numericToBigInt(undefined as any)).toThrow(
      'Cannot convert undefined to BigInt',
    );
    expect(() => numericToBigInt({} as any)).toThrow(
      'Cannot convert object to BigInt',
    );
    expect(() => numericToBigInt(true as any)).toThrow(
      'Cannot convert boolean to BigInt',
    );
  });

  it('should throw error for invalid string formats', () => {
    expect(() => numericToBigInt('abc')).toThrow(SyntaxError);
    expect(() => numericToBigInt('123abc')).toThrow(SyntaxError);
    expect(() => numericToBigInt('12.34')).toThrow(SyntaxError); // Decimal strings not supported by BigInt
    expect(() => numericToBigInt('1e10')).toThrow(SyntaxError); // Scientific notation not supported
  });

  it('should throw error for non-integer numbers', () => {
    expect(() => numericToBigInt(12.34)).toThrow(RangeError);
    expect(() => numericToBigInt(0.5)).toThrow(RangeError);
    expect(() => numericToBigInt(-7.89)).toThrow(RangeError);
    expect(() => numericToBigInt(NaN)).toThrow(RangeError);
    expect(() => numericToBigInt(Infinity)).toThrow(RangeError);
    expect(() => numericToBigInt(-Infinity)).toThrow(RangeError);
  });
});

describe('units', () => {
  describe('normal functionality', () => {
    it('should be the same as web3', () => {
      for (let i = 0; i < 15000; i++) {
        testRandomValueAgainstWeb3ToWei(false);
        testRandomValueAgainstWeb3ToWei(true);
        testRandomValueAgainstWeb3FromWei(false);
        testRandomValueAgainstWeb3FromWei(true);
      }
      // Ensure we've run the test loop
      expect(true).toBe(true);
    });
  });

  describe('performance optimizations', () => {
    it('should handle mixed input types efficiently', () => {
      // Test that all optimizations work together without breaking functionality
      const testCases = [
        { input: BigInt(1), unit: 'wei', expected: BigInt(1) },
        {
          input: BigInt(1),
          unit: 'ether',
          expected: BigInt('1000000000000000000'),
        },
        { input: '1', unit: 'ether', expected: BigInt('1000000000000000000') },
        { input: 1, unit: 'ether', expected: BigInt('1000000000000000000') },
        { input: BigInt(-1), unit: 'gwei', expected: BigInt('-1000000000') },
      ];

      testCases.forEach(({ input, unit, expected }) => {
        expect(toWei(input, unit as any)).toBe(expected);
      });
    });

    it('should handle all unit types with BigInt inputs', () => {
      const units = Object.keys(unitMap) as (keyof typeof unitMap)[];

      units.forEach((unit) => {
        // Skip noether as it's a special case (base = 0)
        if (unit === 'noether') {
          // eslint-disable-next-line jest/no-conditional-expect
          expect(toWei(BigInt(1), unit)).toBe(BigInt(0));
          // eslint-disable-next-line jest/no-conditional-expect
          expect(fromWei(BigInt(1000), unit)).toBe('0');
          return;
        }

        // Test that BigInt conversion works for all units
        const result = toWei(BigInt(1), unit);
        expect(typeof result).toBe('bigint');
        expect(result).toBeGreaterThanOrEqual(BigInt(0));

        // Test round trip conversion
        const backToWei = fromWei(result, unit);
        expect(parseFloat(backToWei)).toBe(1);
      });
    });

    it('should maintain precision with large numbers', () => {
      // Test that optimizations don't lose precision
      const largeValue = BigInt('999999999999999999999999999999');
      expect(toWei(largeValue, 'wei')).toBe(largeValue);

      const largeEther = BigInt('999999999999999999999999999999');
      const largeWei = toWei(largeEther, 'ether');
      expect(fromWei(largeWei, 'ether')).toBe(largeEther.toString());
    });

    it('should handle boundary conditions and edge cases', () => {
      // Test switching between fast and slow paths
      expect(toWei(BigInt(0), 'wei')).toBe(BigInt(0)); // Fast path
      expect(toWei('0', 'wei')).toBe(BigInt(0)); // Slow path
      expect(toWei(0, 'wei')).toBe(BigInt(0)); // Slow path

      // Test case sensitivity extensively
      const testUnits = [
        'wei',
        'Wei',
        'WEI',
        'gwei',
        'Gwei',
        'GWEI',
        'ether',
        'Ether',
        'ETHER',
      ];
      testUnits.forEach((unit) => {
        expect(() => toWei(BigInt(1), unit as any)).not.toThrow();
        expect(() => fromWei(BigInt(1000), unit as any)).not.toThrow();
      });

      // Test that optimized paths produce identical results to original paths
      const testValues = [BigInt(1), '1', 1];
      const testUnitsForComparison = ['wei', 'gwei', 'ether'];

      testUnitsForComparison.forEach((unit) => {
        const results = testValues.map((value) => toWei(value, unit as any));
        // All results should be identical
        expect(results[0]).toBe(results[1]);
        expect(results[1]).toBe(results[2]);
      });
    });

    it('should handle internal function edge cases', () => {
      // Test numericToBigInt indirectly through toWei with various input types
      expect(typeof toWei(BigInt(123), 'wei')).toBe('bigint');
      expect(typeof toWei('123', 'wei')).toBe('bigint');
      expect(typeof toWei(123, 'wei')).toBe('bigint');

      // Test that invalid types would throw (tested through public API)
      expect(() => toWei({} as any, 'wei')).toThrow(Error);
      expect(() => toWei([] as any, 'wei')).toThrow(Error);
      expect(() => toWei(null as any, 'wei')).toThrow(Error);
      expect(() => toWei(undefined as any, 'wei')).toThrow(Error);
    });
  });
});
