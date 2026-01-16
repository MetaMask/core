import type { AnalyticsPrivacyControllerState } from './AnalyticsPrivacyController';

/**
 * Selects the data recorded flag from the controller state.
 *
 * @param state - The controller state
 * @returns Whether data has been recorded since the last deletion request
 */
const selectDataRecorded = (state: AnalyticsPrivacyControllerState): boolean =>
  state.dataRecorded;

/**
 * Selects the delete regulation ID from the controller state.
 *
 * @param state - The controller state
 * @returns The regulation ID, or undefined if not set
 */
const selectDeleteRegulationId = (
  state: AnalyticsPrivacyControllerState,
): string | undefined => state.deleteRegulationId ?? undefined;

/**
 * Selects the delete regulation creation timestamp from the controller state.
 *
 * @param state - The controller state
 * @returns The deletion timestamp (in milliseconds since epoch), or undefined if not set
 */
const selectDeleteRegulationTimestamp = (
  state: AnalyticsPrivacyControllerState,
): number | undefined => state.deleteRegulationTimestamp ?? undefined;

/**
 * Selectors for the AnalyticsPrivacyController state.
 * These can be used with Redux or directly with controller state.
 */
export const analyticsPrivacyControllerSelectors = {
  selectDataRecorded,
  selectDeleteRegulationId,
  selectDeleteRegulationTimestamp,
};
