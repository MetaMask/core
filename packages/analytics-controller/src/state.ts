import type { StateMetadata } from '@metamask/base-controller';
import type { AnalyticsControllerState } from './types';

/**
 * Constructs the default {@link AnalyticsController} state.
 *
 * @returns The default {@link AnalyticsController} state.
 */
export const getDefaultAnalyticsControllerState = (): AnalyticsControllerState => ({
  enabled: false,
  optedIn: false,
  analyticsId: null,
  platform: null,
  eventsTracked: 0,
});

/**
 * Metadata configuration for the {@link AnalyticsController}.
 *
 * Defines persistence and anonymity settings for each state property.
 * This is exported for internal use only (not exposed via index.ts).
 */
export const controllerMetadata = {
  enabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  optedIn: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  analyticsId: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  platform: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
  eventsTracked: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
} satisfies StateMetadata<AnalyticsControllerState>;

