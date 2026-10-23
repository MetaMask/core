import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { defineConfig, mergeConfig } from 'vitest/config';
import type { Plugin } from 'vitest/config';

import baseConfig from '../../vitest.config.packages.js';

// A line that starts with a decorator, e.g. `@trackAssetsLoading`.
const DECORATOR_PATTERN = /^\s*@[A-Za-z_$][\w$]*/mu;

/**
 * Oxc, which Vitest uses to strip types, leaves standard (TC39) decorators in
 * place, and Node cannot run them. The messenger mock imports
 * `@metamask/assets-controller`, whose `AssetsController` uses one, so this
 * plugin compiles any TypeScript module that uses a decorator with TypeScript
 * first, the way ts-jest did. Remove it once Oxc lowers standard decorators,
 * see https://github.com/vitest-dev/vitest/issues/9876.
 *
 * @returns The Vite plugin.
 */
function lowerDecorators(): Plugin {
  return {
    name: 'lower-decorators',
    enforce: 'pre',
    transform(code, id) {
      const fileName = id.split('?')[0] ?? id;
      if (!fileName.endsWith('.ts') || !DECORATOR_PATTERN.test(code)) {
        return null;
      }

      const { outputText, sourceMapText } = ts.transpileModule(code, {
        fileName,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          sourceMap: true,
          target: ts.ScriptTarget.ES2022,
        },
      });

      return sourceMapText === undefined
        ? { code: outputText }
        : { code: outputText, map: sourceMapText };
    },
  };
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [lowerDecorators()],

    test: {
      name: basename(dirname(fileURLToPath(import.meta.url))),

      coverage: {
        thresholds: {
          branches: 99.44,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  }),
);
