import { processSnapNotification } from './process-snap-notifications';
import type { INotification } from '..';
import { TRIGGER_TYPES } from '../constants';
import { createMockSnapNotification } from '../mocks';

describe('process-snap-notifications - processSnapNotification()', () => {
  it('processes a Raw Snap Notification to a shared Notification Type', () => {
    const rawNotification = createMockSnapNotification();
    const result = processSnapNotification(rawNotification) as Extract<
      INotification,
      { type: TRIGGER_TYPES.SNAP }
    >;

    expect(result.type).toBe(TRIGGER_TYPES.SNAP);
    expect(result.isRead).toBe(false);
    expect(result.data).toBeDefined();
    expect(result.readDate).toBeNull();
  });
});
