import { Messenger } from '@metamask/base-controller';
import type { WebSocketServiceMessenger } from './websocket-service';
import { WebSocketService, WebSocketState } from './websocket-service';

/**
 * Basic test suite for WebSocketService
 * 
 * Note: This test suite is simplified to avoid complex WebSocket mocking issues
 * In a real implementation, you would use proper WebSocket mocking libraries
 */
describe('WebSocketService', () => {
  let messenger: WebSocketServiceMessenger;

  beforeEach(() => {
    // Create messenger for testing
    const globalMessenger = new Messenger();
    messenger = globalMessenger.getRestricted({
      name: 'WebSocketService',
      allowedActions: [],
      allowedEvents: [],
    });
  });

  describe('constructor', () => {
    it('should create a WebSocket service with required options', () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
      });

      expect(service).toBeInstanceOf(WebSocketService);
      expect(service.getConnectionInfo().state).toBe(WebSocketState.DISCONNECTED);
      expect(service.getConnectionInfo().url).toBe('wss://test.example.com');
    });

    it('should support optional configuration', () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
        timeout: 5000,
        maxReconnectAttempts: 5,
        authToken: 'test-token',
      });

      const connectionInfo = service.getConnectionInfo();
      expect(connectionInfo.state).toBe(WebSocketState.DISCONNECTED);
      expect(connectionInfo.url).toBe('wss://test.example.com');
    });

    it('should support deprecated callback options', () => {
      const onBreakCallback = jest.fn();
      const onDegradedCallback = jest.fn();

      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
        onBreak: onBreakCallback,
        onDegraded: onDegradedCallback,
      });

      expect(service).toBeInstanceOf(WebSocketService);
    });
  });

  describe('getConnectionInfo', () => {
    it('should return connection information', () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
        maxReconnectAttempts: 3,
      });

      const info = service.getConnectionInfo();

      expect(info.state).toBe(WebSocketState.DISCONNECTED);
      expect(info.url).toBe('wss://test.example.com');
      expect(info.reconnectAttempts).toBe(0);
      expect(info.lastError).toBeUndefined();
      expect(info.connectedAt).toBeUndefined();
    });
  });

  describe('service policy integration', () => {
    it('should provide policy callback methods', () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
      });

      expect(typeof service.onBreak).toBe('function');
      expect(typeof service.onDegraded).toBe('function');
      expect(typeof service.onRetry).toBe('function');
    });

    it('should register policy callbacks and return disposables', () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
      });

      const breakCallback = jest.fn();
      const degradedCallback = jest.fn();
      const retryCallback = jest.fn();

      const unsubscribeBreak = service.onBreak(breakCallback);
      const unsubscribeDegraded = service.onDegraded(degradedCallback);
      const unsubscribeRetry = service.onRetry(retryCallback);

      expect(unsubscribeBreak).toHaveProperty('dispose');
      expect(unsubscribeDegraded).toHaveProperty('dispose');
      expect(unsubscribeRetry).toHaveProperty('dispose');
    });
  });

  describe('event emitter functionality', () => {
    it('should extend EventEmitter', () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
      });

      expect(typeof service.on).toBe('function');
      expect(typeof service.off).toBe('function');
      expect(typeof service.emit).toBe('function');
    });

    it('should allow registering event listeners', () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
      });

      const callback = jest.fn();
      service.on('test-event', callback);

      // Emit test event
      service.emit('test-event', { data: 'test' });

      expect(callback).toHaveBeenCalledWith({ data: 'test' });
    });
  });

  describe('disconnect when not connected', () => {
    it('should handle disconnect when already disconnected', async () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
      });

      // Should not throw when disconnecting while already disconnected
      await expect(service.disconnect()).resolves.toBeUndefined();
      expect(service.getConnectionInfo().state).toBe(WebSocketState.DISCONNECTED);
    });
  });

  describe('sendMessage when not connected', () => {
    it('should throw error when sending message while disconnected', async () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
      });

      await expect(service.sendMessage({ type: 'test' }))
        .rejects.toThrow('Cannot send message: WebSocket is disconnected');
    });
  });

  describe('sendRequest when not connected', () => {
    it('should throw error when sending request while disconnected', async () => {
      const service = new WebSocketService({
        messenger,
        url: 'wss://test.example.com',
      });

      await expect(service.sendRequest({ type: 'test' }))
        .rejects.toThrow('Cannot send request: WebSocket is disconnected');
    });
  });
});

/*
 * Note: Integration tests with actual WebSocket connections would require
 * a proper test environment with WebSocket servers. The tests above focus
 * on the service's public API and basic functionality without requiring
 * complex WebSocket mocking.
 * 
 * For full integration testing, consider:
 * 1. Using ws or similar library to create test WebSocket servers
 * 2. Testing with actual WebSocket connections in a controlled environment
 * 3. Using more sophisticated mocking libraries like jest-websocket-mock
 */ 