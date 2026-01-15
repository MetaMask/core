import type { AnalyticsPrivacyControllerState } from './AnalyticsPrivacyController';

/**
 * Selects the data recorded flag from the controller state.
 *
 * @param state - The controller state
 * @returns Whether data has been recorded since the last deletion request
 */
const selectDataRecorded = (
  state: AnalyticsPrivacyControllerState,
): boolean => state.dataRecorded;

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
 * Selects the delete regulation creation date from the controller state.
 *
 * @param state - The controller state
 * @returns The deletion date in DD/MM/YYYY format, or undefined if not set
 */
const selectDeleteRegulationDate = (
  state: AnalyticsPrivacyControllerState,
): string | undefined => state.deleteRegulationDate ?? undefined;

/**
 * Selectors for the AnalyticsPrivacyController state.
 * These can be used with Redux or directly with controller state.
 */
export const analyticsPrivacyControllerSelectors = {
  selectDataRecorded,
  selectDeleteRegulationId,
  selectDeleteRegulationDate,
};
