import { glob } from 'glob';

/**
 * Find all non-test TypeScript source files in a directory.
 * Skips node_modules, dist, test directories, and declaration files.
 *
 * @param dir - The directory to search.
 * @returns A promise that resolves to an array of absolute file paths.
 */
export async function findTsFiles(dir: string): Promise<string[]> {
  return await glob('**/*.ts', {
    cwd: dir,
    absolute: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/__tests__/**',
      '**/tests/**',
      '**/test/**',
      '**/__mocks__/**',
      '**/*.test.ts',
      '**/*.test-d.ts',
      '**/*.spec.ts',
      '**/*.d.ts',
    ],
  });
}

/**
 * Find all `.d.cts` declaration files in a directory.
 * Skips nested node_modules subdirectories.
 *
 * @param dir - The directory to search.
 * @returns A promise that resolves to an array of absolute file paths.
 */
export async function findDtsFiles(dir: string): Promise<string[]> {
  return await glob('**/*.d.cts', {
    cwd: dir,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });
}
