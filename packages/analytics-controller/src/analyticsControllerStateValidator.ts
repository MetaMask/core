import { validate as validateUuid, version as getUuidVersion } from 'uuid';

import type { AnalyticsControllerState } from './AnalyticsController';

/**
 * Validates that the analytics state has a valid UUIDv4 analyticsId.
 *
 * @param state - The analytics controller state to validate
 * @throws {Error} If analyticsId is missing, invalid, or not a UUIDv4
 */
export function validateAnalyticsControllerState(
  state: AnalyticsControllerState,
): void {
  if (
    !state.analyticsId ||
    !validateUuid(state.analyticsId) ||
    getUuidVersion(state.analyticsId) !== 4
  ) {
    throw new Error(
      `Invalid analyticsId: expected a valid UUIDv4, but got ${JSON.stringify(state.analyticsId)}`,
    );
  }
}
