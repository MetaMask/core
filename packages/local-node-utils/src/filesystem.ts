/* eslint-disable import-x/no-nodejs-modules */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function findExecutable(root: string, name: string): string | undefined {
  if (!existsSync(root)) {
    return undefined;
  }

  for (const entry of readdirSync(root)) {
    const entryPath = join(root, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      const found = findExecutable(entryPath, name);
      if (found) {
        return found;
      }
    } else if (entry === name) {
      return entryPath;
    }
  }

  return undefined;
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
