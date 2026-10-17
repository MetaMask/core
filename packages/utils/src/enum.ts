type Enum<Type extends Record<string, unknown>> = Type & {
  [Key in keyof Type as Type[Key] extends number ? Type[Key] : never]: string;
};

export type EnumValue<Type> = Type[Extract<keyof Type, string>];

/**
 * Create a TypeScript enum without actually using the enum syntax.
 *
 * @deprecated This only exists to migrate existing TypeScript enums to
 * erasable syntax while remaining backwards-compatible. Do not use it for new
 * enums.
 * @param enumObject - The object to create the enum from.
 * @returns The enum object with reverse mapping for numeric values.
 * @example
 * const Duration = createEnum({
 *   Millisecond: 1,
 *   Second: 1000,
 *   Minute: 60_000,
 * });
 *
 * type Duration = EnumValue<typeof Duration>; // 1 | 1000 | 60000
 *
 * declare namespace Duration {
 *   type Millisecond = typeof Duration.Millisecond;
 *   type Second = typeof Duration.Second;
 *   type Minute = typeof Duration.Minute;
 * }
 *
 * console.log(Duration.Millisecond); // 1
 * console.log(Duration[1]); // 'Millisecond'
 */
export function createEnum<const Type extends Record<string, unknown>>(
  enumObject: Type,
): Enum<Type> {
  const clone: Record<string, unknown> = { ...enumObject };

  for (const [key, value] of Object.entries(enumObject)) {
    if (typeof value === 'number') {
      clone[value] = key;
    }
  }

  return clone as Enum<Type>;
}
