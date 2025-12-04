import type { OnRampService } from './OnRampService';

/**
 * Gets the user's geolocation based on their IP address.
 */
export type OnRampServiceGetGeolocationAction = {
  type: `OnRampService:getGeolocation`;
  handler: OnRampService['getGeolocation'];
};

/**
 * Union of all OnRampService action types.
 */
export type OnRampServiceMethodActions = OnRampServiceGetGeolocationAction;

