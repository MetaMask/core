import * as fs from 'fs/promises';
import * as path from 'path';

export const SKIP_DIRS = new Set([
  '__tests__',
  'tests',
  'test',
  'node_modules',
  'dist',
  '__mocks__',
]);

/**
 * Recursively find all non-test TypeScript files in a directory.
 *
 * @param dir - The directory to search.
 * @returns A promise that resolves to an array of absolute file paths.
 */
export async function findTsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        // Skip test dirs, node_modules, dist
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        await walk(full);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test-d.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Recursively find all `.d.cts` declaration files in a directory.
 * Skips nested `node_modules` subdirectories.
 *
 * @param dir - The directory to search.
 * @returns A promise that resolves to an array of absolute file paths.
 */
export async function findDtsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          continue;
        }
        await walk(full);
      } else if (entry.name.endsWith('.d.cts')) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}
