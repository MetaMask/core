import { describe, expect, it } from 'vitest';

import { readSystemNotification } from './structs.js';

describe('readSystemNotification', () => {
  it('reads the chains and status', () => {
    expect(
      readSystemNotification({ chainIds: ['eip155:1'], status: 'down' }),
    ).toStrictEqual({ chainIds: ['eip155:1'], status: 'down' });
  });

  it('ignores extra properties', () => {
    expect(
      readSystemNotification({
        chainIds: ['eip155:1'],
        status: 'up',
        timestamp: 1,
        unexpected: { nested: true },
      }),
    ).toStrictEqual({ chainIds: ['eip155:1'], status: 'up' });
  });

  it('leaves out chain ids that are not strings', () => {
    expect(
      readSystemNotification({
        chainIds: ['eip155:1', 5, null, '', 'eip155:137'],
        status: 'down',
      }),
    ).toStrictEqual({ chainIds: ['eip155:1', 'eip155:137'], status: 'down' });
  });

  it.each([
    undefined,
    null,
    'text',
    42,
    {},
    { status: 'up' },
    { chainIds: 'eip155:1', status: 'up' },
    { chainIds: [], status: 'up' },
    { chainIds: [1, null], status: 'up' },
    { chainIds: ['eip155:1'], status: 'degraded' },
    { chainIds: ['eip155:1'] },
  ])('returns undefined without throwing for %j', (data) => {
    expect(readSystemNotification(data)).toBeUndefined();
  });
});
