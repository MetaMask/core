import type { Messenger } from '@metamask/messenger';
import type {
  AnalyticsControllerActions,
  AnalyticsControllerEvents,
} from './actions';

/**
 * Messenger type for the {@link AnalyticsController}.
 */
export type AnalyticsControllerMessenger = Messenger<
  'AnalyticsController',
  AnalyticsControllerActions,
  AnalyticsControllerEvents
>;

