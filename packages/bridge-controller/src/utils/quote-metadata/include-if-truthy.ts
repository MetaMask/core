/**
 * Includes the `result` if any of `value`'s properties are truthy
 *
 * @param value - The value object
 * @param result - The result to include
 * @returns The result if any of the values in the value object are truthy, otherwise undefined
 */
export const includeIfTruthy = <ResultType extends Record<string, unknown>>(
  value: Record<string, unknown> | undefined,
  result: ResultType,
): ResultType | undefined => {
  if (!value) {
    return undefined;
  }

  if (Object.values(value).some(Boolean)) {
    return result;
  }

  return undefined;
};
