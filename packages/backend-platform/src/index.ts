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
  WebSocketServiceOptions,
  WebSocketMessage,
  WebSocketConnectionInfo,
  WebSocketSubscription,
  InternalSubscription,
  SubscriptionInfo,
  WebSocketServiceActions,
  WebSocketServiceInitAction,
  WebSocketServiceConnectAction,
  WebSocketServiceDisconnectAction,
  WebSocketServiceSendMessageAction,
  WebSocketServiceSendRequestAction,
  WebSocketServiceGetConnectionInfoAction,
  WebSocketServiceGetSubscriptionByChannelAction,
  WebSocketServiceIsChannelSubscribedAction,
  WebSocketServiceAllowedActions,
  WebSocketServiceAllowedEvents,
  WebSocketServiceMessenger,
  WebSocketServiceEvents,
  WebSocketServiceConnectionStateChangedEvent,
  WebSocketState,
  WebSocketEventType,
} from './WebsocketService';
export { WebSocketService } from './WebsocketService';

// Account Activity Service
export type {
  AccountSubscription,
  AccountActivityServiceOptions,
  AccountActivityServiceSubscribeAccountsAction,
  AccountActivityServiceUnsubscribeAccountsAction,
  AccountActivityServiceActions,
  AccountActivityServiceAllowedActions,
  AccountActivityServiceAllowedEvents,
  AccountActivityServiceAccountSubscribedEvent,
  AccountActivityServiceAccountUnsubscribedEvent,
  AccountActivityServiceTransactionUpdatedEvent,
  AccountActivityServiceBalanceUpdatedEvent,
  AccountActivityServiceSubscriptionErrorEvent,
  AccountActivityServiceWebSocketConnectedEvent,
  AccountActivityServiceWebSocketDisconnectedEvent,
  AccountActivityServiceEvents,
  AccountActivityServiceMessenger,
} from './AccountActivityService';
export {
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS,
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS,
} from './AccountActivityService';
export { AccountActivityService } from './AccountActivityService';
