#!/usr/bin/env node
// Assembles .auto/bench/bundle.js — a single self-contained script the
// Hermes CLI can execute with no `require` and no Node APIs.
//
// esbuild (JS API and CLI) deadlocks in this sandbox, so this builder works
// entirely in-process:
//
//   1. The CANDIDATE is transpiled fresh from the LIVE production file
//      (packages/assets-controller/src/utils/getAssetIdsForMetadataFetch.ts)
//      on every invocation — a measurement can never use a stale copy.
//   2. The ORIGINAL is transpiled from the immutable snapshot at
//      .auto/bench/original/getAssetIdsForMetadataFetch.ts (SHA-pinned in
//      .auto/bench/original/SHA256SUM; tampering fails the build).
//   3. isStakingContractAssetId is transpiled from the REAL production
//      dependency source
//      (packages/assets-controller/src/data-sources/evm-rpc-services/utils/
//       staking-contracts.ts).
//   4. @metamask/utils / @metamask/byte-utils / @metamask/controller-utils
//      symbols come verbatim from .auto/bench/vendor/deps-body.js (compiled
//      code shipped by MetaMask Mobile, SHA-pinned in
//      .auto/bench/vendor/SHA256SUM).
//
// Modules are wired through a tiny closed registry (`__req`) with a fixed,
// known specifier set; any unresolved `require(` fails the build.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const benchDir = path.join(repoRoot, '.auto', 'bench');
const bundlePath = path.join(benchDir, 'bundle.js');

const livePath = path.join(
  repoRoot,
  'packages/assets-controller/src/utils/getAssetIdsForMetadataFetch.ts',
);
const originalPath = path.join(benchDir, 'original', 'getAssetIdsForMetadataFetch.ts');
const originalShaPath = path.join(benchDir, 'original', 'SHA256SUM');
const stakingPath = path.join(
  repoRoot,
  'packages/assets-controller/src/data-sources/evm-rpc-services/utils/staking-contracts.ts',
);
const vendorBodyPath = path.join(benchDir, 'vendor', 'deps-body.js');
const vendorShaPath = path.join(benchDir, 'vendor', 'SHA256SUM');
const inputsPath = path.join(benchDir, 'inputs.js');
const driverPath = path.join(benchDir, 'workload.js');

// ---- Immutable-source guards ----
function verifySha(file, shaFile, label) {
  const pinned = fs.readFileSync(shaFile, 'utf8').trim();
  const actual = createHash('sha256').update(fs.readFileSync(file, 'utf8')).digest('hex');
  if (pinned !== actual) {
    console.error(`build: ${label} was modified (sha256 ${actual}, pinned ${pinned}).`);
    process.exit(1);
  }
}
verifySha(originalPath, originalShaPath, 'the original implementation snapshot');
verifySha(vendorBodyPath, vendorShaPath, 'the vendored dependency block');

// ---- In-process TypeScript transpilation (worktree's own compiler) ----
const require = createRequire(import.meta.url);
const ts = require(path.join(repoRoot, 'node_modules', 'typescript'));

function transpile(source, fileName) {
  const out = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018,
    },
  });
  return out.outputText;
}

// Specifiers transpiled CommonJS may reference, mapped to registry ids.
const SPECIFIER_MAP = new Map([
  ['@metamask/utils', 'vendor:deps'],
  ['@metamask/controller-utils', 'vendor:deps'],
  ['../data-sources/evm-rpc-services/index.js', 'app:staking'],
]);

function rewriteRequires(transpiled, label) {
  let out = transpiled;
  for (const [specifier, id] of SPECIFIER_MAP) {
    out = out.split(`require("${specifier}")`).join(`__req("${id}")`);
  }
  const unresolved = out.match(/require\(/);
  if (unresolved) {
    const around = out.slice(Math.max(0, out.indexOf('require(') - 60), out.indexOf('require(') + 80);
    console.error(`build: ${label} still references require() (unknown specifier):\n  ${around}`);
    process.exit(1);
  }
  return out;
}

const candidateSource = fs.readFileSync(livePath, 'utf8');
const originalSource = fs.readFileSync(originalPath, 'utf8');
const stakingSource = fs.readFileSync(stakingPath, 'utf8');
const vendorBody = fs.readFileSync(vendorBodyPath, 'utf8');

const candidateModule = rewriteRequires(
  transpile(candidateSource, 'candidate.ts'),
  'candidate (live production file)',
);
const originalModule = rewriteRequires(
  transpile(originalSource, 'original.ts'),
  'original (immutable snapshot)',
);
const stakingModule = rewriteRequires(
  transpile(stakingSource, 'staking-contracts.ts'),
  'staking-contracts dependency',
);

// Vendored dependency module: the verbatim compiled blocks plus the export
// wiring for the names the transpiled modules consume.
const vendorExports = [
  'parseCaipAssetType',
  'isCaipAssetType',
  'isCaipChainId',
  'isCaipNamespace',
  'isCaipReference',
  'isStrictHexString',
  'toCaipChainId',
  'KnownCaipNamespace',
  'convertHexToDecimal',
];
const vendorModule =
  vendorBody +
  '\n' +
  vendorExports.map((name) => `exports.${name} = ${name};`).join('\n') +
  '\n';

// Inputs module: plain JS with a single `export function buildInputSet`.
const inputsSource = fs.readFileSync(inputsPath, 'utf8');
const inputsModule =
  inputsSource.replace(/^export function buildInputSet/m, 'function buildInputSet') +
  '\nexports.buildInputSet = buildInputSet;\n';
if (inputsModule === inputsSource) {
  console.error('build: inputs.js no longer matches the expected export shape');
  process.exit(1);
}

// Driver: plain JS, no imports; receives the registry function as __req.
const driverSource = fs.readFileSync(driverPath, 'utf8');

const bundle = `// AUTO-GENERATED by .auto/bench/build.mjs — do not edit.
// Candidate transpiled from the live production source at build time:
//   sha256(candidate) = ${createHash('sha256').update(candidateSource).digest('hex')}
// Runs under: hermes -O .auto/bench/bundle.js
var __mm = (function () {
  var modules = {
    'vendor:deps': function (exports, __req) {
${vendorModule}
    },
    'app:staking': function (exports, __req) {
${stakingModule}
    },
    'app:original': function (exports, __req) {
${originalModule}
    },
    'app:candidate': function (exports, __req) {
${candidateModule}
    },
    'bench:inputs': function (exports, __req) {
${inputsModule}
    },
  };
  var cache = {};
  function req(id) {
    var hit = cache[id];
    if (hit) {
      return hit.exports;
    }
    var module = { exports: {} };
    cache[id] = module;
    modules[id](module.exports, req);
    return module.exports;
  }
  return req;
})();
(function (__req) {
${driverSource}
})(__mm);
`;

fs.writeFileSync(bundlePath, bundle);
process.stdout.write(
  `build: wrote ${path.relative(repoRoot, bundlePath)} (candidate sha256 ${createHash('sha256')
    .update(candidateSource)
    .digest('hex')
    .slice(0, 12)})\n`,
);
