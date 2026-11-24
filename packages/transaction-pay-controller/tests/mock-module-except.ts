import { vi } from 'vitest';

/**
 * Builds a `vi.mock` factory result that replaces every function a module
 * exports with `vi.fn()`, except the ones listed in `keep`, which stay real.
 * This stands in for Jest's `createMockFromModule` plus `requireActual`.
 *
 * @param actual - The real module, from `importOriginal()`.
 * @param keep - The exports to leave unmocked.
 * @returns The partially mocked module.
 */
export function mockModuleExcept<Module extends Record<string, unknown>>(
  actual: Module,
  keep: (keyof Module)[],
): Module {
  return Object.fromEntries(
    Object.entries(actual).map(([key, value]) => [
      key,
      typeof value === 'function' && !keep.includes(key) ? vi.fn() : value,
    ]),
  ) as Module;
}
