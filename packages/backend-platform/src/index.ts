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
  Message,
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
  WebSocketServiceMessenger,
  WebSocketState,
  WebSocketEventType,
} from './WebsocketService';