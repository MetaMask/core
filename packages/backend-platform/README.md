# `@metamask/backend-platform`

Backend platform utilities and services for MetaMask.

## Installation

`yarn add @metamask/backend-platform`

or

`npm install @metamask/backend-platform`

## Features

- **WebSocket Service**: Robust WebSocket client with automatic reconnection, circuit breaker pattern, and service degradation detection
- **Type-safe utilities**: Common types and utility functions for backend operations
- **Service patterns**: Following MetaMask's service architecture guidelines

## Usage

### WebSocket Service

```typescript
import { WebSocketService, WebSocketState } from '@metamask/backend-platform';

// Create a WebSocket service instance
const websocketService = new WebSocketService({
  url: 'wss://your-internal-backend.com/ws',
  environment: 'production',
  authToken: 'your-auth-token',
  connectionTimeout: 15000,
  pingInterval: 30000,
  maxReconnectAttempts: 5,
  policyOptions: {
    maxRetries: 3,
    maxConsecutiveFailures: 5,
    circuitBreakDuration: 60000,
    degradedThreshold: 3000,
  },
});

// Set up event handlers
websocketService.on('connected', () => {
  console.log('Connected to WebSocket server');
});

websocketService.on('message', (message) => {
  console.log('Received message:', message);
});

websocketService.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Handle service policy events (recommended approach)
websocketService.onBreak((data) => {
  console.warn('Circuit breaker triggered:', data);
});

websocketService.onDegraded(() => {
  console.warn('Service is degraded');
});

websocketService.onRetry((data) => {
  console.log('Retrying connection:', data);
});

// Deprecated approach (still supported for backward compatibility)
const websocketServiceDeprecated = new WebSocketService({
  url: 'wss://your-internal-backend.com/ws',
  environment: 'production',
  // @deprecated - use onBreak() method instead
  onBreak: () => console.warn('Circuit breaker triggered'),
  // @deprecated - use onDegraded() method instead  
  onDegraded: () => console.warn('Service is degraded'),
});

// Connect and send messages
async function example() {
  try {
    await websocketService.connect();
    
    const response = await websocketService.send({
      type: 'getUserAccount',
      payload: { userId: 'user123' },
    });
    
    console.log('Response:', response);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Utility Functions

```typescript
import { 
  createSuccessResponse, 
  createErrorResponse, 
  isValidEnvironment 
} from '@metamask/backend-platform';

// Create standardized responses
const success = createSuccessResponse({ user: 'data' });
const error = createErrorResponse('Something went wrong');

// Validate environment strings
if (isValidEnvironment(process.env.NODE_ENV)) {
  console.log('Valid environment');
}
```

### Types

```typescript
import type { 
  BackendConfig, 
  BackendResponse,
  WebSocketServiceOptions,
  WebSocketMessage 
} from '@metamask/backend-platform';

const config: BackendConfig = {
  environment: 'development',
  debug: true,
};

const response: BackendResponse<string> = {
  success: true,
  data: 'Hello world',
  timestamp: Date.now(),
};
```

## Architecture

This package follows MetaMask's service architecture patterns:

- **Service Policy Integration**: Uses `@metamask/controller-utils` for retry logic, circuit breaker pattern, and service degradation detection
- **Event-driven Architecture**: WebSocket service implements an event emitter pattern for handling connection states and messages
- **Type Safety**: Comprehensive TypeScript types for all service interactions
- **Error Handling**: Robust error handling with automatic retries and fallback mechanisms

## WebSocket Service Features

- **Automatic Reconnection**: Configurable reconnection attempts with exponential backoff
- **Circuit Breaker**: Prevents cascading failures by temporarily stopping requests when service is down
- **Service Degradation Detection**: Monitors service performance and triggers callbacks when degraded
- **Authentication**: Built-in support for token-based authentication
- **Message Correlation**: Automatic correlation of request/response messages
- **Ping/Pong**: Configurable keep-alive mechanism
- **Connection State Management**: Comprehensive state tracking and event emission

## API Documentation

For detailed API documentation, please visit [our TypeDoc page](https://metamask.github.io/core/modules/_metamask_backend_platform.html). 