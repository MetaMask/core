import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '__tests__',
  'tests',
  'test',
  '__mocks__',
]);

const SKIP_SUFFIXES = ['.test.ts', '.test-d.ts', '.spec.ts', '.d.ts'];

/**
 * Find all non-test TypeScript source files in a directory.
 * Skips node_modules, dist, test directories, and declaration files.
 *
 * @param dir - The directory to search.
 * @returns A promise that resolves to an array of absolute file paths.
 */
export async function findTsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(fullPath);
        }
      } else if (
        entry.name.endsWith('.ts') &&
        !SKIP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
      ) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

/**
 * Find all `.d.cts` declaration files in a directory.
 * Skips nested node_modules subdirectories.
 *
 * @param dir - The directory to search.
 * @returns A promise that resolves to an array of absolute file paths.
 */
export async function findDtsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') {
          await walk(fullPath);
        }
      } else if (entry.name.endsWith('.d.cts')) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}
