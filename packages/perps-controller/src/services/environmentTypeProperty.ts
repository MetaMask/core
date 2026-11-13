import { PERPS_EVENT_PROPERTY } from '../constants/eventNames.js';
import type { PerpsAnalyticsProperties } from '../types/index.js';

/**
 * Copy an optional UI surface onto an analytics property bag.
 * The key is omitted when the caller did not pass a surface.
 *
 * @param environmentType - Caller surface, when the client has one.
 * @returns The property bag to spread into an event.
 */
export function environmentTypeProperty(
  environmentType: string | undefined,
): PerpsAnalyticsProperties {
  if (environmentType === undefined) {
    return {};
  }
  return {
    [PERPS_EVENT_PROPERTY.ENVIRONMENT_TYPE]: environmentType,
  };
}
