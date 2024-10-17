import { createMockSnapNotification } from '../__fixtures__';
import { TRIGGER_TYPES } from '../constants';
import { processSnapNotification } from './process-snap-notifications';

describe('process-snap-notifications - processSnapNotification()', () => {
  it('processes a Raw Snap Notification to a shared Notification Type', () => {
    const rawNotification = createMockSnapNotification();
    const result = processSnapNotification(rawNotification);

    expect(result.type).toBe(TRIGGER_TYPES.SNAP);
    expect(result.isRead).toBe(false);
    expect(result.data).toBeDefined();
  });
});
