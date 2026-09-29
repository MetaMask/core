import type { ResolveHook } from 'module';
import type { ResolveFnOutput } from 'node:module';

/**
 * Custom resolver hook for Node.js that attempts to resolve TypeScript files
 * when a JavaScript file is requested.
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
