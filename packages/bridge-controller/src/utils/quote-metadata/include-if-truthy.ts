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
