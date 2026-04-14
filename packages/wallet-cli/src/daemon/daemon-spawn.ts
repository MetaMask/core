import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { pingDaemon } from './daemon-client';
import { getDaemonPaths } from './paths';
import type { DaemonSpawnConfig } from './types';

const POLL_INTERVAL_MS = 100;
const MAX_POLLS = 300; // 30 seconds

/**
 * Ensure the daemon is running. If it is not, spawn it as a detached process
 * and wait until the socket becomes responsive.
 *
 * @param config - Spawn configuration.
 */
export async function ensureDaemon(config: DaemonSpawnConfig): Promise<void> {
  const { socketPath } = getDaemonPaths(config.dataDir);
  if (await pingDaemon(socketPath)) {
    return;
  }

  process.stderr.write('Starting daemon...\n');

  const { entryPath, args } = resolveEntryPoint(config.packageRoot);

  const child = spawn(process.execPath, [...args, entryPath], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MM_DAEMON_DATA_DIR: config.dataDir,
      INFURA_PROJECT_ID: config.infuraProjectId,
      MM_WALLET_PASSWORD: config.password,
      MM_WALLET_SRP: config.srp,
    },
  });
  child.on('error', (error) => {
    process.stderr.write(`Failed to spawn daemon process: ${String(error)}\n`);
  });
  child.unref();

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (await pingDaemon(socketPath)) {
      process.stderr.write('Daemon ready.\n');
      return;
    }
  }

  throw new Error(
    `Daemon did not start within ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`,
  );
}

/**
 * Resolve the daemon entry point path and any extra Node.js args needed.
 *
 * In production, uses the compiled dist output. In development, uses tsx
 * to run TypeScript source directly.
 *
 * @param packageRoot - The root directory of the wallet-cli package.
 * @returns The entry path and any extra node args.
 */
function resolveEntryPoint(packageRoot: string): {
  entryPath: string;
  args: string[];
} {
  const distEntry = join(packageRoot, 'dist', 'daemon', 'daemon-entry.mjs');
  if (existsSync(distEntry)) {
    return { entryPath: distEntry, args: [] };
  }

  const srcEntry = join(packageRoot, 'src', 'daemon', 'daemon-entry.ts');
  return {
    entryPath: srcEntry,
    args: ['--import', 'tsx'],
  };
}
