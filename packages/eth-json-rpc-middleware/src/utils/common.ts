/**
 * Function to stripe array brackets if string defining the type has it.
 *
 * @param typeString - String defining type from which array brackets are required to be removed.
 * @returns Parameter string with array brackets [] removed.
 */
export const stripArrayTypeIfPresent = (typeString: string) => {
  if (typeString?.match(/\S\[\d*\]$/u)) {
    return typeString.replace(/\[\d*\]$/gu, '').trim();
  }
  return typeString;
};
