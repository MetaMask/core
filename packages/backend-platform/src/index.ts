/**
 * @metamask/backend-platform
 *
 * Backend platform utilities and services for MetaMask.
 */

// Export common types and utilities
export type {
  // Keyring-api types
  Transaction,
  TransactionType,
  FeeType,
  AccountBalancesUpdatedEvent,
  AccountBalancesUpdatedEventPayload,
  // Custom types
  TransactionWithKeyringBalanceUpdate,
} from './types';

// Export TransactionStatus from keyring-api with alias to avoid conflicts
export { TransactionStatus as KeyringTransactionStatus } from './types';

// WebSocket Service - following MetaMask Data Services pattern
export type {
  WebSocketServiceOptions,
  WebSocketMessage,
  WebSocketConnectionInfo,
  WebSocketSubscription,
  InternalSubscription,
  SubscriptionInfo,
  WebSocketServiceActions,
  WebSocketServiceConnectAction,
  WebSocketServiceDisconnectAction,
  WebSocketServiceSendMessageAction,
  WebSocketServiceSendRequestAction,
  WebSocketServiceGetConnectionInfoAction,
  WebSocketServiceMessenger,
} from './websocket-service';

export {
  WebSocketService,
  WebSocketState,
  WebSocketEventType,
} from './websocket-service';

// Account Activity Service
export type {
  AccountSubscription,
  AccountActivityServiceOptions,
  AccountActivityServiceActions,
  AccountActivityServiceSubscribeAccountsAction,
  AccountActivityServiceUnsubscribeAccountsAction,
  AccountActivityServiceEvents,
  AccountActivityServiceAccountSubscribedEvent,
  AccountActivityServiceAccountUnsubscribedEvent,
  AccountActivityServiceTransactionUpdatedEvent,
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceSubscriptionErrorEvent,
  AccountActivityServiceMessenger,
} from './account-activity-service';

export {
  AccountActivityService,
} from './account-activity-service';
