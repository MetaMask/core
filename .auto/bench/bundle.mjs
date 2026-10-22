#!/usr/bin/env node
// Playground build step 2: concatenate the tsc-emitted CJS tree in
// .auto/bench/tmp/dist into a single self-contained JS file runnable by the
// Hermes CLI (no require, no filesystem) — .auto/bench/bundle.js.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? process.cwd());
const DIST = path.join(ROOT, '.auto/bench/tmp/dist');
const VENDOR = path.join(ROOT, '.auto/bench/tmp/vendor');
const ENTRY = process.env.BENCH_ENTRY ?? 'app/bench.js';
const ENTRY_BASE = path.basename(ENTRY, '.js'); // e.g. 'bench', 'bench-viem'
const OUT = path.join(ROOT, `.auto/bench/${ENTRY_BASE === 'bench' ? 'bundle.js' : `bundle-${ENTRY_BASE}.js`}`);

const modules = new Map(); // relative posix path (no ext) -> source

function walk(dir, rel, stripPrefix = '') {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(path.join(dir, entry.name), relPath, stripPrefix);
    } else if (entry.name.endsWith('.js')) {
      // vendor files are pre-compiled JS; register verbatim with their
      // vendor-relative key (viem/noble internal requires resolve against
      // those keys).
      const key = stripPrefix
        ? relPath.startsWith(stripPrefix)
          ? relPath.slice(stripPrefix.length)
          : relPath
        : relPath;
      modules.set(key, fs.readFileSync(path.join(dir, entry.name), 'utf8'));
    }
  }
}
walk(DIST, '');
walk(VENDOR, 'vendor', 'vendor/');

if (!modules.has(ENTRY)) {
  throw new Error(`${ENTRY} missing — tsc emit failed?`);
}

const parts = [];
for (const [modPath, src] of modules) {
  parts.push(
    `${JSON.stringify(modPath)}: function (module, exports, require) {\n${src}\n}`,
  );
}

const ALIASES = JSON.parse(
  fs.readFileSync(path.join(ROOT, '.auto/bench/tmp/aliases.json'), 'utf8'),
);

const prelude = `
var __aliases = ${JSON.stringify(ALIASES)};
var __mods = {
${parts.join(',\n')}
};
var __cache = {};
function __norm(p) {
  var segs = p.split('/');
  var out = [];
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    if (s === '' || s === '.') continue;
    if (s === '..') { if (out.length) out.pop(); continue; }
    out.push(s);
  }
  return out.join('/');
}
function __try(path) { return __mods[path] !== undefined ? path : null; }
function __resolve(fromDir, spec) {
  if (__aliases[spec]) return __aliases[spec];
  if (spec.slice(0, 2) === './' || spec.slice(0, 3) === '../') {
    var joined = __norm(fromDir + '/' + spec);
    return __try(joined) || __try(joined + '.js') || __try(joined + '/index.js');
  }
  return __try(spec) || __try(spec + '.js') || __try(spec + '/index.js');
}
function __requireFactory(dir) {
  return function (spec) {
    var key = __resolve(dir, spec);
    if (key === null) throw new Error('Cannot find module "' + spec + '" from ' + dir);
    var cached = __cache[key];
    if (cached) return cached.exports;
    var mod = { exports: {} };
    __cache[key] = mod;
    __mods[key](mod, mod.exports, __requireFactory(key.slice(0, key.lastIndexOf('/'))));
    return mod.exports;
  };
}
var process = { env: {} };
var global = globalThis;
// Minimal Buffer polyfill — @ethersproject/base64 decode runs Buffer.from(str,
// 'base64') at ens-normalize module load (pulled in by abi -> interface).
var __b64abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function __b64lookup(c) {
  if (c >= 65 && c <= 90) return c - 65;
  if (c >= 97 && c <= 122) return c - 97 + 26;
  if (c >= 48 && c <= 57) return c - 48 + 52;
  if (c === 43) return 62;
  if (c === 47) return 63;
  return 255; // padding or invalid
}
var Buffer = {
  from: function (data, enc) {
    if (typeof data === 'string' && enc === 'base64') {
      var out = [];
      var bits = 0, acc = 0, count = 0;
      for (var i = 0; i < data.length; i++) {
        var v = __b64lookup(data.charCodeAt(i));
        if (v === 255) continue;
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          out.push((acc >> bits) & 0xff);
        }
        count++;
      }
      return new Uint8Array(out);
    }
    if (typeof data === 'string') {
    	var bytes = [];
    	for (var j = 0; j < data.length; j++) bytes.push(data.charCodeAt(j) & 0xff);
    	return new Uint8Array(bytes);
    }
    if (data && typeof data.length === 'number') return new Uint8Array(data);
    return new Uint8Array(0);
  },
  isBuffer: function () { return false; },
};
`;

const entry = `${
  process.env.BENCH_BATCH_N ? `globalThis.BENCH_BATCH_N=${process.env.BENCH_BATCH_N};\n` : ''
}${
  process.env.BENCH_RET_BYTES ? `globalThis.BENCH_RET_BYTES=${process.env.BENCH_RET_BYTES};\n` : ''
}__requireFactory('app')('${ENTRY}');\n`;

fs.writeFileSync(OUT, prelude + entry);
console.log(`bundle: ${modules.size} modules -> ${OUT}`);
