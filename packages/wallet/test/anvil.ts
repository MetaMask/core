import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const ANVIL_STARTUP_TIMEOUT = 15_000;

export type AnvilInstance = {
  port: number;
  rpcUrl: string;
  stop: () => Promise<void>;
};

/**
 * Start a local Anvil dev chain instance.
 *
 * @param options - Options for the Anvil instance.
 * @param options.mnemonic - The mnemonic to use for pre-funded accounts.
 * @returns An object with the port, RPC URL, and a stop function.
 */
export async function startAnvil(options: {
  mnemonic: string;
}): Promise<AnvilInstance> {
  const anvilBin = await getAnvilBinaryPath();

  const proc: ChildProcess = spawn(
    anvilBin,
    ['--mnemonic', options.mnemonic, '--port', '0'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const port = await waitForReady(proc);
  const rpcUrl = `http://127.0.0.1:${port}`;

  return {
    port,
    rpcUrl,
    stop: () => stopAnvil(proc),
  };
}

async function getAnvilBinaryPath(): Promise<string> {
  const candidates = [
    resolve(__dirname, '../node_modules/.bin/anvil'),
    resolve(__dirname, '../../../node_modules/.bin/anvil'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // not found, try next
    }
  }

  throw new Error(
    `Anvil binary not found. Run: yarn workspace @metamask/wallet run pretest`,
  );
}

function waitForReady(proc: ChildProcess): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Anvil failed to start within timeout'));
    }, ANVIL_STARTUP_TIMEOUT);

    let output = '';
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      const match = output.match(/Listening on [^\s:]+:(\d+)/u);
      if (match) {
        clearTimeout(timeout);
        resolvePromise(Number(match[1]));
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`Anvil exited with code ${code}:\n${output}`));
      }
    });
  });
}

function stopAnvil(proc: ChildProcess): Promise<void> {
  return new Promise((resolvePromise) => {
    if (proc.killed || proc.exitCode !== null) {
      resolvePromise();
      return;
    }
    proc.on('exit', () => resolvePromise());
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }, 5000).unref();
  });
}
