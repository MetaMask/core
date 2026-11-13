import ts from 'typescript';
import type { Plugin } from 'vitest/config';

// A line that starts with a decorator, e.g. `@trackAssetsLoading`.
const DECORATOR_PATTERN = /^\s*@[A-Za-z_$][\w$]*/mu;

/**
 * Oxc, which Vitest uses to strip types, leaves standard (TC39) decorators in
 * place, and Node cannot run them. `AssetsController` in
 * `@metamask/assets-controller` uses one, so packages that load its source add
 * this plugin, which compiles any TypeScript module that uses a decorator with
 * TypeScript first. Remove it once Oxc lowers standard
 * decorators, see https://github.com/vitest-dev/vitest/issues/9876.
 *
 * @returns The Vite plugin.
 */
export function lowerDecorators(): Plugin {
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
