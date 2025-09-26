/**
 * @file Backend platform services for MetaMask.
 */

// Transaction and balance update types
export type {
  Transaction,
  Asset,
  Balance,
  Transfer,
  BalanceUpdate,
  AccountActivityMessage,
} from './types';

// WebSocket Service - following MetaMask Data Services pattern
export type {
  BackendWebSocketServiceOptions,
  WebSocketMessage,
  WebSocketConnectionInfo,
  WebSocketSubscription,
  BackendWebSocketServiceActions,
  BackendWebSocketServiceAllowedActions,
  BackendWebSocketServiceAllowedEvents,
  BackendWebSocketServiceMessenger,
  BackendWebSocketServiceEvents,
  BackendWebSocketServiceConnectionStateChangedEvent,
  WebSocketState,
  WebSocketEventType,
} from './BackendWebSocketService';
export { BackendWebSocketService } from './BackendWebSocketService';

// Account Activity Service
export type {
  AccountSubscription,
  AccountActivityServiceOptions,
  AccountActivityServiceActions,
  AccountActivityServiceAllowedActions,
  AccountActivityServiceAllowedEvents,
  AccountActivityServiceTransactionUpdatedEvent,
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceSubscriptionErrorEvent,
  AccountActivityServiceStatusChangedEvent,
  AccountActivityServiceEvents,
  AccountActivityServiceMessenger,
} from './AccountActivityService';
export {
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS,
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS,
} from './AccountActivityService';
export { AccountActivityService } from './AccountActivityService';
