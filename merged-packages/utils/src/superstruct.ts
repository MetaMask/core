import type { Struct } from '@metamask/superstruct';
import { define } from '@metamask/superstruct';

/**
 * Defines a new string-struct matching a regular expression.
 *
 * @example
 * const EthAddressStruct = definePattern('EthAddress', /^0x[0-9a-f]{40}$/iu);
 * type EthAddress = Infer<typeof EthAddressStruct>; // string
 *
 * const CaipChainIdStruct = defineTypedPattern<`${string}:${string}`>(
 *   'CaipChainId',
 *   /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/u;
 * );
 * type CaipChainId = Infer<typeof CaipChainIdStruct>; // `${string}:${string}`
 * @param name - Type name.
 * @param pattern - Regular expression to match.
 * @template Pattern - The pattern type, defaults to `string`.
 * @returns A new string-struct that matches the given pattern.
 */
export function definePattern<Pattern extends string = string>(
  name: string,
  pattern: RegExp,
): Struct<Pattern, null> {
  return define<Pattern>(name, (value: unknown): boolean | string => {
    return typeof value === 'string' && pattern.test(value);
  });
}
