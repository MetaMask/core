import {
  createServicePolicy,
  successfulFetch,
} from '@metamask/controller-utils';

import type { OrderInput } from '../types';

export const PERPS_API = 'https://perps.api.cx.metamask.io';
export const PERPS_API_CREATE_ORDERS = `${PERPS_API}/api/v1/orders`;

/**
 * Sends a perp order to our API to create a perp order subscription
 *
 * @param bearerToken - JWT for authentication
 * @param orderInput - order input shape
 */
export async function createPerpOrderNotification(
  bearerToken: string,
  orderInput: OrderInput,
) {
  try {
    await createServicePolicy().execute(async () => {
      // console.log('called');
      return successfulFetch(PERPS_API_CREATE_ORDERS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(orderInput),
      });
    });
  } catch (e) {
    console.error('Failed to create perp order notification', e);
  }
}
