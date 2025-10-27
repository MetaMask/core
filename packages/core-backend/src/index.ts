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
  BackendWebSocketServiceMessenger,
  BackendWebSocketServiceEvents,
  BackendWebSocketServiceConnectionStateChangedEvent,
  WebSocketState,
  WebSocketEventType,
} from './BackendWebSocketService';
export { BackendWebSocketService } from './BackendWebSocketService';

// Account Activity Service
export type {
  SubscriptionOptions,
  AccountActivityServiceOptions,
  AccountActivityServiceActions,
  AccountActivityServiceTransactionUpdatedEvent,
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceSubscriptionErrorEvent,
  AccountActivityServiceStatusChangedEvent,
  AccountActivityServiceEvents,
  AccountActivityServiceMessenger,
} from './AccountActivityService';
export { AccountActivityService } from './AccountActivityService';
