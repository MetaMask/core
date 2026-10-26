#!/usr/bin/env node
// Bench builder for the assets-controller MulticallClient hot path.
//
// Produces:
//   .auto/bench/bundle.js    — single-file Hermes bench, built from the REAL
//                              production source (packages/assets-controller/
//                              src/.../MulticallClient.ts) plus the locked
//                              parity corpus. measure.sh runs this file.
//   .auto/bench/gen-bundle.cjs— Node bundle used ONCE at setup to generate
//                              .auto/bench/parity.js from the ORIGINAL
//                              production implementation (see gen_entry.ts).
//
// Usage (from the repo root):
//   node .auto/bench/build.mjs                # both bundles (default scale 2400)
//   node .auto/bench/build.mjs --scale 600    # bench bundle with N timing calls
//   node .auto/bench/build.mjs --gen-only     # only the generator bundle
//
// Workspace @metamask/* packages resolve to their uncompiled src (the repo's
// tsconfig "paths" use ${configDir}, which esbuild cannot expand, so we alias
// them explicitly here).
import path from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';
import fs from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BENCH = path.join(ROOT, '.auto/bench');

const args = process.argv.slice(2);
const genOnly = args.includes('--gen-only');
let scale = 2400;
{
  const i = args.indexOf('--scale');
  if (i !== -1) scale = Number(args[i + 1]);
}

const ALIAS = {
  '@metamask/controller-utils': path.join(
    ROOT,
    'packages/controller-utils/src/index.ts',
  ),
  '@metamask/utils': path.join(ROOT, 'packages/utils/src/index.ts'),
  '@metamask/type-utils': path.join(ROOT, 'packages/type-utils/src/index.ts'),
};

const BENCH_PRELUDE = `// Hermes CLI environment shims (React Native polyfills these on device):
// AbortController/AbortSignal (cockatiel) and setTimeout (retry delays,
// fired immediately — only non-timed parity batches ever retry).
(function () {
  var g = typeof globalThis === "object" ? globalThis : this;
  if (typeof g.AbortController === "undefined") {
    var makeSignal = function () {
      return {
        aborted: false,
        reason: undefined,
        addEventListener: function () {},
        removeEventListener: function () {},
        throwIfAborted: function () {},
      };
    };
    g.AbortController = function AbortController() {
      this.signal = makeSignal();
      this.abort = function (reason) {
        this.signal.aborted = true;
        this.signal.reason = reason;
      };
    };
  }
  if (typeof g.AbortSignal === "undefined") {
    g.AbortSignal = {
      abort: function () {
        return new g.AbortController().signal;
      },
    };
  }
  if (typeof g.performance === "undefined") {
    g.performance = {
      now: function () {
        return Date.now();
      },
    };
  }
  if (typeof g.setTimeout === "undefined") {
    g.setTimeout = function (fn) {
      fn();
      return 0;
    };
  }
  if (typeof g.clearTimeout === "undefined") {
    g.clearTimeout = function () {};
  }
})();
`;

const common = {
  bundle: true,
  sourcemap: false,
  minify: false,
  logLevel: 'warning',
  alias: ALIAS,
};

// 1) Node generator bundle (writes parity.js). Allowed to use node: modules.
await build({
  ...common,
  platform: 'node',
  format: 'cjs',
  entryPoints: [path.join(BENCH, 'gen_entry.ts')],
  outfile: path.join(BENCH, 'gen-bundle.cjs'),
});

if (!genOnly) {
  // 2) Hermes bench bundle: one IIFE file, no imports, no node APIs.
  await build({
    ...common,
    platform: 'browser',
    format: 'iife',
    target: 'es2018',
    entryPoints: [path.join(BENCH, 'entry.ts')],
    outfile: path.join(BENCH, 'bundle.js'),
    define: { __BENCH_SCALE__: String(scale) },
    banner: { js: BENCH_PRELUDE },
  });
  console.log(`built bundle.js (scale ${scale}) + gen-bundle.cjs`);
  // The MetaMask Mobile hermes-engine CLI (LLVM 8.0.0svn) rejects `class`
  // and `async` SYNTAX even though its runtime has the semantics, so lower
  // the bundle to ES5 with TypeScript after esbuild (esbuild cannot lower
  // `const`, TS can). ES5 code parses and runs fine in this Hermes build.
  const BUNDLE = path.join(BENCH, 'bundle.js');
  const lowered = ts.transpileModule(fs.readFileSync(BUNDLE, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.Preserve,
      downlevelIteration: true,
    },
  });
  fs.writeFileSync(BUNDLE, lowered.outputText);
  console.log('lowered bundle.js to ES5 for the hermes-engine CLI');
} else {
  console.log('built gen-bundle.cjs');
}
