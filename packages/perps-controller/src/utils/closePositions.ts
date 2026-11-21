import type { ClosePositionsParams } from '../types/index.js';

/**
 * Normalized close selector. A supplied `targets` list is authoritative, so an
 * empty one selects nothing; a legacy omitted or empty `symbols` list is close-all.
 */
export type CloseSelection =
  | { kind: 'all' }
  | { kind: 'none' }
  | {
      kind: 'targets';
      targets: NonNullable<ClosePositionsParams['targets']>;
    }
  | { kind: 'symbols'; symbols: string[] };

/**
 * Resolve targets > closeAll > non-empty symbols > all in one place.
 *
 * @param params - The caller's close selectors.
 * @returns The winning selector, including an explicit empty target list.
 */
export function resolveCloseSelection(
  params: ClosePositionsParams,
): CloseSelection {
  if (params.targets !== undefined) {
    return params.targets.length === 0
      ? { kind: 'none' }
      : { kind: 'targets', targets: params.targets };
  }
  if (
    params.closeAll !== true &&
    params.symbols !== undefined &&
    params.symbols.length > 0
  ) {
    return { kind: 'symbols', symbols: params.symbols };
  }
  return { kind: 'all' };
}
