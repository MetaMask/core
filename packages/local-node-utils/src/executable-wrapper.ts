/* eslint-disable import-x/no-nodejs-modules */
import { chmod, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { isFileMissingError } from './errors.js';

export type ExecutableWrapperPathResolution = 'absolute' | 'relative';

export async function installExecutableWrapper({
  binDirectory,
  commandName,
  executableArgs = [],
  executablePath,
  pathResolution = 'absolute',
}: {
  binDirectory: string;
  commandName: string;
  executableArgs?: string[];
  executablePath: string;
  pathResolution?: ExecutableWrapperPathResolution;
}): Promise<string> {
  const binaryPath = join(binDirectory, commandName);
  const wrapperSource = buildExecutableWrapperSource({
    binDirectory,
    executableArgs,
    executablePath,
    pathResolution,
  });

  await mkdir(binDirectory, { recursive: true });
  await unlink(binaryPath).catch((error) => {
    if (!isFileMissingError(error)) {
      throw error;
    }
  });
  await writeFile(binaryPath, wrapperSource);
  await chmod(binaryPath, 0o755);

  return binaryPath;
}

function buildExecutableWrapperSource({
  binDirectory,
  executableArgs,
  executablePath,
  pathResolution,
}: {
  binDirectory: string;
  executableArgs: string[];
  executablePath: string;
  pathResolution: ExecutableWrapperPathResolution;
}): string {
  if (pathResolution === 'relative') {
    const relativeExecutablePath = relative(binDirectory, executablePath);

    return `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const executablePath = path.resolve(__dirname, ${JSON.stringify(relativeExecutablePath)});
const executableArgs = ${JSON.stringify(executableArgs)};
const result = spawnSync(executablePath, executableArgs.concat(process.argv.slice(2)), {
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
  process.exit(1);
}

process.exit(result.status ?? 0);
`;
  }

  const resolvedExecutablePath = resolve(executablePath);

  return `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const executablePath = ${JSON.stringify(resolvedExecutablePath)};
const executableArgs = ${JSON.stringify(executableArgs)};
const result = spawnSync(executablePath, executableArgs.concat(process.argv.slice(2)), {
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
  process.exit(1);
}

process.exit(result.status ?? 0);
`;
}
