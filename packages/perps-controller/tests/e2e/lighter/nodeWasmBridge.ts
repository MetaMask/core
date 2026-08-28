/**
 * Node adapter for the Lighter Go/WASM signer.
 *
 * Implements the same {@link LighterSignerBridge} seam the mobile WebView
 * bridge implements, but runs the WASM in-process: Go's `wasm_exec.js`
 * runtime is evaluated into globalThis, the module is instantiated, and the
 * ~25 `_xxx` globals it registers are dispatched directly.
 *
 * Call convention (mirrors the reference postMessage host page): each Go
 * global returns a curried function; invoking that returns a Promise.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInThisContext } from 'node:vm';

import type {
  LighterCreateClientResult,
  LighterSignerBridge,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';

type GoInstance = {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
};

type GoRuntime = new () => GoInstance;

type NodeWasmBridgeOptions = {
  /** Client-owned seed retained only inside this signer adapter. */
  clientSeed: string;
};

/**
 * Wait until a predicate holds or time out.
 *
 * @param predicate - Condition to poll.
 * @param timeoutMs - Give up after this many milliseconds.
 * @param label - Description used in the timeout error.
 */
async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Instantiate the WASM signer and return a bridge over its globals.
 *
 * @param wasmDir - Directory holding `main.wasm` + `wasm_exec.js`
 * (produced by build-wasm.sh).
 * @param options - Client-owned signer configuration.
 * @returns A ready signer bridge.
 */
export async function createNodeWasmBridge(
  wasmDir: string,
  options: NodeWasmBridgeOptions,
): Promise<LighterSignerBridge> {
  const globals = globalThis as Record<string, unknown>;

  if (typeof globals.Go !== 'function') {
    const execSource = await readFile(join(wasmDir, 'wasm_exec.js'), 'utf8');
    // wasm_exec.js attaches the Go class to globalThis when evaluated in
    // global scope; vm.runInThisContext keeps that scope.
    runInThisContext(execSource, { filename: 'wasm_exec.js' });
  }

  const GoClass = globals.Go as GoRuntime;
  const go = new GoClass();
  const wasmBytes = new Uint8Array(await readFile(join(wasmDir, 'main.wasm')));
  const { instance } = await globalThis.WebAssembly.instantiate(
    wasmBytes,
    go.importObject,
  );
  // The Go program blocks on a channel forever; run() resolves only on exit.
  go.run(instance).catch((error: unknown) => {
    // Surface unexpected runtime exits; the bridge is dead at this point.
    process.stderr.write(
      `[nodeWasmBridge] Go runtime exited unexpectedly: ${String(error)}\n`,
    );
  });

  await waitFor(
    () => typeof globals._createClient === 'function',
    10_000,
    'WASM signer globals',
  );

  const execute = async <Result>(call: LighterWasmCall): Promise<Result> => {
    const target = globals[call.function];
    if (typeof target !== 'function') {
      throw new Error(`WASM function not registered: ${call.function}`);
    }
    // Go side: fn(...params) returns a function; calling it returns a
    // Promise resolving to the result object (or {error} on failure).
    const curried = (target as (...args: unknown[]) => unknown)(...call.params);
    return typeof curried === 'function'
      ? await (curried as () => Promise<Result>)()
      : await (curried as Promise<Result>);
  };

  return {
    createClient: async (params) =>
      execute<LighterCreateClientResult>({
        function: '_createClient',
        params: [
          options.clientSeed,
          params.chainId,
          params.accountIndex,
          params.nonce,
          params.apiKeyIndex,
        ],
      }),
    execute,
  };
}
