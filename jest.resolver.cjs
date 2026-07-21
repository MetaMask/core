/* eslint-disable import-x/unambiguous, n/no-sync */
'use strict';

const { join, resolve } = require('path');
const { existsSync, statSync } = require('fs');

const REPO_ROOT = resolve(__dirname);
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

/**
 * Custom Jest resolver that redirects `@metamask/*` imports to monorepo source
 * when the package exists locally, and falls back to default resolution (which
 * honours the package `exports` field) for external packages.
 *
 * Without this, the `moduleNameMapper` fallback returns a directory path for
 * external `@metamask/*` packages. Jest then uses `main` (CJS) rather than
 * `exports.import` (ESM), causing class-inheritance failures at runtime.
 *
 * @param {string} moduleName - The module name to resolve.
 * @param {object} options - Jest resolver options including `defaultResolver`.
 * @returns {string} The resolved module path.
 */
module.exports = function resolver(moduleName, options) {
  const { basedir, defaultResolver } = options;

  // Skip the monorepo redirect when the import originates from an external
  // package in node_modules. Those packages use CJS require() and cannot load
  // ESM TypeScript source files — they must resolve against published dist.
  const isFromNodeModules =
    basedir !== undefined && basedir.includes('/node_modules/');

  const match =
    !isFromNodeModules && /^@metamask\/([^/]+)(\/.*)?$/u.exec(moduleName);

  if (match) {
    const [, pkgName, subPath = ''] = match;
    const srcDir = join(PACKAGES_DIR, pkgName, 'src');

    if (existsSync(srcDir)) {
      let target = subPath ? join(srcDir, subPath) : join(srcDir, 'index.ts');
      // If the resolved target is a directory, look for its index file.
      if (existsSync(target) && statSync(target).isDirectory()) {
        target = join(target, 'index.ts');
      }

      return defaultResolver(target, options);
    }
  }

  // External package — use default resolver, which honours `exports` fields.
  return defaultResolver(moduleName, options);
};
