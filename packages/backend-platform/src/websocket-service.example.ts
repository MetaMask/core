/**
 * @fileoverview
 * WebSocket Service Usage Examples following MetaMask's Data Services pattern
 * 
 * This file demonstrates various usage patterns for the WebSocket service,
 * including basic setup, messenger integration, and advanced features.
 */

import { Messenger } from '@metamask/base-controller';
import type { WebSocketServiceMessenger } from './websocket-service';
import { WebSocketService, WebSocketState, WebSocketEventType } from './websocket-service';

/**
 * Example 1: Basic WebSocket Service Setup following Data Services pattern
 * 
 * This example shows how to create and use a WebSocket service with the
 * MetaMask messaging system.
 */
export async function basicDataServiceExample() {
  console.log('=== Basic Data Service Example ===');

  // Step 1: Create a global messenger
  const globalMessenger = new Messenger();

  // Step 2: Create a restricted messenger for the WebSocket service
  const serviceMessenger: WebSocketServiceMessenger = globalMessenger.getRestricted({
    name: 'WebSocketService',
    allowedActions: [],
    allowedEvents: [],
  });

  // Step 3: Create the WebSocket service (this registers action handlers)
  const service = new WebSocketService({
    messenger: serviceMessenger,
    url: 'wss://echo.websocket.org',
    timeout: 10000,
    maxReconnectAttempts: 3,
  });

  // Step 4: Use the service directly (since messenger actions have type issues)
  try {
    console.log('Connecting to WebSocket...');
    await service.connect();

    console.log('Connection info:', service.getConnectionInfo());

    // Send a message
    await service.sendMessage({
      type: 'echo',
      payload: { message: 'Hello from Data Service!' }
    });

    // Send a request and wait for response
    const response = await service.sendRequest({
      type: 'ping',
      payload: { timestamp: Date.now() }
    });
    console.log('Request response:', response);

  } catch (error) {
    console.error('Service error:', error);
  } finally {
    await service.disconnect();
  }
}

/**
 * Example 2: Using WebSocket Service in a Controller Context
 * 
 * This example shows how a controller would integrate with the WebSocket service.
 */
export class ExampleController {
  #service: WebSocketService;

  constructor(service: WebSocketService) {
    this.#service = service;
  }

  async subscribeToUpdates(channel: string) {
    try {
      // Ensure connection
      await this.#service.connect();
      
      // Subscribe to a channel
      await this.#service.sendMessage({
        type: 'subscribe',
        payload: { channel }
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to subscribe:', error);
      return { success: false, error: String(error) };
    }
  }

  async fetchData(query: any) {
    try {
      const response = await this.#service.sendRequest({
        type: 'query',
        payload: query
      });
      
      return response;
    } catch (error) {
      console.error('Failed to fetch data:', error);
      throw error;
    }
  }
}

/**
 * Example 3: Service Policy Integration with Event Handling
 * 
 * This example demonstrates how to use the service policy callbacks
 * and event handling capabilities.
 */
export async function servicePolicyExample() {
  console.log('=== Service Policy Example ===');

  const globalMessenger = new Messenger();
  const serviceMessenger: WebSocketServiceMessenger = globalMessenger.getRestricted({
    name: 'WebSocketService',
    allowedActions: [],
    allowedEvents: [],
  });

  const service = new WebSocketService({
    messenger: serviceMessenger,
    url: 'wss://echo.websocket.org',
    maxReconnectAttempts: 2,
    policy: {
      maxFailures: 3,
      failureThreshold: 5000,
      resetTimeout: 30000,
    }
  });

  // Register service policy callbacks
  const unsubscribeBreak = service.onBreak(() => {
    console.log('🔴 Circuit breaker activated - too many failures');
  });

  const unsubscribeDegraded = service.onDegraded(() => {
    console.log('🟡 Service is degraded - slower than expected');
  });

  const unsubscribeRetry = service.onRetry(() => {
    console.log('🔄 Service is retrying connection...');
  });

  // Register event listeners
  service.on(WebSocketEventType.CONNECTED, () => {
    console.log('✅ WebSocket connected');
  });

  service.on(WebSocketEventType.DISCONNECTED, () => {
    console.log('❌ WebSocket disconnected');
  });

  service.on(WebSocketEventType.RECONNECTING, (info) => {
    console.log(`🔄 Reconnecting... attempt ${info.attempt}/${info.maxAttempts}`);
  });

  service.on(WebSocketEventType.ERROR, (error) => {
    console.error('💥 WebSocket error:', error.message);
  });

  service.on(WebSocketEventType.MESSAGE, (message) => {
    console.log('📨 Received message:', message);
  });

  try {
    await service.connect();
    
    // Simulate some activity
    await service.sendMessage({
      type: 'test',
      payload: { data: 'test message' }
    });

    // Wait a bit to see events
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    console.error('Example error:', error);
  } finally {
    // Clean up listeners
    unsubscribeBreak.dispose();
    unsubscribeDegraded.dispose();
    unsubscribeRetry.dispose();
    
    await service.disconnect();
  }
}

/**
 * Example 4: Advanced Configuration with Authentication
 * 
 * This example shows advanced configuration options including authentication
 * and custom timeouts.
 */
export async function advancedConfigurationExample() {
  console.log('=== Advanced Configuration Example ===');

  const globalMessenger = new Messenger();
  const serviceMessenger: WebSocketServiceMessenger = globalMessenger.getRestricted({
    name: 'WebSocketService',
    allowedActions: [],
    allowedEvents: [],
  });

  const service = new WebSocketService({
    messenger: serviceMessenger,
    url: 'wss://secure-api.example.com/ws',
    authToken: 'your-auth-token-here',
    timeout: 15000,
    maxReconnectAttempts: 5,
    reconnectDelay: 2000,
    maxReconnectDelay: 60000,
    pingInterval: 20000,
    pongTimeout: 5000,
    requestTimeout: 45000,
    policy: {
      maxFailures: 5,
      failureThreshold: 10000,
      resetTimeout: 120000,
    }
  });

  // Set up comprehensive event handling
  service.on(WebSocketEventType.CONNECTED, () => {
    console.log('🔐 Authenticated WebSocket connection established');
  });

  service.on('stateChange', ({ from, to }) => {
    console.log(`State changed: ${from} → ${to}`);
  });

  try {
    await service.connect();

    // Send authenticated request
    const userInfo = await service.sendRequest({
      type: 'getUserInfo',
      payload: { userId: '12345' }
    });
    console.log('User info:', userInfo);

    // Subscribe to private channel
    await service.sendMessage({
      type: 'subscribe',
      payload: { 
        channel: 'private-notifications',
        userId: '12345'
      }
    });

  } catch (error) {
    console.error('Advanced configuration error:', error);
  } finally {
    await service.disconnect();
  }
}

/**
 * Example 5: Backward Compatibility with Deprecated Callbacks
 * 
 * This example shows how to use deprecated callback options while
 * migrating to the new Data Services pattern.
 */
export async function backwardCompatibilityExample() {
  console.log('=== Backward Compatibility Example ===');

  const globalMessenger = new Messenger();
  const serviceMessenger: WebSocketServiceMessenger = globalMessenger.getRestricted({
    name: 'WebSocketService',
    allowedActions: [],
    allowedEvents: [],
  });

  // Using deprecated callbacks for backward compatibility
  const service = new WebSocketService({
    messenger: serviceMessenger,
    url: 'wss://echo.websocket.org',
    maxReconnectAttempts: 3,
    
    // ⚠️ Deprecated: Use service.onBreak() method instead
    onBreak: () => {
      console.log('🔴 Circuit breaker activated (deprecated callback)');
    },
    
    // ⚠️ Deprecated: Use service.onDegraded() method instead
    onDegraded: () => {
      console.log('🟡 Service degraded (deprecated callback)');
    },
    
    // ⚠️ Deprecated: Use service.onRetry() method instead
    onRetry: () => {
      console.log('🔄 Service retrying (deprecated callback)');
    }
  });

  try {
    await service.connect();
    console.log('Connected with deprecated callbacks');
    
  } catch (error) {
    console.error('Backward compatibility error:', error);
  } finally {
    await service.disconnect();
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  try {
    await basicDataServiceExample();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await servicePolicyExample();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await advancedConfigurationExample();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await backwardCompatibilityExample();
    
    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Example execution failed:', error);
  }
}

// Uncomment to run examples
// runAllExamples(); 