export function readCliValue(
  option: string,
  value: string | undefined,
): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
  }

  return value;
}
