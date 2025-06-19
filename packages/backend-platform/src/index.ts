/**
 * @metamask/backend-platform
 *
 * Backend platform utilities and services for MetaMask.
 */

// Export types and utilities
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