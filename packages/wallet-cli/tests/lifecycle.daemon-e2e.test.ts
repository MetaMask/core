import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getDaemonPaths } from '../src/daemon/paths';
import { isProcessAlive, readPidFile } from '../src/daemon/utils';

// Subprocess-level lifecycle test for the `mm daemon` command suite. Unlike the
// in-process suites (`socket-integration.test.ts` exercises the transport in
// the test realm; `wallet-factory.e2e.test.ts` constructs a real `Wallet`
// in-process), this spawns the BUILT `mm` CLI as a child process against a temp
// data directory and drives the real `start → call → status/stop/purge`
// lifecycle over the Unix socket. It needs `dist/` and the native
// `better-sqlite3` addon, so it runs only via `yarn test:e2e` (its own jest
// config), excluded from the fast unit `test` run and its 100%-coverage gate.
//
// Offline-safe: the daemon's startup neither fetches feature flags
// (RemoteFeatureFlagController only fetches in `updateRemoteFeatureFlags`) nor
// looks up the network (NetworkController's `init` is synchronous), and the
// only action called here, `KeyringController:getState`, is local.

// A valid 12-word BIP-39 mnemonic — the same fixtures the in-process e2e uses.
const TEST_SRP = 'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'testpass';
// NetworkController requires a project ID but is never reached over the network
// here, so any well-formed-looking value works.
const TEST_INFURA_PROJECT_ID = '00000000000000000000000000000000';

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/u;

const BIN_PATH = join(__dirname, '..', 'bin', 'run.mjs');

// Each step (spawn the CLI, construct a real Wallet, run PBKDF2 key derivation
// for the first-run SRP import) is slow; give the whole lifecycle room.
const STEP_TIMEOUT_MS = 60_000;

type RunResult = { code: number | null; stdout: string; stderr: string };

/**
 * Run the built `mm` CLI as a child process and capture its output.
 *
 * `NODE_OPTIONS` is stripped from the child environment so the parent jest
 * run's `--experimental-vm-modules` flag does not leak an ExperimentalWarning
 * onto the CLI's stderr.
 *
 * @param args - CLI arguments (e.g. `['daemon', 'start']`).
 * @param dataDir - Data directory to point the CLI at (via `MM_DATA_DIR`).
 * @returns The exit code and captured stdout/stderr.
 */
async function runMm(args: string[], dataDir: string): Promise<RunResult> {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN_PATH, ...args], {
      env: {
        ...env,
        MM_DATA_DIR: dataDir,
        INFURA_PROJECT_ID: TEST_INFURA_PROJECT_ID,
        MM_WALLET_PASSWORD: TEST_PASSWORD,
        MM_WALLET_SRP: TEST_SRP,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/**
 * Call a messenger action on the running daemon and parse its JSON result.
 *
 * @param action - The messenger action name.
 * @param dataDir - Data directory the daemon is using.
 * @returns The parsed result object.
 */
async function callAction(
  action: string,
  dataDir: string,
): Promise<Record<string, unknown>> {
  const result = await runMm(['daemon', 'call', action], dataDir);
  expect(result.code).toBe(0);
  return JSON.parse(result.stdout.trim());
}

/**
 * Whether a path exists, without throwing on absence.
 *
 * @param path - The path to check.
 * @returns True if `stat` succeeds.
 */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarantee no daemon is left running and remove the temp data directory,
 * regardless of how a test ended. Kills by the recorded PID directly (rather
 * than going through `mm daemon stop`) so a wedged daemon cannot block cleanup.
 *
 * @param dataDir - The temp data directory to tear down.
 */
async function cleanup(dataDir: string): Promise<void> {
  const { pidPath } = getDaemonPaths(dataDir);
  const pid = await readPidFile(pidPath).catch(() => undefined);
  if (pid !== undefined && isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone — nothing to clean up.
    }
  }
  await rm(dataDir, { recursive: true, force: true });
}

describe('mm daemon lifecycle (subprocess e2e)', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'mm-e2e-'));
  });

  afterEach(async () => {
    await cleanup(dataDir);
  });

  it(
    'starts, reports already-running, answers call & status, then stops',
    async () => {
      const start = await runMm(['daemon', 'start'], dataDir);
      expect(start.code).toBe(0);
      expect(start.stdout).toMatch(/Daemon running\. Socket:/u);

      // A second start finds the responsive daemon and leaves it untouched.
      const restart = await runMm(['daemon', 'start'], dataDir);
      expect(restart.code).toBe(0);
      expect(restart.stdout).toMatch(/already running/iu);

      // First run imports the SRP, so the wallet is unlocked and exposes the
      // derived account.
      const keyringState = await callAction(
        'KeyringController:getState',
        dataDir,
      );
      expect(keyringState.isUnlocked).toBe(true);
      const keyrings = keyringState.keyrings as { accounts: string[] }[];
      expect(keyrings[0]?.accounts[0]).toMatch(ADDRESS_REGEX);

      const status = await runMm(['daemon', 'status'], dataDir);
      expect(status.code).toBe(0);
      expect(status.stdout).toMatch(
        /Daemon is running\. PID: \d+, Uptime: \d+s/u,
      );

      // The socket holds an unlocked wallet and the data dir holds the vault, so
      // both must be owner-only (the only access-control boundary). The low 3
      // octal digits of `mode` are the permission bits.
      const paths = getDaemonPaths(dataDir);
      const socketMode = (await stat(paths.socketPath)).mode
        .toString(8)
        .slice(-3);
      const dirMode = (await stat(dataDir)).mode.toString(8).slice(-3);
      expect(socketMode).toBe('600');
      expect(dirMode).toBe('700');

      const stop = await runMm(['daemon', 'stop'], dataDir);
      expect(stop.code).toBe(0);

      const statusAfterStop = await runMm(['daemon', 'status'], dataDir);
      expect(statusAfterStop.code).toBe(0);
      expect(statusAfterStop.stdout).toMatch(/not running/iu);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    'resumes the persisted vault across a restart instead of re-importing',
    async () => {
      await runMm(['daemon', 'start'], dataDir);
      const firstRun = await callAction('KeyringController:getState', dataDir);
      expect(firstRun.isUnlocked).toBe(true);
      const firstKeyrings = firstRun.keyrings as { accounts: string[] }[];
      expect(firstKeyrings[0]?.accounts[0]).toMatch(ADDRESS_REGEX);

      await runMm(['daemon', 'stop'], dataDir);

      // The on-disk database survives the stop.
      const { dbPath } = getDaemonPaths(dataDir);
      expect(await exists(dbPath)).toBe(true);

      await runMm(['daemon', 'start'], dataDir);

      // On the second start the persisted vault is found, so first-run SRP
      // import is skipped and the wallet resumes LOCKED — a re-import would
      // have left it unlocked. This is the observable signature of the
      // `hasPersistedKeyring` resume path.
      const resumed = await callAction('KeyringController:getState', dataDir);
      expect(resumed.isUnlocked).toBe(false);
      expect(typeof resumed.vault).toBe('string');

      await runMm(['daemon', 'stop'], dataDir);
    },
    STEP_TIMEOUT_MS,
  );

  it(
    'purges all daemon state',
    async () => {
      await runMm(['daemon', 'start'], dataDir);

      const purge = await runMm(['daemon', 'purge', '--force'], dataDir);
      expect(purge.code).toBe(0);
      expect(purge.stdout).toMatch(/All daemon state deleted/u);

      const paths = getDaemonPaths(dataDir);
      expect(await exists(paths.dbPath)).toBe(false);
      expect(await exists(paths.socketPath)).toBe(false);
      expect(await exists(paths.pidPath)).toBe(false);
    },
    STEP_TIMEOUT_MS,
  );
});
