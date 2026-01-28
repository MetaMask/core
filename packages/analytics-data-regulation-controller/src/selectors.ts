import type { AnalyticsDataRegulationControllerState } from './AnalyticsDataRegulationController';

/**
 * Selects the data recorded flag from the controller state.
 *
 * @param state - The controller state
 * @returns Whether data has been recorded since the last deletion request
 */
const selectHasCollectedDataSinceDeletionRequest = (
  state: AnalyticsDataRegulationControllerState,
): boolean => state.hasCollectedDataSinceDeletionRequest;

/**
 * Selects the delete regulation ID from the controller state.
 *
 * @param state - The controller state
 * @returns The regulation ID, or undefined if not set
 */
const selectDeleteRegulationId = (
  state: AnalyticsDataRegulationControllerState,
): string | undefined => state.deleteRegulationId;

/**
 * Selects the delete regulation creation timestamp from the controller state.
 *
 * @param state - The controller state
 * @returns The deletion timestamp (in milliseconds since epoch), or undefined if not set
 */
const selectDeleteRegulationTimestamp = (
  state: AnalyticsDataRegulationControllerState,
): number | undefined => state.deleteRegulationTimestamp;

/**
 * Selectors for the AnalyticsDataRegulationController state.
 * These can be used with Redux or directly with controller state.
 */
export const analyticsDataRegulationControllerSelectors = {
  selectHasCollectedDataSinceDeletionRequest,
  selectDeleteRegulationId,
  selectDeleteRegulationTimestamp,
};
