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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInThisContext } from 'node:vm';

import type {
  LighterCreateClientParams,
  LighterCreateClientResult,
  LighterSignerBridge,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';

type WasmInvocation = {
  function: string;
  params: unknown[];
};

type RawCreateClientResult = LighterCreateClientResult & {
  prv?: string;
};

type GoInstance = {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
};

type GoRuntime = new () => GoInstance;

type NodeWasmBridgeOptions = {
  /** Client-owned seed retained only inside this signer adapter. */
  clientSeed: string;
};

// Match the v1.0.13 artifact pins in build-wasm.sh.
const WASM_SHA256 =
  '6caf0765a6f993bff0bd25ff4553ba8ea5657d0a6b85c767aae44ac5dcf17de9';
const RUNTIME_SHA256 =
  '0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14';

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
 * Verify and instantiate the WASM signer, then return a bridge over its globals.
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
  const wasmPath = join(wasmDir, 'main.wasm');
  const runtimePath = join(wasmDir, 'wasm_exec.js');
  const [wasmBytes, runtimeBytes] = await Promise.all([
    readFile(wasmPath),
    readFile(runtimePath),
  ]);
  for (const [path, bytes, expected] of [
    [wasmPath, wasmBytes, WASM_SHA256],
    [runtimePath, runtimeBytes, RUNTIME_SHA256],
  ] as const) {
    if (createHash('sha256').update(bytes).digest('hex') !== expected) {
      throw new Error(
        `${path} SHA-256 mismatch. Rebuild this directory with build-wasm.sh.`,
      );
    }
  }

  // Evaluate the verified runtime even if the process already has a Go global.
  runInThisContext(runtimeBytes.toString('utf8'), { filename: runtimePath });
  const globals = globalThis as Record<string, unknown>;
  const GoClass = globals.Go as GoRuntime;
  const go = new GoClass();
  const { instance } = await globalThis.WebAssembly.instantiate(
    new Uint8Array(wasmBytes),
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

  const invoke = async <Result>(call: WasmInvocation): Promise<Result> => {
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

  const execute = async <Operation extends LighterSignerOperation>(
    call: LighterWasmCall<Operation>,
  ): Promise<LighterSignerResult<Operation>> =>
    await invoke<LighterSignerResult<Operation>>(call);

  return {
    createClient: async (
      params: LighterCreateClientParams,
    ): Promise<LighterCreateClientResult> => {
      const created = await invoke<RawCreateClientResult>({
        function: '_createClient',
        params: [
          options.clientSeed,
          params.chainId,
          params.accountIndex,
          params.nonce,
          params.apiKeyIndex,
        ],
      });
      return {
        success: created.success,
        pk: created.pk,
        pubKeySuccess: created.pubKeySuccess,
        body: created.body,
        ...(created.error === undefined ? {} : { error: created.error }),
      };
    },
    execute,
  };
}
