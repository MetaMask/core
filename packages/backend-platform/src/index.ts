/**
 * @file Backend platform utilities and services for MetaMask.
 */

// No additional common types currently exported

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
} from './WebsocketService';

export {
  WebSocketService,
  WebSocketState,
  WebSocketEventType,
} from './WebsocketService';
