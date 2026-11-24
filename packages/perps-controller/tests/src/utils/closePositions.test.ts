import { describe, expect, it } from 'vitest';

import type { ClosePositionsParams } from '../../../src/types/index.js';
import { resolveCloseSelection } from '../../../src/utils/closePositions.js';

const targets = [{ symbol: 'BTC', providerId: 'lighter' as const }];

describe('resolveCloseSelection', () => {
  it.each([
    [{}, { kind: 'all' }],
    [{ closeAll: true }, { kind: 'all' }],
    [{ closeAll: false }, { kind: 'all' }],
    [{ symbols: [] }, { kind: 'all' }],
    [{ targets: [] }, { kind: 'none' }],
    [{ targets: [], closeAll: true }, { kind: 'none' }],
    [{ closeAll: true, symbols: ['BTC'] }, { kind: 'all' }],
    [{ symbols: ['BTC'] }, { kind: 'symbols', symbols: ['BTC'] }],
    [
      { closeAll: false, symbols: ['BTC'] },
      { kind: 'symbols', symbols: ['BTC'] },
    ],
    [{ targets: [], symbols: ['ETH'] }, { kind: 'none' }],
    [
      { targets, closeAll: true, symbols: ['ETH'] },
      { kind: 'targets', targets },
    ],
  ] satisfies [ClosePositionsParams, unknown][])(
    'resolves %j to %j',
    (params, expected) => {
      expect(resolveCloseSelection(params)).toStrictEqual(expected);
    },
  );
});
