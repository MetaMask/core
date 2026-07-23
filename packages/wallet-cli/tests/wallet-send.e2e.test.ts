import { disableNetConnect, enableNetConnect } from 'nock';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getDaemonPaths } from '../src/daemon/paths.js';
import { isProcessAlive, readPidFile } from '../src/daemon/utils.js';

// True end-to-end test for `mm wallet send`: it drives the BUILT `mm` CLI
// against a REAL local EVM chain (anvil, from Foundry) and asserts that a
// transaction is signed, broadcast, and mined. Unlike `lifecycle.e2e.test.ts`
// (which is deliberately offline), this exercises the whole send path — the
// dedicated `sendTransaction` RPC, the daemon's TransactionController, gas,
// signing via KeyringController, headless auto-approval, and the broadcast to
// the chain.
//
// Anvil is booted with the SAME mnemonic the wallet imports, so the wallet's
// first account is pre-funded (10000 ETH) on the local chain. A custom network
// pointing at the anvil RPC is added at runtime via
// `NetworkController:addNetwork`, and the send selects it by `--chain-id`.
//
// Requires the `anvil` binary. When it is not installed the whole suite is
// SKIPPED (see `resolveAnvilPath`) rather than failed, so it runs locally and
// in the wallet-cli CI job (which installs Foundry) but never blocks a machine
// without Foundry. Install it with Foundry's `foundryup`, or in this repo:
//   yarn workspace @metamask/wallet-cli run test:e2e:install-anvil
// Set `MM_E2E_REQUIRE_ANVIL=true` to turn the skip into a hard failure — CI
// does this whenever it installed anvil, so a broken install surfaces loudly
// instead of passing as a green no-op. See `tests/README.md`.

// The canonical BIP-39 test mnemonic. anvil derives the same accounts from it.
const TEST_SRP = 'test test test test test test test test test test test junk';
const TEST_PASSWORD = 'testpass';
const TEST_INFURA_PROJECT_ID = '00000000000000000000000000000000';

// A custom chain id that does not collide with any built-in network, so the
// added network is unambiguously the one the send resolves.
const CHAIN_ID_DEC = 31337;
const CHAIN_ID_HEX = `0x${CHAIN_ID_DEC.toString(16)}`;

const BIN_PATH = join(__dirname, '..', 'bin', 'run.mjs');

// Spawning the CLI, importing the SRP (real PBKDF2), booting anvil, and mining
// each step is slow; give the whole flow generous room. Set on the describe
// below (not just the `it`) so the anvil-booting `beforeEach` isn't held to
// jest's 5s default hook timeout.
const STEP_TIMEOUT_MS = 120_000;

/**
 * Locate the `anvil` binary, or return `undefined` so the suite can skip.
 *
 * Checks, in order: an explicit `MM_E2E_ANVIL_PATH` override, the Foundry
 * binary Foundryup installs into this package's `node_modules/.bin`, and
 * finally `anvil` on `PATH`.
 *
 * @returns The path (or bare command) to use for `anvil`, or `undefined`.
 */
function resolveAnvilPath(): string | undefined {
  const override = process.env.MM_E2E_ANVIL_PATH;
  if (override !== undefined && override.length > 0) {
    return existsSync(override) ? override : undefined;
  }
  const local = join(__dirname, '..', 'node_modules', '.bin', 'anvil');
  if (existsSync(local)) {
    return local;
  }
  // Fall back to PATH; if it is not there either, the spawn check below fails
  // and the suite is skipped.
  return 'anvil';
}

const ANVIL_PATH = resolveAnvilPath();

type RunResult = { code: number | null; stdout: string; stderr: string };

/**
 * Run the built `mm` CLI as a child process and capture its output.
 *
 * @param args - CLI arguments (e.g. `['wallet', 'send', ...]`).
 * @param dataDir - Data directory to point the CLI at (via `MM_DATA_DIR`).
 * @returns The exit code and captured stdout/stderr.
 */
async function runMm(args: string[], dataDir: string): Promise<RunResult> {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;

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

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/**
 * Assert a CLI invocation exited 0, embedding output and the daemon log on
 * failure.
 *
 * @param step - Human-readable label for the CLI step.
 * @param result - The captured run result.
 * @param dataDir - Data directory the daemon is using (to locate its log).
 */
async function expectSuccessfulRun(
  step: string,
  result: RunResult,
  dataDir: string,
): Promise<void> {
  if (result.code === 0) {
    return;
  }
  const { logPath } = getDaemonPaths(dataDir);
  const daemonLog = await readFile(logPath, 'utf-8').catch(
    (error: unknown) => `<could not read daemon log: ${String(error)}>`,
  );
  throw new Error(
    `Expected \`mm ${step}\` to exit 0 but it exited ${String(result.code)}.\n` +
      `=== stdout ===\n${result.stdout}\n` +
      `=== stderr ===\n${result.stderr}\n` +
      `=== ${logPath} ===\n${daemonLog}\n`,
  );
}

/**
 * Make a JSON-RPC call directly to the anvil node over `node:http` (the shared
 * `tests/setup.ts` deletes `globalThis.fetch` so nock/undici can intercept, so
 * `fetch` is not available here).
 *
 * @param port - The anvil port.
 * @param method - The JSON-RPC method.
 * @param params - The JSON-RPC params.
 * @returns The `result` field of the response.
 */
async function anvilRpc(
  port: number,
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk.toString()));
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as {
              result?: unknown;
              error?: unknown;
            };
            if (json.error) {
              reject(
                new Error(
                  `anvil ${method} failed: ${JSON.stringify(json.error)}`,
                ),
              );
            } else {
              resolve(json.result);
            }
          } catch (error) {
            reject(error as Error);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Spawn anvil on the given port with the test mnemonic and wait until it
 * answers JSON-RPC.
 *
 * @param port - The port to listen on.
 * @returns The anvil child process.
 */
async function startAnvil(port: number): Promise<ChildProcess> {
  const anvil = spawn(
    ANVIL_PATH as string,
    [
      '--port',
      String(port),
      '--chain-id',
      String(CHAIN_ID_DEC),
      '--mnemonic',
      TEST_SRP,
      '--silent',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  anvil.stdout?.on('data', (chunk) => (output += chunk.toString()));
  anvil.stderr?.on('data', (chunk) => (output += chunk.toString()));
  let exitInfo: string | undefined;
  anvil.on('exit', (code, signal) => {
    exitInfo = `anvil exited early (code=${String(code)}, signal=${String(signal)})`;
  });
  anvil.on('error', (error) => {
    output += `\n[spawn error] ${error.message}`;
  });

  // Poll until anvil answers, or time out.
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (exitInfo !== undefined) {
      throw new Error(`${exitInfo} [${ANVIL_PATH as string}]\n${output}`);
    }
    try {
      await anvilRpc(port, 'eth_chainId');
      return anvil;
    } catch {
      if (Date.now() > deadline) {
        anvil.kill('SIGKILL');
        throw new Error(
          `anvil did not become ready on :${port} [${ANVIL_PATH as string}]\n${output}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

/**
 * Kill any daemon recorded in the data dir and remove the temp directory.
 *
 * @param dataDir - The temp data directory to tear down.
 */
async function cleanupDaemon(dataDir: string): Promise<void> {
  const { pidPath } = getDaemonPaths(dataDir);
  const pid = await readPidFile(pidPath).catch(() => undefined);
  if (pid !== undefined && isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  await rm(dataDir, { recursive: true, force: true });
}

const anvilSpawnable =
  ANVIL_PATH !== undefined &&
  (ANVIL_PATH === 'anvil' || existsSync(ANVIL_PATH));

// CI sets this whenever it installed anvil (i.e. wallet-cli changed), so an
// install that silently produced no usable binary fails the suite loudly
// rather than letting the whole real-chain test skip itself green.
const anvilRequired = process.env.MM_E2E_REQUIRE_ANVIL === 'true';

describe('mm wallet send (real chain e2e)', () => {
  jest.setTimeout(STEP_TIMEOUT_MS);

  let dataDir: string;
  let anvil: ChildProcess | undefined;
  let port: number;

  beforeAll(() => {
    if (anvilRequired && !anvilSpawnable) {
      throw new Error(
        'MM_E2E_REQUIRE_ANVIL is set but the anvil binary was not found. ' +
          'The real-chain send e2e cannot run; check the Foundry install ' +
          '(see tests/README.md).',
      );
    }
  });

  beforeEach(async () => {
    if (!anvilSpawnable) {
      return;
    }
    dataDir = await mkdtemp(join(tmpdir(), 'mm-send-e2e-'));
    port = 8600 + (process.pid % 400);

    // The shared test setup (`tests/setupAfterEnv/nock.ts`) disables all net
    // connect before every test. Re-allow exactly the anvil host:port — nothing
    // else — restored in `afterEach`, so the block stays in place elsewhere.
    enableNetConnect(`127.0.0.1:${port}`);

    anvil = await startAnvil(port);
  });

  afterEach(async () => {
    if (!anvilSpawnable) {
      return;
    }
    await cleanupDaemon(dataDir);
    // Await anvil's exit so its child-process handle is gone before jest checks
    // for open handles — otherwise the run can hang after the test completes.
    if (anvil) {
      const exited = new Promise((resolve) => anvil?.once('exit', resolve));
      anvil.kill('SIGKILL');
      await exited;
    }
    disableNetConnect();
  });

  it(
    'signs, broadcasts, and mines a transaction on the local chain',
    async () => {
      if (!anvilSpawnable) {
        console.warn(
          'anvil not found; skipping (install Foundry — see tests/README.md).',
        );
        return;
      }

      // anvil funds the mnemonic's accounts; account[0] is the wallet's
      // account, account[1] is our recipient.
      const accounts = (await anvilRpc(port, 'eth_accounts')) as string[];
      const recipient = accounts[1];

      const recipientBalanceBefore = BigInt(
        (await anvilRpc(port, 'eth_getBalance', [
          recipient,
          'latest',
        ])) as string,
      );

      // Start the daemon (first run imports the SRP and unlocks the wallet).
      const start = await runMm(['daemon', 'start'], dataDir);
      await expectSuccessfulRun('daemon start', start, dataDir);

      // Point the daemon at the local chain by adding a custom network.
      const networkConfig = {
        chainId: CHAIN_ID_HEX,
        name: 'Anvil Local',
        nativeCurrency: 'ETH',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        rpcEndpoints: [
          { type: 'custom', url: `http://127.0.0.1:${port}`, name: 'anvil' },
        ],
      };
      const addNetwork = await runMm(
        [
          'daemon',
          'call',
          'NetworkController:addNetwork',
          JSON.stringify([networkConfig]),
        ],
        dataDir,
      );
      await expectSuccessfulRun(
        'daemon call NetworkController:addNetwork',
        addNetwork,
        dataDir,
      );

      // Send 1 ETH with explicit gas so the flow never depends on the external
      // gas-estimation API (which has no data for a local chain id).
      const send = await runMm(
        [
          'wallet',
          'send',
          '--to',
          recipient,
          '--value',
          '1',
          '--chain-id',
          CHAIN_ID_HEX,
          '--gas',
          '0x5208',
          '--max-fee-per-gas',
          '0x77359400',
          '--max-priority-fee-per-gas',
          '0x3b9aca00',
          '--yes',
        ],
        dataDir,
      );
      await expectSuccessfulRun('wallet send', send, dataDir);

      // The command prints the broadcast hash.
      expect(send.stdout).toContain('Transaction broadcast.');
      const hashMatch = send.stdout.match(/Hash:\s+(0x[0-9a-fA-F]{64})/u);
      expect(hashMatch).not.toBeNull();
      const hash = (hashMatch as RegExpMatchArray)[1];

      // The chain confirms the transaction was mined successfully...
      const receipt = (await anvilRpc(port, 'eth_getTransactionReceipt', [
        hash,
      ])) as { status: string; to: string } | null;
      expect(receipt).not.toBeNull();
      expect((receipt as { status: string }).status).toBe('0x1');
      expect((receipt as { to: string }).to.toLowerCase()).toBe(
        recipient.toLowerCase(),
      );

      // ...and the recipient's balance grew by the 1 ETH we sent.
      const recipientBalanceAfter = BigInt(
        (await anvilRpc(port, 'eth_getBalance', [
          recipient,
          'latest',
        ])) as string,
      );
      expect(recipientBalanceAfter - recipientBalanceBefore).toBe(10n ** 18n);

      await runMm(['daemon', 'stop'], dataDir);
    },
    STEP_TIMEOUT_MS,
  );
});
