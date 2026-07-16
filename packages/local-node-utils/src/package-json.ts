/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isFileMissingError } from './errors.js';

export function readPackageJsonToolConfig({
  cwd = process.cwd(),
  packageJsonPath = join(cwd, 'package.json'),
  configKeys,
}: {
  cwd?: string;
  packageJsonPath?: string;
  configKeys: string[];
}): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(packageJsonPath, 'utf8');
  } catch (error) {
    if (isFileMissingError(error)) {
      return {};
    }
    throw error;
  }

  const packageJson = JSON.parse(raw) as Record<string, unknown>;
  for (const key of configKeys) {
    const config = packageJson[key];
    if (config && typeof config === 'object') {
      return config as Record<string, unknown>;
    }
  }

  return {};
}
