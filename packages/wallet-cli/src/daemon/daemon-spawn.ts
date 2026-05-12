import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { pingDaemon } from './daemon-client';
import { getDaemonPaths } from './paths';
import type { DaemonSpawnConfig } from './types';

const POLL_INTERVAL_MS = 100;
const MAX_POLLS = 300; // 30 seconds

/**
 * Outcome of {@link ensureDaemon}.
 *
 * - `'already-running'`: a responsive daemon was found at the configured
 *   socket path. The supplied flags (`infuraProjectId`, `password`, `srp`)
 *   were NOT applied to that daemon; the caller should surface this so a
 *   user who is trying to change them isn't silently ignored.
 * - `'started'`: a new daemon was spawned and is now responsive.
 */
export type EnsureDaemonResult = {
  state: 'already-running' | 'started';
  socketPath: string;
};

/**
 * Ensure the daemon is running. If a responsive daemon already exists, return
 * `'already-running'` (caller decides how to surface that). Otherwise spawn
 * one as a detached process and wait until the socket becomes responsive.
 *
 * Refuses to spawn when pinging the existing socket fails with anything other
 * than `ENOENT` (wedged or foreign daemon) — taking over could orphan the
 * existing process and corrupt its PID file.
 *
 * @param config - Spawn configuration.
 * @returns The state of the daemon and the socket path it's listening on.
 */
export async function ensureDaemon(
  config: DaemonSpawnConfig,
): Promise<EnsureDaemonResult> {
  const { socketPath } = getDaemonPaths(config.dataDir);

  const initialPing = await pingDaemon(socketPath);
  if (initialPing.status === 'responsive') {
    return { state: 'already-running', socketPath };
  }
  if (initialPing.status === 'unreachable') {
    if (initialPing.reason === 'permission') {
      throw new Error(
        `Refusing to start: the socket at ${socketPath} is owned by another user. ` +
          `Choose a different data directory (MM_DAEMON_DATA_DIR) or remove the socket manually. ` +
          `(${initialPing.error.message})`,
      );
    }
    throw new Error(
      `Refusing to start: a daemon socket already exists at ${socketPath} but is unresponsive. ` +
        `Run \`mm daemon stop\` (or \`mm daemon purge\`) before starting a new daemon. ` +
        `(${initialPing.error.message})`,
    );
  }

  process.stderr.write('Starting daemon...\n');

  const { entryPath, args } = resolveEntryPoint(config.packageRoot);

  const child = spawn(process.execPath, [...args, entryPath], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      MM_DAEMON_DATA_DIR: config.dataDir,
      MM_DAEMON_SOCKET_PATH: socketPath,
      INFURA_PROJECT_ID: config.infuraProjectId,
      MM_WALLET_PASSWORD: config.password,
      MM_WALLET_SRP: config.srp,
    },
  });

  type ExitInfo = { code: number | null; signal: NodeJS.Signals | null };
  const exitInfo: { value: ExitInfo | null } = { value: null };

  child.on('error', (error) => {
    process.stderr.write(`Failed to spawn daemon process: ${String(error)}\n`);
  });
  child.on('exit', (code, signal) => {
    exitInfo.value = { code, signal };
  });
  child.unref();

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (exitInfo.value !== null) {
      const { code, signal } = exitInfo.value;
      throw new Error(
        `Daemon process exited during startup (code=${String(code)}, signal=${String(signal)}). ` +
          `Check the daemon log at ${getDaemonPaths(config.dataDir).logPath}.`,
      );
    }
    const ping = await pingDaemon(socketPath);
    if (ping.status === 'responsive') {
      process.stderr.write('Daemon ready.\n');
      return { state: 'started', socketPath };
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
