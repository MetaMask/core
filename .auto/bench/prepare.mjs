#!/usr/bin/env node
// Playground build step 1: assemble the tmp TS tree for the Hermes bundle.
//
// - Copies the @ethersproject closure (TS sources shipped in src.ts/) into
//   .auto/bench/tmp/src/@ethersproject/<pkg>/ plus js-sha3.
// - Extracts the REAL ABI/encode/decode code from MulticallClient.ts into
//   .auto/bench/tmp/src/app/multicall.ts (markers must stay intact).
// - Copies the stable templates (controller-abi.ts, bench.ts) into tmp/src/app.
// - Writes .auto/bench/tmp/tsconfig.json.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? process.cwd());
const TMP = path.join(ROOT, '.auto/bench/tmp');
const SRC = path.join(TMP, 'src');
const MULTICALL_TS = path.join(
  ROOT,
  'packages/assets-controller/src/data-sources/evm-rpc-services/clients/MulticallClient.ts',
);

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(path.join(SRC, 'app'), { recursive: true });
// Mark the tmp tree as CommonJS so `module: node16` treats every file in it
// as CJS (the repo root package.json is "type": "module" and would otherwise
// win the nearest-package.json lookup) and emits require() calls.
fs.writeFileSync(path.join(TMP, 'package.json'), '{"type": "commonjs"}\n');

const req = createRequire(
  path.join(ROOT, 'packages/assets-controller/package.json'),
);

// ---------------------------------------------------------------------------
// 1. Ethers closure (BFS over package.json dependencies)
// ---------------------------------------------------------------------------

const closure = new Map(); // pkg -> source dir (src.ts)
const queue = ['@ethersproject/abi'];
while (queue.length > 0) {
  const pkg = queue.shift();
  if (closure.has(pkg)) {
    continue;
  }
  const pkgDir = path.dirname(req.resolve(`${pkg}/package.json`));
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'),
  );
  if (pkg === 'js-sha3') {
    closure.set(pkg, path.join(pkgDir, 'src'));
  } else {
    const srcTs = path.join(pkgDir, 'src.ts');
    if (!fs.existsSync(srcTs)) {
      throw new Error(`${pkg} has no src.ts directory`);
    }
    const entry = path.join(srcTs, 'index.ts');
    if (!fs.existsSync(entry)) {
      throw new Error(`${pkg} has no src.ts/index.ts entry`);
    }
    closure.set(pkg, srcTs);
  }
  for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
    if (dep.startsWith('@ethersproject/') || dep === 'js-sha3') {
      queue.push(dep);
    }
  }
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      copyTree(path.join(from, entry.name), path.join(to, entry.name));
    } else if (/\.(ts|js)$/.test(entry.name)) {
      fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
    }
  }
}

for (const [pkg, srcDir] of closure) {
  copyTree(srcDir, path.join(SRC, pkg));
}

// ---------------------------------------------------------------------------
// 1b. Plain-JS vendor packages (bn.js, elliptic, hash.js, ...): copy the
//     directory containing the package main and record a runtime alias
//     (bare spec -> module key) for the bundler. TS `paths` are compile-time
//     only, so emitted code still does require("bn.js") etc.
// ---------------------------------------------------------------------------

const aliases = { 'js-sha3': 'js-sha3/sha3.js' };
const vendored = new Set();
const vendorQueue = [];
function enqueueDeps(pkgJson) {
  for (const dep of Object.keys(pkgJson.dependencies ?? {})) {
    if (
      closure.has(dep) ||
      vendored.has(dep) ||
      vendorQueue.includes(dep) ||
      dep === 'js-sha3'
    ) {
      continue;
    }
    vendorQueue.push(dep);
  }
}
for (const [, srcDir] of closure) {
  enqueueDeps(
    JSON.parse(
      fs.readFileSync(path.join(path.dirname(srcDir), 'package.json'), 'utf8'),
    ),
  );
}
while (vendorQueue.length > 0) {
  const pkg = vendorQueue.shift();
  if (vendored.has(pkg)) {
    continue;
  }
  let pkgDir;
  let pkgJson;
  try {
    pkgDir = path.dirname(req.resolve(`${pkg}/package.json`));
    pkgJson = JSON.parse(
      fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'),
    );
  } catch {
    console.warn(
      `vendor: skipping ${pkg} (unresolvable — fine if unreferenced at runtime)`,
    );
    vendored.add(pkg);
    continue;
  }
  const main = pkgJson.main || 'index.js';
  const mainFile = path.join(pkgDir, main);
  if (!fs.existsSync(mainFile)) {
    console.warn(`vendor: skipping ${pkg} (main ${main} missing)`);
    vendored.add(pkg);
    continue;
  }
  copyTree(path.dirname(mainFile), path.join(SRC, pkg));
  aliases[pkg] = `${pkg}/${path.basename(main)}`;
  vendored.add(pkg);
  enqueueDeps(pkgJson);
}

fs.writeFileSync(
  path.join(TMP, 'aliases.json'),
  JSON.stringify(aliases, null, 2),
);

// ---------------------------------------------------------------------------
// 2. Extract the real encode/decode code from MulticallClient.ts
// ---------------------------------------------------------------------------

const source = fs.readFileSync(MULTICALL_TS, 'utf8');
const lines = source.split('\n');

function findIndex(predicate, what) {
  const i = lines.findIndex(predicate);
  if (i === -1) {
    throw new Error(`MulticallClient.ts marker not found: ${what}`);
  }
  return i;
}

const startA = findIndex(
  (l) => l.startsWith('const MULTICALL3_ABI'),
  'MULTICALL3_ABI',
);
const constantsHeader = findIndex((l) => l === '// CONSTANTS', '// CONSTANTS');
const encodeHeader = findIndex(
  (l) => l === '// ENCODING/DECODING UTILITIES (using @ethersproject/abi)',
  '// ENCODING/DECODING UTILITIES',
);
const clientHeader = findIndex(
  (l) => l === '// MULTICALL CLIENT',
  '// MULTICALL CLIENT',
);

const sliceA = lines.slice(startA, constantsHeader - 1); // up to === above CONSTANTS
const sliceB = lines.slice(encodeHeader - 1, clientHeader - 1); // === above header .. === above CLIENT

const extracted = `// AUTO-GENERATED by .auto/bench/prepare.mjs — DO NOT EDIT
// Extracted (verbatim) from packages/assets-controller/.../MulticallClient.ts
import { Interface } from '@ethersproject/abi';
import { encodeFunctionData } from './controller-abi';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export type Address = \`0x\${string}\`;
export type Hex = \`0x\${string}\`;
export type BalanceOfRequest = { tokenAddress: Address; accountAddress: Address };

${sliceA.join('\n')}

${sliceB.join('\n')}

export {
  encodeBalanceOf,
  encodeGetEthBalance,
  decodeUint256,
  encodeAggregate3,
  decodeAggregate3Response,
  buildAggregate3BalanceCalls,
  multicall3Interface,
  erc20Interface,
};
`;

fs.writeFileSync(path.join(SRC, 'app/multicall.ts'), extracted);

// ---------------------------------------------------------------------------
// 3. Templates (stable, git-tracked) → tmp
// ---------------------------------------------------------------------------

for (const template of ['controller-abi.ts', 'bench.ts']) {
  fs.copyFileSync(
    path.join(ROOT, '.auto/bench/templates', template),
    path.join(SRC, 'app', template),
  );
}

// ---------------------------------------------------------------------------
// 4. tsconfig
// ---------------------------------------------------------------------------

const tsconfig = {
  compilerOptions: {
    target: 'es2019',
    module: 'node16',
    paths: {
      '@ethersproject/*': ['./src/@ethersproject/*/index.ts'],
      'js-sha3': ['./src/js-sha3/sha3.js'],
    },
    allowJs: true,
    checkJs: false,
    outDir: 'dist',
    rootDir: 'src',
    strict: false,
    noImplicitAny: false,
    noEmitOnError: false,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    importHelpers: false,
    esModuleInterop: true,
    resolveJsonModule: true,
    types: [],
  },
  include: ['src/**/*.ts', 'src/**/*.js'],
};

fs.writeFileSync(
  path.join(TMP, 'tsconfig.json'),
  JSON.stringify(tsconfig, null, 2),
);

const pkgs = [...closure.keys()].sort();
console.log(`prepare: closure=${pkgs.length} (${pkgs.join(', ')})`);
