export function isFileMissingError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Object.prototype.hasOwnProperty.call(error, 'code') &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
