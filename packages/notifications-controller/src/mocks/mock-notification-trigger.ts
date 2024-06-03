/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-description */
/* eslint-disable jsdoc/require-jsdoc */
import { v4 as uuidv4 } from 'uuid';

import type { NotificationTrigger } from '../utils/utils';

/**
 *
 * @param override
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
