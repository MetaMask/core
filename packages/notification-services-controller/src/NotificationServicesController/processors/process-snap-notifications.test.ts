import { TRIGGER_TYPES } from '../constants/index.js';
import type { INotification } from '../index.js';
import { createMockSnapNotification } from '../mocks/index.js';
import { processSnapNotification } from './process-snap-notifications.js';

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
