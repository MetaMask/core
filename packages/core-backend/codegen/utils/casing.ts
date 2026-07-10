/**
 * Splits a name into its word parts, understanding camelCase, PascalCase,
 * snake_case, kebab-case and digit boundaries.
 *
 * @param name - The name to split.
 * @returns The word parts.
 */
function splitWords(name: string): string[] {
  return (
    name
      .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
      .match(/[A-Za-z0-9]+/gu) ?? []
  );
}

/**
 * Converts a name to camelCase.
 *
 * @param name - The name to convert.
 * @returns The camelCase name.
 */
export function camelCase(name: string): string {
  const words = splitWords(name);
  return words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('');
}

/**
 * Converts a name to PascalCase.
 *
 * @param name - The name to convert.
 * @returns The PascalCase name.
 */
export function pascalCase(name: string): string {
  const words = splitWords(name);
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
