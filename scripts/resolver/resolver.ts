import type { ResolveHook } from 'module';
import type { ResolveFnOutput } from 'node:module';

/**
 * A mapping of package names to their source file paths. This is used t
 * override the default resolution of certain packages to point to their source
 * files instead of the compiled JavaScript files.
 */
const PACKAGE_SOURCE_OVERRIDES: Record<string, string> = {
  '@metamask/utils': '../../packages/utils/src/index.ts',
  '@metamask/utils/node': '../../packages/utils/src/node.ts',
};

/**
 * Custom resolver hook for Node.js that:
 *
 * 1. Attempts to resolve TypeScript files when a JavaScript file is requested.
 * 2. Overrides certain package resolutions to point to their source files
 *    instead of the compiled JavaScript files.
 *
 * @param specifier - The module specifier to resolve.
 * @param context - The resolver hook context.
 * @param nextResolve - The next resolver hook function to call.
 * @returns The result of the resolution.
 */
export const resolve: ResolveHook = async (
  specifier,
  context,
  nextResolve,
): Promise<ResolveFnOutput> => {
  const sourceOverride = PACKAGE_SOURCE_OVERRIDES[specifier];
  if (sourceOverride) {
    return await nextResolve(
      new URL(sourceOverride, import.meta.url).href,
      context,
    );
  }

  if (
    specifier.endsWith('.js') &&
    (specifier.startsWith('./') || specifier.startsWith('../'))
  ) {
    const tsSpecifier = `${specifier.slice(0, -3)}.ts`;
    try {
      return await nextResolve(tsSpecifier, context);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ERR_MODULE_NOT_FOUND'
      ) {
        return await nextResolve(specifier, context);
      }

      throw error;
    }
  }

  return await nextResolve(specifier, context);
};
