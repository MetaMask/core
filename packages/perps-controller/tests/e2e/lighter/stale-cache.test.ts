import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..', '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');

describe('Lighter E2E signer cache', () => {
  it('rejects a stale default signer cache before loading either file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lighter-stale-cache-'));
    try {
      const workspace = join(root, 'packages', 'perps-controller');
      const driver = join(workspace, 'tests', 'e2e', 'lighter.e2e.ts');
      const bridgeDir = join(workspace, 'tests', 'e2e', 'lighter');
      const cache = join(root, 'temp', 'lighter-wasm');
      const out = join(root, 'output');
      const preload = join(root, 'offline.mjs');

      await Promise.all([
        mkdir(bridgeDir, { recursive: true }),
        mkdir(cache, { recursive: true }),
      ]);
      await Promise.all([
        copyFile(join(packageRoot, 'tests', 'e2e', 'lighter.e2e.ts'), driver),
        copyFile(
          join(import.meta.dirname, 'nodeWasmBridge.ts'),
          join(bridgeDir, 'nodeWasmBridge.ts'),
        ),
        symlink(
          join(repoRoot, 'node_modules'),
          join(root, 'node_modules'),
          'dir',
        ),
        symlink(join(packageRoot, 'src'), join(workspace, 'src'), 'dir'),
        writeFile(join(workspace, 'package.json'), '{"type":"module"}'),
        writeFile(
          join(cache, 'main.wasm'),
          Buffer.from('0061736d01000000', 'hex'),
        ),
        writeFile(
          join(cache, 'wasm_exec.js'),
          'throw new Error("Stale Go runtime executed");',
        ),
        writeFile(
          preload,
          `
globalThis.fetch = () => { throw new Error('Unexpected venue request'); };
globalThis.WebAssembly.instantiate = () => { throw new Error('Unexpected WASM instantiation'); };
`,
        ),
      ]);

      const result = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--import',
          preload,
          driver,
          '--phase=sign-only',
          '--use-dummy-eth-key',
          `--out=${out}`,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: { TSX_TSCONFIG_PATH: join(packageRoot, 'tsconfig.json') },
          timeout: 15_000,
        },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('main.wasm SHA-256 mismatch');
      expect(
        JSON.parse(await readFile(join(out, 'sign-only.json'), 'utf8')),
      ).toMatchObject({ ok: false });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
