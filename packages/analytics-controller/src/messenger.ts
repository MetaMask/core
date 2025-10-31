import type { Messenger } from '@metamask/messenger';
import type {
  AnalyticsControllerActions,
  AnalyticsControllerEvents,
} from './actions';

/**
 * Actions from other messengers that {@link AnalyticsControllerMessenger} calls.
 */
type AllowedActions = never;

/**
 * Events from other messengers that {@link AnalyticsControllerMessenger} subscribes to.
 */
type AllowedEvents = never;

/**
 * Messenger type for the {@link AnalyticsController}.
 */
export type AnalyticsControllerMessenger = Messenger<
  'AnalyticsController',
  AnalyticsControllerActions | AllowedActions,
  AnalyticsControllerEvents | AllowedEvents
>;

