/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { isFileMissingError } from './errors.js';

export function getMetamaskCacheDirectory({
  cwd = process.cwd(),
  homeDirectory = homedir(),
  toolName = 'local-node-utils',
}: {
  cwd?: string;
  homeDirectory?: string;
  toolName?: string;
} = {}): string {
  const yarnRcPath = join(cwd, '.yarnrc.yml');
  let enableGlobalCache = false;

  try {
    const parsedConfig = parseYaml(readFileSync(yarnRcPath, 'utf8'));
    enableGlobalCache = parsedConfig?.enableGlobalCache ?? false;
  } catch (error) {
    if (isFileMissingError(error)) {
      return join(cwd, '.metamask', 'cache');
    }
    console.warn(
      `Warning: Error reading ${yarnRcPath}, using local ${toolName} cache:`,
      error,
    );
  }

  return enableGlobalCache
    ? join(homeDirectory, '.cache', 'metamask')
    : join(cwd, '.metamask', 'cache');
}
