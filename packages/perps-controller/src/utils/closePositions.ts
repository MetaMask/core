import type { ClosePositionsParams } from '../types/index.js';

/** Normalized close selector; an omitted or empty `symbols` list is close-all. */
export type CloseSelection =
  | { kind: 'all' }
  | {
      kind: 'targets';
      targets: NonNullable<ClosePositionsParams['targets']>;
    }
  | { kind: 'symbols'; symbols: string[] };

/**
 * Resolve non-empty targets > closeAll > non-empty symbols > all in one place.
 *
 * @param params - The caller's close selectors.
 * @returns The winning selector.
 */
export function resolveCloseSelection(
  params: ClosePositionsParams,
): CloseSelection {
  if (params.targets !== undefined && params.targets.length > 0) {
    return { kind: 'targets', targets: params.targets };
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
