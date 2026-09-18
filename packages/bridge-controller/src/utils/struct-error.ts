import type { StructError } from '@metamask/superstruct';

/**
 * Formats validation errors (StructError) into an array of messages
 * that match the format used for metrics
 *
 * @param error - The validation errors (StructError) to format
 *
 * @returns An array of error messages
 */
export const formatStructErrors = (error: StructError): string[] =>
  Array.from(
    new Set(
      error
        .failures()
        .map(
          ({ message, path }) =>
            `At path: ${path.join('.') || '<root>'}${error.type ? ` (${error.type})` : ''} -- ${message}`,
        ),
    ),
  );
