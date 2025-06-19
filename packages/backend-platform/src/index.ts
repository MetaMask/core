/**
 * @metamask/backend-platform
 *
 * Backend platform utilities and services for MetaMask.
 */

// Export common types and utilities
export type {
  BackendConfig,
  BackendResponse,
  // Keyring-api types
  Transaction,
  TransactionType,
  FeeType,
  AccountBalancesUpdatedEvent,
  AccountBalancesUpdatedEventPayload,
  // Custom types
  TransactionWithKeyringBalanceUpdate,
  TransactionConfirmationMessage,
} from './types';

// Export TransactionStatus from keyring-api with alias to avoid conflicts
export { TransactionStatus as KeyringTransactionStatus } from './types';

export {
  isTransactionWithKeyringBalanceUpdate,
  TransactionUtils,
} from './types';

export * from './utils';
// WebSocket Service - following MetaMask Data Services pattern
export type {
  WebSocketServiceOptions,
  WebSocketMessage,
  WebSocketConnectionInfo,
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

// Price Update Service
export type {
  PriceData,
  PriceSubscription,
  PriceUpdateServiceOptions,
  PriceUpdateServiceActions,
  PriceUpdateServiceSubscribeAction,
  PriceUpdateServiceUnsubscribeAction,
  PriceUpdateServiceGetPricesAction,
  PriceUpdateServiceEvents,
  PriceUpdateServicePriceUpdatedEvent,
  PriceUpdateServiceSubscriptionConfirmedEvent,
  PriceUpdateServiceSubscriptionErrorEvent,
  PriceUpdateServiceMessenger,
} from './price-update-service';

export {
  PriceUpdateService,
} from './price-update-service';

// Account Activity Service
export type {
  AccountSubscription,
  AccountActivityServiceOptions,
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