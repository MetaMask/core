import { v4 as uuidv4 } from 'uuid';

import type { NotificationTrigger } from '../utils/utils';

/**
 * Mocking Utility - create a mock Notification Trigger
 *
 * @param override - provide any override configuration for the mock
 * @returns a mock Notification Trigger
 */
export function createMockNotificationTrigger(
  override?: Partial<NotificationTrigger>,
): NotificationTrigger {
  return {
    id: uuidv4(),
    address: '0xFAKE_ADDRESS',
    chainId: '1',
    kind: 'eth_sent',
    enabled: true,
    ...override,
  };
}
