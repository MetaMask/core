// `cockatiel` is published as ESM only, and the package tests run as CommonJS.
// Jest can only `require()` an ES module on Node 24.9+, where the synchronous
// vm module APIs exist, so on Node 22 a plain `import` from a test file fails.
//
// Loading it here instead works on both, because this file is ESM and Jest
// loads it through its asynchronous ESM loader (enabled by
// `--experimental-vm-modules`). It stays inside the test sandbox, so fake
// timers and `instanceof` behave as they would for any other module.
//
// `tests/cockatiel.cjs` hands this namespace to anything that imports
// `cockatiel`; see the `moduleNameMapper` entry in `jest.config.packages.cjs`.
//
// The import below deliberately points at the real entry point rather than at
// `cockatiel`, which `moduleNameMapper` would send straight back here.
import * as cockatiel from 'cockatiel/dist/index.js';

globalThis.__cockatiel__ = cockatiel;
