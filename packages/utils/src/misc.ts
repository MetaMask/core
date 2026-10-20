/**
 * Predefined sizes (in Bytes) of specific parts of JSON structure.
 */
/* eslint-disable @typescript-eslint/no-duplicate-enum-values --
   These are byte sizes, so collisions are meaningful rather than mistakes:
   a comma, a brace, a quote and a colon are all one byte, and `null` and
   `true` are both four characters. */
export enum JsonSize {
  Null = 4,
  Comma = 1,
  Wrapper = 1,
  True = 4,
  False = 5,
  Quote = 1,
  Colon = 1,
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Date = 24,
}
/* eslint-enable @typescript-eslint/no-duplicate-enum-values */

/**
 * Regular expression with pattern matching for (special) escaped characters.
 */
export const ESCAPE_CHARACTERS_REGEXP = /"|\\|\n|\r|\t/gu;

/**
 * Check if character is ASCII.
 *
 * @param character - Character.
 * @returns True if a character code is ASCII, false if not.
 */
export function isASCII(character: string): boolean {
  return character.charCodeAt(0) <= 127;
}

/**
 * Calculate string size.
 *
 * @param value - String value to calculate size.
 * @returns Number of bytes used to store whole string value.
 */
export function calculateStringSize(value: string): number {
  const size = value.split('').reduce((total, character) => {
    if (isASCII(character)) {
      return total + 1;
    }
    return total + 2;
  }, 0);

  // Also detect characters that need backslash escape
  return size + (value.match(ESCAPE_CHARACTERS_REGEXP) ?? []).length;
}

/**
 * Calculate size of a number ofter JSON serialization.
 *
 * @param value - Number value to calculate size.
 * @returns Number of bytes used to store whole number in JSON.
 */
export function calculateNumberSize(value: number): number {
  return value.toString().length;
}
