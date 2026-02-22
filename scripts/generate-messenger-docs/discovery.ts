/* eslint-disable n/no-sync */

import * as fs from 'fs';
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
 * @returns An array of absolute file paths.
 */
export function findTsFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        // Skip test dirs, node_modules, dist
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        walk(full);
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

  walk(dir);
  return results;
}

/**
 * Recursively find all `.d.cts` declaration files in a directory.
 * Skips nested `node_modules` subdirectories.
 *
 * @param dir - The directory to search.
 * @returns An array of absolute file paths.
 */
export function findDtsFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          continue;
        }
        walk(full);
      } else if (entry.name.endsWith('.d.cts')) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}
