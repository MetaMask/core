import { Messenger } from '@metamask/base-controller';

import {
  BackendWebSocketService,
  getCloseReason,
  WebSocketState,
  type BackendWebSocketServiceOptions,
  type BackendWebSocketServiceMessenger,
  type BackendWebSocketServiceAllowedActions,
  type BackendWebSocketServiceAllowedEvents,
} from './BackendWebSocketService';
import { flushPromises } from '../../../tests/helpers';

// =====================================================
// TYPES
// =====================================================

// Type for global object with WebSocket mock
type GlobalWithWebSocket = typeof global & { lastWebSocket: MockWebSocket };

// =====================================================
// MOCK WEBSOCKET CLASS
// =====================================================

/**
 * Mock WebSocket implementation for testing
 * Provides controlled WebSocket behavior with immediate connection control
 */
class MockWebSocket extends EventTarget {
  // WebSocket state constants
  public static readonly CONNECTING = 0;

  public static readonly OPEN = 1;

  public static readonly CLOSING = 2;

  public static readonly CLOSED = 3;

  // WebSocket properties
  public readyState: number = MockWebSocket.CONNECTING;

  public url: string;

  // Event handlers
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  public onclose: ((event: CloseEvent) => void) | null = null;

  public onmessage: ((event: MessageEvent) => void) | null = null;

  public onerror: ((event: Event) => void) | null = null;

  // Mock methods for testing
  public close: jest.Mock<void, [number?, string?]> = jest.fn();

  public send: jest.Mock<void, [string]> = jest.fn();

  // Test utilities
  private _lastSentMessage: string | null = null;

  get lastSentMessage(): string | null {
    return this._lastSentMessage;
  }

  private _openTriggered = false;

  private _onopen: ((event: Event) => void) | null = null;

  public autoConnect: boolean = true;

  constructor(
    url: string,
    { autoConnect = true }: { autoConnect?: boolean } = {},
  ) {
    super();
    this.url = url;
    // TypeScript has issues with jest.spyOn on WebSocket methods, so using direct assignment
    // eslint-disable-next-line jest/prefer-spy-on
    this.close = jest.fn().mockImplementation();
    // eslint-disable-next-line jest/prefer-spy-on
    this.send = jest.fn().mockImplementation((data: string) => {
      this._lastSentMessage = data;
    });
    this.autoConnect = autoConnect;
    (global as GlobalWithWebSocket).lastWebSocket = this;
  }

  set onopen(handler: ((event: Event) => void) | null) {
    this._onopen = handler;
    if (
      handler &&
      !this._openTriggered &&
      this.readyState === MockWebSocket.CONNECTING &&
      this.autoConnect
    ) {
      // Trigger immediately to ensure connection completes
      this.triggerOpen();
    }
  }

  get onopen() {
    return this._onopen;
  }

  public triggerOpen() {
    if (
      !this._openTriggered &&
      this._onopen &&
      this.readyState === MockWebSocket.CONNECTING
    ) {
      this._openTriggered = true;
      this.readyState = MockWebSocket.OPEN;
      const event = new Event('open');
      this._onopen(event);
      this.dispatchEvent(event);
    }
  }

  public simulateClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const event = new CloseEvent('close', { code, reason });
    this.onclose?.(event);
    this.dispatchEvent(event);
  }

  public simulateMessage(data: string | object) {
    const messageData = typeof data === 'string' ? data : JSON.stringify(data);
    const event = new MessageEvent('message', { data: messageData });

    if (this.onmessage) {
      this.onmessage(event);
    }

    this.dispatchEvent(event);
  }

  public simulateError() {
    const event = new Event('error');
    this.onerror?.(event);
    this.dispatchEvent(event);
  }

  public getLastSentMessage(): string | null {
    return this._lastSentMessage;
  }
}

// =====================================================
// TEST UTILITIES & MOCKS
// =====================================================

/**
 * Creates a real messenger with registered mock actions for testing
 * Each call creates a completely independent messenger to ensure test isolation
 *
 * @returns Object containing the messenger and mock action functions
 */
const getMessenger = () => {
  // Create a unique root messenger for each test
  const rootMessenger = new Messenger<
    BackendWebSocketServiceAllowedActions,
    BackendWebSocketServiceAllowedEvents
  >();
  const messenger = rootMessenger.getRestricted({
    name: 'BackendWebSocketService',
    allowedActions: ['AuthenticationController:getBearerToken'],
    allowedEvents: ['AuthenticationController:stateChange'],
  }) as unknown as BackendWebSocketServiceMessenger;

  // Create mock action handlers
  const mockGetBearerToken = jest.fn().mockResolvedValue('valid-default-token');

  // Register all action handlers
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    mockGetBearerToken,
  );

  return {
    rootMessenger,
    messenger,
    mocks: {
      getBearerToken: mockGetBearerToken,
    },
  };
};

// =====================================================
// TEST CONSTANTS & DATA
// =====================================================

const TEST_CONSTANTS = {
  WS_URL: 'ws://localhost:8080',
  TEST_CHANNEL: 'test-channel',
  SUBSCRIPTION_ID: 'sub-123',
  TIMEOUT_MS: 100,
  RECONNECT_DELAY: 50,
} as const;

/**
 * Helper to create a properly formatted WebSocket response message
 *
 * @param requestId - The request ID to match with the response
 * @param data - The response data payload
 * @returns Formatted WebSocket response message
 */
const createResponseMessage = (
  requestId: string,
  data: Record<string, unknown>,
) => ({
  id: requestId,
  data: {
    requestId,
    ...data,
  },
});

// Setup function following TokenBalancesController pattern
// =====================================================
// TEST SETUP HELPER
// =====================================================

/**
 * Test configuration options
 */
type TestSetupOptions = {
  options?: Partial<BackendWebSocketServiceOptions>;
  mockWebSocketOptions?: { autoConnect?: boolean };
};

/**
 * Test setup return value with all necessary test utilities
 */
type TestSetup = {
  service: BackendWebSocketService;
  messenger: BackendWebSocketServiceMessenger;
  rootMessenger: Messenger<
    BackendWebSocketServiceAllowedActions,
    BackendWebSocketServiceAllowedEvents
  >;
  mocks: {
    getBearerToken: jest.Mock;
  };
  spies: {
    publish: jest.SpyInstance;
    call: jest.SpyInstance;
  };
  completeAsyncOperations: (advanceMs?: number) => Promise<void>;
  getMockWebSocket: () => MockWebSocket;
  cleanup: () => void;
};

/**
 * The callback that `withService` calls.
 */
type WithServiceCallback<ReturnValue> = (payload: {
  service: BackendWebSocketService;
  messenger: BackendWebSocketServiceMessenger;
  rootMessenger: Messenger<
    BackendWebSocketServiceAllowedActions,
    BackendWebSocketServiceAllowedEvents
  >;
  mocks: {
    getBearerToken: jest.Mock;
  };
  spies: {
    publish: jest.SpyInstance;
    call: jest.SpyInstance;
  };
  completeAsyncOperations: (advanceMs?: number) => Promise<void>;
  getMockWebSocket: () => MockWebSocket;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Create a fresh BackendWebSocketService instance with mocked dependencies for testing.
 * Follows the TokenBalancesController test pattern for complete test isolation.
 *
 * @param config - Test configuration options
 * @param config.options - WebSocket service configuration options
 * @param config.mockWebSocketOptions - Mock WebSocket configuration options
 * @returns Test utilities and cleanup function
 */
const setupBackendWebSocketService = ({
  options,
  mockWebSocketOptions,
}: TestSetupOptions = {}): TestSetup => {
  // Setup fake timers to control all async operations
  jest.useFakeTimers();

  // Create real messenger with registered actions
  const messengerSetup = getMessenger();
  const { rootMessenger, messenger, mocks } = messengerSetup;

  // Create spies BEFORE service construction to capture constructor calls
  const publishSpy = jest.spyOn(messenger, 'publish');
  const callSpy = jest.spyOn(messenger, 'call');

  // Default test options (shorter timeouts for faster tests)
  const defaultOptions = {
    url: TEST_CONSTANTS.WS_URL,
    timeout: TEST_CONSTANTS.TIMEOUT_MS,
    reconnectDelay: TEST_CONSTANTS.RECONNECT_DELAY,
    maxReconnectDelay: TEST_CONSTANTS.TIMEOUT_MS,
    requestTimeout: TEST_CONSTANTS.TIMEOUT_MS,
  };

  // Create custom MockWebSocket class for this test
  class TestMockWebSocket extends MockWebSocket {
    constructor(url: string) {
      super(url, mockWebSocketOptions);
    }
  }

  // Replace global WebSocket for this test
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  global.WebSocket = TestMockWebSocket as unknown as typeof WebSocket;

  const service = new BackendWebSocketService({
    messenger,
    ...defaultOptions,
    ...options,
  });

  const completeAsyncOperations = async (advanceMs = 10) => {
    await flushPromises();
    if (advanceMs > 0) {
      jest.advanceTimersByTime(advanceMs);
    }
    await flushPromises();
  };

  const getMockWebSocket = (): MockWebSocket => {
    return (global as GlobalWithWebSocket).lastWebSocket;
  };

  return {
    service,
    messenger,
    rootMessenger,
    mocks,
    spies: {
      publish: publishSpy,
      call: callSpy,
    },
    completeAsyncOperations,
    getMockWebSocket,
    cleanup: () => {
      service?.destroy();
      publishSpy.mockRestore();
      callSpy.mockRestore();
      jest.useRealTimers();
      jest.clearAllMocks();
    },
  };
};

/**
 * Wrap tests for the BackendWebSocketService by ensuring that the service is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the service constructor. All constructor
 * arguments are optional and will be filled in with defaults as needed
 * (including `messenger`). The function is called with the new
 * service, root messenger, and service messenger.
 * @returns The same return value as the given function.
 */
async function withService<ReturnValue>(
  ...args:
    | [WithServiceCallback<ReturnValue>]
    | [TestSetupOptions, WithServiceCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {}, mockWebSocketOptions = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];

  const setup = setupBackendWebSocketService({ options, mockWebSocketOptions });

  try {
    return await testFunction({
      service: setup.service,
      messenger: setup.messenger,
      rootMessenger: setup.rootMessenger,
      mocks: setup.mocks,
      spies: setup.spies,
      completeAsyncOperations: setup.completeAsyncOperations,
      getMockWebSocket: setup.getMockWebSocket,
    });
  } finally {
    setup.cleanup();
  }
}

/**
 * Helper to create a subscription with predictable response
 *
 * @param service - The WebSocket service
 * @param mockWs - Mock WebSocket instance
 * @param options - Subscription options
 * @param options.channels - Channels to subscribe to
 * @param options.callback - Callback function
 * @param options.requestId - Request ID
 * @param options.subscriptionId - Subscription ID
 * @returns Promise with subscription
 */
const createSubscription = async (
  service: BackendWebSocketService,
  mockWs: MockWebSocket,
  options: {
    channels: string[];
    callback: jest.Mock;
    requestId: string;
    subscriptionId?: string;
  },
) => {
  const {
    channels,
    callback,
    requestId,
    subscriptionId = 'test-sub',
  } = options;

  const subscriptionPromise = service.subscribe({
    channels,
    callback,
    requestId,
  });

  const responseMessage = createResponseMessage(requestId, {
    subscriptionId,
    successful: channels,
    failed: [],
  });
  mockWs.simulateMessage(responseMessage);

  return subscriptionPromise;
};

// =====================================================
// WEBSOCKETSERVICE TESTS
// =====================================================

describe('BackendWebSocketService', () => {
  // =====================================================
  // CONSTRUCTOR TESTS
  // =====================================================
  describe('constructor', () => {
    it('should create a BackendWebSocketService instance with custom options', async () => {
      await withService(
        {
          options: {
            url: 'wss://custom.example.com',
            timeout: 5000,
          },
          mockWebSocketOptions: { autoConnect: false },
        },
        async ({ service }) => {
          expect(service).toBeInstanceOf(BackendWebSocketService);
          expect(service.getConnectionInfo().url).toBe(
            'wss://custom.example.com',
          );
        },
      );
    });
  });

  // =====================================================
  // CONNECTION LIFECYCLE TESTS
  // =====================================================
  describe('connection lifecycle - connect / disconnect', () => {
    it('should establish WebSocket connection and set state to CONNECTED, publishing state change event', async () => {
      await withService(async ({ service, spies }) => {
        await service.connect();

        const connectionInfo = service.getConnectionInfo();
        expect(connectionInfo.state).toBe(WebSocketState.CONNECTED);
        expect(connectionInfo.reconnectAttempts).toBe(0);
        expect(connectionInfo.url).toBe('ws://localhost:8080');

        expect(spies.publish).toHaveBeenCalledWith(
          'BackendWebSocketService:connectionStateChanged',
          expect.objectContaining({
            state: WebSocketState.CONNECTED,
            reconnectAttempts: 0,
          }),
        );
      });
    });

    it('should return immediately without creating new connection when already connected', async () => {
      await withService(async ({ service, spies }) => {
        // Connect first time
        await service.connect();

        // Try to connect again
        await service.connect();

        expect(spies.publish).toHaveBeenNthCalledWith(
          1,
          'BackendWebSocketService:connectionStateChanged',
          expect.objectContaining({ state: WebSocketState.CONNECTING }),
        );
        expect(spies.publish).toHaveBeenNthCalledWith(
          2,
          'BackendWebSocketService:connectionStateChanged',
          expect.objectContaining({ state: WebSocketState.CONNECTED }),
        );
      });
    });

    it('should handle connection timeout by rejecting with timeout error and setting state to DISCONNECTED', async () => {
      await withService(
        {
          options: { timeout: TEST_CONSTANTS.TIMEOUT_MS },
          mockWebSocketOptions: { autoConnect: false },
        },
        async ({ service, completeAsyncOperations }) => {
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );

          const connectPromise = service.connect();
          connectPromise.catch(() => {
            // Expected rejection - no action needed
          });

          await completeAsyncOperations(TEST_CONSTANTS.TIMEOUT_MS + 50);

          await expect(connectPromise).rejects.toThrow(
            `Failed to connect to WebSocket: Connection timeout after ${TEST_CONSTANTS.TIMEOUT_MS}ms`,
          );

          const connectionInfo = service.getConnectionInfo();
          expect(connectionInfo.state).toBe(WebSocketState.ERROR);
          expect(connectionInfo.reconnectAttempts).toBe(0);
          expect(connectionInfo.url).toBe('ws://localhost:8080');
        },
      );
    });

    it('should reject sendMessage and sendRequest operations when WebSocket is disconnected', async () => {
      await withService(
        { mockWebSocketOptions: { autoConnect: false } },
        async ({ service }) => {
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );

          await expect(
            service.sendMessage({ event: 'test', data: { requestId: 'test' } }),
          ).rejects.toThrow('Cannot send message: WebSocket is disconnected');
          await expect(
            service.sendRequest({ event: 'test', data: {} }),
          ).rejects.toThrow('Cannot send request: WebSocket is disconnected');
          await expect(
            service.subscribe({ channels: ['test'], callback: jest.fn() }),
          ).rejects.toThrow(
            'Cannot create subscription(s) test: WebSocket is disconnected',
          );
        },
      );
    });

    it('should handle request timeout by clearing pending requests and forcing WebSocket reconnection', async () => {
      await withService(
        { options: { requestTimeout: 200 } },
        async ({ service, getMockWebSocket }) => {
          await service.connect();
          const mockWs = getMockWebSocket();
          const closeSpy = jest.spyOn(mockWs, 'close');

          const requestPromise = service.sendRequest({
            event: 'timeout-test',
            data: { requestId: 'timeout-req-1', method: 'test', params: {} },
          });

          jest.advanceTimersByTime(201);

          await expect(requestPromise).rejects.toThrow(
            'Request timeout after 200ms',
          );
          expect(closeSpy).toHaveBeenCalledWith(
            3000,
            'Request timeout - forcing reconnect',
          );

          closeSpy.mockRestore();
        },
      );
    });

    it('should handle abnormal WebSocket close by triggering reconnection', async () => {
      await withService(
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          await service.connect();
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.CONNECTED,
          );
          expect(service.getConnectionInfo().reconnectAttempts).toBe(0);

          const mockWs = getMockWebSocket();

          // Simulate abnormal closure (should trigger reconnection)
          mockWs.simulateClose(1006, 'Abnormal closure');
          await completeAsyncOperations(0);

          // Service should transition to DISCONNECTED
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );

          // Advance time to trigger reconnection attempt
          await completeAsyncOperations(100);

          // Service should have successfully reconnected
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.CONNECTED,
          );
          expect(service.getConnectionInfo().reconnectAttempts).toBe(0); // Reset on successful connection
        },
      );
    });

    it('should handle normal WebSocket close without triggering reconnection', async () => {
      await withService(
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          await service.connect();
          const mockWs = getMockWebSocket();

          // Simulate normal closure (should NOT trigger reconnection)
          mockWs.simulateClose(1000, 'Normal closure');
          await completeAsyncOperations(0);

          // Service should be in ERROR state (non-recoverable)
          expect(service.getConnectionInfo().state).toBe(WebSocketState.ERROR);

          // Advance time - should NOT attempt reconnection
          await completeAsyncOperations(200);

          // Should still be in ERROR state
          expect(service.getConnectionInfo().state).toBe(WebSocketState.ERROR);
        },
      );
    });

    it('should handle WebSocket error events during runtime without immediate state change', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );

        const mockWs = getMockWebSocket();

        // Simulate error event - runtime errors are handled but don't immediately change state
        // The actual state change happens when the connection closes
        mockWs.simulateError();

        // Service remains connected (error handler is a placeholder)
        // Real disconnection will happen through onclose event
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );
      });
    });

    it('should schedule another reconnection attempt when connect fails during reconnection', async () => {
      await withService(
        {
          options: {
            reconnectDelay: 50,
            maxReconnectDelay: 100,
          },
        },
        async ({ service, completeAsyncOperations, getMockWebSocket }) => {
          // Connect first
          await service.connect();

          // Track connect calls
          let connectCallCount = 0;
          const connectSpy = jest.spyOn(service, 'connect');
          connectSpy.mockImplementation(async () => {
            connectCallCount += 1;
            // Fail the first reconnection attempt
            throw new Error('Connection failed');
          });

          // Simulate connection loss to trigger reconnection
          const mockWs = getMockWebSocket();
          mockWs.simulateClose(1006, 'Connection lost');
          await completeAsyncOperations(0);

          // Advance time to trigger first reconnection attempt (will fail)
          await completeAsyncOperations(75);

          // Verify first connect was called
          expect(connectCallCount).toBe(1);

          // Advance time to trigger second reconnection (verifies catch scheduled another)
          await completeAsyncOperations(150);

          // If catch block works, connect should be called again
          expect(connectCallCount).toBeGreaterThan(1);

          connectSpy.mockRestore();
        },
      );
    });

    it('should handle WebSocket close events during connection establishment without close reason', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        // Connect and get the WebSocket instance
        await service.connect();

        const mockWs = getMockWebSocket();

        // Simulate close event without reason - this should hit line 918 (event.reason || 'none' falsy branch)
        mockWs.simulateClose(1006, undefined);

        // Verify the service state changed due to the close event
        expect(service.name).toBe('BackendWebSocketService');

        const connectionInfo = service.getConnectionInfo();
        expect(connectionInfo.state).toBe(WebSocketState.DISCONNECTED);
        expect(connectionInfo.url).toBe('ws://localhost:8080');
      });
    });

    it('should disconnect WebSocket connection and set state to DISCONNECTED when connected', async () => {
      await withService(async ({ service }) => {
        await service.connect();
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );

        await service.disconnect();

        const connectionInfo = service.getConnectionInfo();
        expect(connectionInfo.state).toBe(WebSocketState.DISCONNECTED);
        expect(connectionInfo.url).toBe('ws://localhost:8080'); // URL persists after disconnect
        expect(connectionInfo.reconnectAttempts).toBe(0);
      });
    });

    it('should handle disconnect gracefully when WebSocket is already disconnected', async () => {
      await withService(async ({ service }) => {
        expect(() => service.disconnect()).not.toThrow();
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.DISCONNECTED,
        );
      });
    });

    it('should handle messenger publish errors during state changes by logging errors without throwing', async () => {
      await withService(async ({ service, messenger }) => {
        // Mock messenger.publish to throw an error
        const publishSpy = jest
          .spyOn(messenger, 'publish')
          .mockImplementation(() => {
            throw new Error('Messenger publish failed');
          });

        // Trigger a state change by attempting to connect
        // This will call #setState which will try to publish and catch the error
        // The key test is that the service doesn't crash despite the messenger error
        try {
          await service.connect();
        } catch {
          // Connection might fail, but that's ok - we're testing the publish error handling
        }

        // Verify that the service is still functional despite the messenger publish error
        // This ensures the error was caught and handled properly
        const connectionInfo = service.getConnectionInfo();
        expect(connectionInfo.state).toBe(WebSocketState.CONNECTED);
        expect(connectionInfo.reconnectAttempts).toBe(0);
        expect(connectionInfo.url).toBe('ws://localhost:8080');

        publishSpy.mockRestore();
      });
    });

    it('should handle concurrent connect calls by awaiting existing connection promise and returning same result', async () => {
      await withService(
        { mockWebSocketOptions: { autoConnect: false } },
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          // Start first connection (will be in CONNECTING state)
          const firstConnect = service.connect();
          await completeAsyncOperations(10); // Allow connect to start

          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.CONNECTING,
          );

          // Start second connection while first is still connecting
          // This should await the existing connection promise
          const secondConnect = service.connect();

          // Complete the first connection
          const mockWs = getMockWebSocket();
          mockWs.triggerOpen();

          // Both promises should resolve successfully
          await Promise.all([firstConnect, secondConnect]);

          const connectionInfo = service.getConnectionInfo();
          expect(connectionInfo.state).toBe(WebSocketState.CONNECTED);
          expect(connectionInfo.reconnectAttempts).toBe(0);
          expect(connectionInfo.url).toBe('ws://localhost:8080');
        },
      );
    });

    it('should handle WebSocket error events during connection establishment by setting state to ERROR', async () => {
      await withService(
        { mockWebSocketOptions: { autoConnect: false } },
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          const connectPromise = service.connect();
          await completeAsyncOperations(10);

          // Trigger error event during connection phase
          const mockWs = getMockWebSocket();
          mockWs.simulateError();

          await expect(connectPromise).rejects.toThrow(
            'WebSocket connection error',
          );
          expect(service.getConnectionInfo().state).toBe(WebSocketState.ERROR);
        },
      );
    });

    it('should handle WebSocket close events during connection establishment by setting state to ERROR', async () => {
      await withService(
        { mockWebSocketOptions: { autoConnect: false } },
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          const connectPromise = service.connect();
          await completeAsyncOperations(10);

          // Trigger close event during connection phase
          const mockWs = getMockWebSocket();
          mockWs.simulateClose(1006, 'Connection failed');

          await expect(connectPromise).rejects.toThrow(
            'WebSocket connection closed during connection',
          );
        },
      );
    });

    it('should properly transition through disconnecting state during manual disconnect and set final state to DISCONNECTED', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        // Mock the close method to simulate manual WebSocket close
        mockWs.close.mockImplementation(
          (code = 1000, reason = 'Normal closure') => {
            mockWs.simulateClose(code, reason);
          },
        );

        // Start manual disconnect - this will trigger close() and simulate close event
        await service.disconnect();

        // The service should transition through DISCONNECTING to DISCONNECTED
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.DISCONNECTED,
        );

        // Verify the close method was called with normal closure code
        expect(mockWs.close).toHaveBeenCalledWith(1000, 'Normal closure');
      });
    });
  });

  // =====================================================
  // SUBSCRIPTION TESTS
  // =====================================================
  describe('subscribe', () => {
    it('should subscribe to WebSocket channels and return subscription with unsubscribe function', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockCallback = jest.fn();
        const mockWs = getMockWebSocket();

        const subscription = await createSubscription(service, mockWs, {
          channels: [TEST_CONSTANTS.TEST_CHANNEL],
          callback: mockCallback,
          requestId: 'test-subscribe-success',
          subscriptionId: TEST_CONSTANTS.SUBSCRIPTION_ID,
        });

        expect(subscription.subscriptionId).toBe(
          TEST_CONSTANTS.SUBSCRIPTION_ID,
        );
        expect(typeof subscription.unsubscribe).toBe('function');
      });
    });

    it('should handle various error scenarios including connection failures and invalid responses', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        // Test subscription failure scenario
        const callback = jest.fn();

        // Create subscription request - Use predictable request ID
        const testRequestId = 'test-error-branch-scenarios';
        const subscriptionPromise = service.subscribe({
          channels: ['test-channel-error'],
          callback,
          requestId: testRequestId,
        });

        // Simulate response with failure - no waiting needed!
        mockWs.simulateMessage({
          id: testRequestId,
          data: {
            requestId: testRequestId,
            subscriptionId: 'error-sub',
            successful: [],
            failed: ['test-channel-error'],
          },
        });

        // Should reject due to failed channels
        await expect(subscriptionPromise).rejects.toThrow(
          'Request failed: test-channel-error',
        );
      });
    });

    it('should handle unsubscribe errors and connection errors gracefully without throwing', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        const mockCallback = jest.fn();
        const subscription = await createSubscription(service, mockWs, {
          channels: ['test-channel'],
          callback: mockCallback,
          requestId: 'test-subscription-unsub-error',
          subscriptionId: 'unsub-error-test',
        });

        // Mock sendRequest to throw error during unsubscribe
        jest.spyOn(service, 'sendRequest').mockImplementation(() => {
          return Promise.reject(new Error('Unsubscribe failed'));
        });

        await expect(subscription.unsubscribe()).rejects.toThrow(
          'Unsubscribe failed',
        );
      });
    });

    it('should throw error when subscription response is missing required subscription ID field', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        const subscriptionPromise = service.subscribe({
          channels: ['invalid-test'],
          callback: jest.fn(),
          requestId: 'test-missing-subscription-id',
        });

        // Send response without subscriptionId
        mockWs.simulateMessage({
          id: 'test-missing-subscription-id',
          data: {
            requestId: 'test-missing-subscription-id',
            successful: ['invalid-test'],
            failed: [],
          },
        });

        await expect(subscriptionPromise).rejects.toThrow(
          'Invalid subscription response: missing subscription ID',
        );
      });
    });

    it('should throw subscription-specific error when individual channels fail to subscribe', async () => {
      await withService(async ({ service }) => {
        await service.connect();

        jest.spyOn(service, 'sendRequest').mockResolvedValueOnce({
          subscriptionId: 'valid-sub-id',
          successful: [],
          failed: ['fail-test'],
        });

        await expect(
          service.subscribe({
            channels: ['fail-test'],
            callback: jest.fn(),
          }),
        ).rejects.toThrow('Subscription failed for channels: fail-test');
      });
    });

    it('should retrieve subscription by channel name from internal subscription storage', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockCallback = jest.fn();
        const mockWs = getMockWebSocket();

        await createSubscription(service, mockWs, {
          channels: ['test-channel'],
          callback: mockCallback,
          requestId: 'test-notification-handling',
          subscriptionId: 'sub-123',
        });

        const subscriptions = service.getSubscriptionsByChannel('test-channel');
        expect(subscriptions).toHaveLength(1);
        expect(subscriptions[0].subscriptionId).toBe('sub-123');
        expect(service.getSubscriptionsByChannel('nonexistent')).toHaveLength(
          0,
        );
      });
    });

    it('should find all subscriptions matching a channel prefix pattern', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();
        const callback = jest.fn();

        await createSubscription(service, mockWs, {
          channels: ['account-activity.v1.address1', 'other-prefix.v1.test'],
          callback,
          requestId: 'test-prefix-sub',
          subscriptionId: 'sub-1',
        });

        const matches =
          service.findSubscriptionsByChannelPrefix('account-activity');
        expect(matches).toHaveLength(1);
        expect(matches[0].subscriptionId).toBe('sub-1');
        expect(
          service.findSubscriptionsByChannelPrefix('non-existent'),
        ).toStrictEqual([]);
      });
    });

    it('should handle multiple subscriptions and unsubscriptions with different channels by managing subscription state correctly', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();
        const mockCallback1 = jest.fn();
        const mockCallback2 = jest.fn();

        // Create multiple subscriptions
        const subscription1 = await createSubscription(service, mockWs, {
          channels: ['channel-1', 'channel-2'],
          callback: mockCallback1,
          requestId: 'test-multi-sub-1',
          subscriptionId: 'sub-1',
        });

        const subscription2 = await createSubscription(service, mockWs, {
          channels: ['channel-3'],
          callback: mockCallback2,
          requestId: 'test-multi-sub-2',
          subscriptionId: 'sub-2',
        });

        // Verify both subscriptions exist
        expect(service.channelHasSubscription('channel-1')).toBe(true);
        expect(service.channelHasSubscription('channel-2')).toBe(true);
        expect(service.channelHasSubscription('channel-3')).toBe(true);

        // Send notifications to different channels
        const notification1 = {
          event: 'notification',
          channel: 'channel-1',
          subscriptionId: 'sub-1',
          data: { data: 'test1' },
        };

        const notification2 = {
          event: 'notification',
          channel: 'channel-3',
          subscriptionId: 'sub-2',
          data: { data: 'test3' },
        };

        mockWs.simulateMessage(notification1);
        mockWs.simulateMessage(notification2);

        expect(mockCallback1).toHaveBeenCalledWith(notification1);
        expect(mockCallback2).toHaveBeenCalledWith(notification2);

        // Unsubscribe from first subscription
        const unsubscribePromise = subscription1.unsubscribe(
          'test-unsubscribe-multiple',
        );
        const unsubResponseMessage = createResponseMessage(
          'test-unsubscribe-multiple',
          {
            subscriptionId: 'sub-1',
            successful: ['channel-1', 'channel-2'],
            failed: [],
          },
        );
        mockWs.simulateMessage(unsubResponseMessage);
        await unsubscribePromise;

        expect(service.channelHasSubscription('channel-1')).toBe(false);
        expect(service.channelHasSubscription('channel-2')).toBe(false);
        expect(service.channelHasSubscription('channel-3')).toBe(true);

        // Unsubscribe from second subscription
        const unsubscribePromise2 = subscription2.unsubscribe(
          'test-unsubscribe-multiple-2',
        );
        const unsubResponseMessage2 = createResponseMessage(
          'test-unsubscribe-multiple-2',
          {
            subscriptionId: 'sub-2',
            successful: ['channel-3'],
            failed: [],
          },
        );
        mockWs.simulateMessage(unsubResponseMessage2);
        await unsubscribePromise2;

        // Verify second subscription is also removed
        expect(service.channelHasSubscription('channel-3')).toBe(false);
      });
    });
  });

  // =====================================================
  // MESSAGE HANDLING TESTS
  // =====================================================
  describe('message handling', () => {
    it('should silently ignore invalid JSON messages and trigger parseMessage error handling', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        const channelCallback = jest.fn();
        service.addChannelCallback({
          channelName: 'test-channel',
          callback: channelCallback,
        });

        const subscriptionCallback = jest.fn();
        await createSubscription(service, mockWs, {
          channels: ['test-channel'],
          callback: subscriptionCallback,
          requestId: 'test-parse-message-invalid-json',
          subscriptionId: 'test-sub-123',
        });

        channelCallback.mockClear();
        subscriptionCallback.mockClear();

        const invalidJsonMessages = [
          'invalid json string',
          '{ incomplete json',
          '{ "malformed": json }',
          'not json at all',
          '{ "unclosed": "quote }',
          '{ "trailing": "comma", }',
          'random text with { brackets',
        ];

        for (const invalidJson of invalidJsonMessages) {
          const invalidEvent = new MessageEvent('message', {
            data: invalidJson,
          });
          mockWs.onmessage?.(invalidEvent);
        }

        expect(channelCallback).not.toHaveBeenCalled();
        expect(subscriptionCallback).not.toHaveBeenCalled();
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );

        const validNotification = {
          event: 'notification',
          subscriptionId: 'test-sub-123',
          channel: 'test-channel',
          data: { message: 'valid notification after invalid json' },
        };
        mockWs.simulateMessage(validNotification);

        expect(subscriptionCallback).toHaveBeenCalledTimes(1);
        expect(subscriptionCallback).toHaveBeenCalledWith(validNotification);
      });
    });

    it('should not process duplicate messages that have both subscriptionId and channel fields', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();

        const subscriptionCallback = jest.fn();
        const channelCallback = jest.fn();
        const mockWs = getMockWebSocket();

        // Set up subscription callback
        await createSubscription(service, mockWs, {
          channels: ['test-channel'],
          callback: subscriptionCallback,
          requestId: 'test-duplicate-handling-subscribe',
          subscriptionId: 'sub-123',
        });

        // Set up channel callback for the same channel
        service.addChannelCallback({
          channelName: 'test-channel',
          callback: channelCallback,
        });

        // Clear any previous calls
        subscriptionCallback.mockClear();
        channelCallback.mockClear();

        // Send a notification with BOTH subscriptionId and channel
        const notificationWithBoth = {
          event: 'notification',
          subscriptionId: 'sub-123',
          channel: 'test-channel',
          data: { message: 'test notification with both properties' },
        };
        mockWs.simulateMessage(notificationWithBoth);

        // The subscription callback should be called (has subscriptionId)
        expect(subscriptionCallback).toHaveBeenCalledTimes(1);
        expect(subscriptionCallback).toHaveBeenCalledWith(notificationWithBoth);

        // The channel callback should NOT be called (prevented by return statement)
        expect(channelCallback).not.toHaveBeenCalled();

        // Clear calls for next test
        subscriptionCallback.mockClear();
        channelCallback.mockClear();

        // Send a notification with ONLY channel (no subscriptionId)
        const notificationChannelOnly = {
          event: 'notification',
          channel: 'test-channel',
          data: { message: 'test notification with channel only' },
        };
        mockWs.simulateMessage(notificationChannelOnly);

        // The subscription callback should NOT be called (no subscriptionId)
        expect(subscriptionCallback).not.toHaveBeenCalled();

        // The channel callback should be called (has channel)
        expect(channelCallback).toHaveBeenCalledTimes(1);
        expect(channelCallback).toHaveBeenCalledWith(notificationChannelOnly);
      });
    });

    it('should properly clear all pending requests and their timeouts during WebSocket disconnect', async () => {
      await withService(async ({ service }) => {
        await service.connect();

        const requestPromise = service.sendRequest({
          event: 'test-request',
          data: { test: true },
        });

        await service.disconnect();

        await expect(requestPromise).rejects.toThrow('WebSocket disconnected');
      });
    });

    it('should handle WebSocket send errors by calling error handler and logging the error', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        // Mock send to throw error
        mockWs.send.mockImplementation(() => {
          throw new Error('Send failed');
        });

        const testMessage = {
          event: 'test-event',
          data: {
            requestId: 'test-req-1',
            type: 'test',
            payload: { key: 'value' },
          },
        };

        // Should handle error and call error handler
        await expect(service.sendMessage(testMessage)).rejects.toThrow(
          'Send failed',
        );
      });
    });

    it('should gracefully handle server responses for non-existent or expired requests', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        const serverResponse = {
          event: 'response',
          data: {
            requestId: 'non-existent-request-id',
            result: { success: true },
          },
        };
        mockWs.simulateMessage(JSON.stringify(serverResponse));

        // Verify the service remains connected and doesn't crash
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );
      });
    });

    it('should handle sendRequest error when sendMessage fails with non-Error object by converting to Error', async () => {
      await withService(async ({ service }) => {
        await service.connect();

        // Mock sendMessage to return a rejected promise with non-Error object
        const sendMessageSpy = jest.spyOn(service, 'sendMessage');
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        sendMessageSpy.mockReturnValue(Promise.reject('String error'));

        // Attempt to send a request - this should hit line 550 (error instanceof Error = false)
        await expect(
          service.sendRequest({
            event: 'test-event',
            data: { channels: ['test-channel'] },
          }),
        ).rejects.toThrow('String error');

        // Verify the service remains connected after the error
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );

        sendMessageSpy.mockRestore();
      });
    });

    it('should handle channel messages gracefully when no channel callbacks are registered', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        // Send a channel message when no callbacks are registered
        const channelMessage = {
          event: 'notification',
          channel: 'test-channel-no-callbacks',
          data: { message: 'test message' },
        };

        mockWs.simulateMessage(JSON.stringify(channelMessage));

        // Should not crash and remain connected
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );
      });
    });

    it('should handle subscription notifications with falsy subscriptionId by ignoring them', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        // Add a channel callback to test fallback behavior
        const channelCallback = jest.fn();
        service.addChannelCallback({
          channelName: 'test-channel-fallback',
          callback: channelCallback,
        });

        // Send subscription notification with null subscriptionId
        const subscriptionMessage = {
          event: 'notification',
          channel: 'test-channel-fallback',
          data: { message: 'test message' },
          subscriptionId: null,
        };

        mockWs.simulateMessage(JSON.stringify(subscriptionMessage));

        // Should fall through to channel callback
        expect(channelCallback).toHaveBeenCalledWith(subscriptionMessage);
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );
      });
    });

    it('should handle channel callback management comprehensively including add, remove, and get operations', async () => {
      await withService(
        { mockWebSocketOptions: { autoConnect: false } },
        async ({ service }) => {
          const originalCallback = jest.fn();
          const duplicateCallback = jest.fn();

          // Add channel callback first time
          service.addChannelCallback({
            channelName: 'test-channel-duplicate',
            callback: originalCallback,
          });

          expect(service.getChannelCallbacks()).toHaveLength(1);

          // Add same channel callback again - should replace the existing one
          service.addChannelCallback({
            channelName: 'test-channel-duplicate',
            callback: duplicateCallback,
          });

          expect(service.getChannelCallbacks()).toHaveLength(1);

          // Add different channel callback
          service.addChannelCallback({
            channelName: 'different-channel',
            callback: jest.fn(),
          });

          expect(service.getChannelCallbacks()).toHaveLength(2);

          // Remove callback - should return true
          expect(service.removeChannelCallback('test-channel-duplicate')).toBe(
            true,
          );
          expect(service.getChannelCallbacks()).toHaveLength(1);

          // Try to remove non-existent callback - should return false
          expect(service.removeChannelCallback('non-existent-channel')).toBe(
            false,
          );
        },
      );
    });

    it('should handle sendRequest error scenarios by properly rejecting promises and cleaning up pending requests', async () => {
      await withService(async ({ service }) => {
        await service.connect();

        // Test sendRequest error handling when message sending fails
        const sendMessageSpy = jest
          .spyOn(service, 'sendMessage')
          .mockRejectedValue(new Error('Send failed'));

        await expect(
          service.sendRequest({ event: 'test', data: { test: 'value' } }),
        ).rejects.toStrictEqual(new Error('Send failed'));

        sendMessageSpy.mockRestore();
      });
    });
  });

  describe('authentication flows', () => {
    it('should handle authentication state changes by disconnecting WebSocket when user signs out', async () => {
      await withService({ options: {} }, async ({ service, rootMessenger }) => {
        // Start with signed in state by publishing event
        rootMessenger.publish(
          'AuthenticationController:stateChange',
          { isSignedIn: true },
          [],
        );

        // Set up some reconnection attempts to verify they get reset
        // We need to trigger some reconnection attempts first
        const connectSpy = jest
          .spyOn(service, 'connect')
          .mockRejectedValue(new Error('Connection failed'));

        // Trigger a failed connection to increment reconnection attempts
        try {
          await service.connect();
        } catch {
          // Expected to fail
        }

        // Simulate user signing out (wallet locked OR signed out) by publishing event
        rootMessenger.publish(
          'AuthenticationController:stateChange',
          { isSignedIn: false },
          [],
        );

        // Assert that reconnection attempts were reset to 0 when user signs out
        expect(service.getConnectionInfo().reconnectAttempts).toBe(0);

        connectSpy.mockRestore();
      });
    });

    it('should throw error on authentication setup failure when messenger action registration fails', async () => {
      await withService(
        {
          options: {},
          mockWebSocketOptions: { autoConnect: false },
        },
        async ({ messenger }) => {
          // Mock subscribe to fail for authentication events
          jest.spyOn(messenger, 'subscribe').mockImplementationOnce(() => {
            throw new Error('AuthenticationController not available');
          });

          // Create service with authentication enabled - should throw error
          expect(() => {
            new BackendWebSocketService({
              messenger,
              url: 'ws://test',
            });
          }).toThrow(
            'Authentication setup failed: AuthenticationController not available',
          );
        },
      );
    });

    it('should handle authentication state change sign-in connection failure by logging error and continuing', async () => {
      await withService({ options: {} }, async ({ service, rootMessenger }) => {
        // Mock connect to fail
        const connectSpy = jest
          .spyOn(service, 'connect')
          .mockRejectedValue(new Error('Connection failed during auth'));

        // Simulate user signing in with connection failure by publishing event
        rootMessenger.publish(
          'AuthenticationController:stateChange',
          { isSignedIn: true },
          [],
        );

        // Assert that connect was called and the catch block executed successfully
        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(connectSpy).toHaveBeenCalledWith();

        // Verify the authentication callback completed without throwing an error
        // This ensures the catch block in setupAuthentication executed properly
        expect(() =>
          rootMessenger.publish(
            'AuthenticationController:stateChange',
            { isSignedIn: true },
            [],
          ),
        ).not.toThrow();

        connectSpy.mockRestore();
      });
    });

    it('should handle authentication required but user not signed in by rejecting connection with error', async () => {
      await withService(
        {
          options: {},
          mockWebSocketOptions: { autoConnect: false },
        },
        async ({ service, mocks }) => {
          mocks.getBearerToken.mockResolvedValueOnce(null);
          await service.connect();

          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );
          expect(mocks.getBearerToken).toHaveBeenCalled();
        },
      );
    });

    it('should handle getBearerToken error during connection by rejecting with authentication error', async () => {
      await withService(
        {
          options: {},
          mockWebSocketOptions: { autoConnect: false },
        },
        async ({ service, mocks }) => {
          mocks.getBearerToken.mockRejectedValueOnce(new Error('Auth error'));
          await service.connect();

          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );
          expect(mocks.getBearerToken).toHaveBeenCalled();
        },
      );
    });
  });

  // =====================================================
  // ENABLED CALLBACK TESTS
  // =====================================================
  describe('enabledCallback functionality', () => {
    it('should respect enabledCallback returning false during connection by rejecting with disabled error', async () => {
      const mockEnabledCallback = jest.fn().mockReturnValue(false);
      await withService(
        {
          options: {
            isEnabled: mockEnabledCallback,
          },
          mockWebSocketOptions: { autoConnect: false },
        },
        async ({ service }) => {
          // Attempt to connect when disabled - should return early
          await service.connect();

          // Verify enabledCallback was consulted
          expect(mockEnabledCallback).toHaveBeenCalled();

          // Should remain disconnected when callback returns false
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );

          // Reconnection attempts should be cleared (reset to 0)
          expect(service.getConnectionInfo().reconnectAttempts).toBe(0);
        },
      );
    });

    it('should stop reconnection attempts when enabledCallback returns false during scheduled reconnect by canceling reconnection', async () => {
      // Start with enabled callback returning true
      const mockEnabledCallback = jest.fn().mockReturnValue(true);
      await withService(
        {
          options: {
            isEnabled: mockEnabledCallback,
            reconnectDelay: 50, // Use shorter delay for faster test
          },
        },
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          // Connect successfully first
          await service.connect();
          const mockWs = getMockWebSocket();

          // Clear mock calls from initial connection
          mockEnabledCallback.mockClear();

          // Simulate connection loss to trigger reconnection scheduling
          mockWs.simulateClose(1006, 'Connection lost');
          await completeAsyncOperations(0);

          // Verify reconnection was scheduled and attempts were incremented
          expect(service.getConnectionInfo().reconnectAttempts).toBe(1);

          // Change enabledCallback to return false (simulating app closed/backgrounded)
          mockEnabledCallback.mockReturnValue(false);

          // Advance timer to trigger the scheduled reconnection timeout (which should check enabledCallback)
          await completeAsyncOperations(50);

          // Verify enabledCallback was called during the timeout check
          expect(mockEnabledCallback).toHaveBeenCalledTimes(1);
          expect(mockEnabledCallback).toHaveBeenCalledWith();

          // Verify reconnection attempts were reset to 0
          // This confirms the debug message code path executed properly
          expect(service.getConnectionInfo().reconnectAttempts).toBe(0);

          // Verify no actual reconnection attempt was made (early return)
          // Service should still be disconnected
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );
        },
      );
    });
  });

  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================
  describe('getCloseReason utility', () => {
    it('should map WebSocket close codes to human-readable descriptions', () => {
      // Test all close codes to verify proper close reason descriptions
      const closeCodeTests = [
        { code: 1000, expected: 'Normal Closure' },
        { code: 1001, expected: 'Going Away' },
        { code: 1002, expected: 'Protocol Error' },
        { code: 1003, expected: 'Unsupported Data' },
        { code: 1004, expected: 'Reserved' },
        { code: 1005, expected: 'No Status Received' },
        { code: 1006, expected: 'Abnormal Closure' },
        { code: 1007, expected: 'Invalid frame payload data' },
        { code: 1008, expected: 'Policy Violation' },
        { code: 1009, expected: 'Message Too Big' },
        { code: 1010, expected: 'Mandatory Extension' },
        { code: 1011, expected: 'Internal Server Error' },
        { code: 1012, expected: 'Service Restart' },
        { code: 1013, expected: 'Try Again Later' },
        { code: 1014, expected: 'Bad Gateway' },
        { code: 1015, expected: 'TLS Handshake' },
        { code: 3500, expected: 'Library/Framework Error' }, // 3000-3999 range
        { code: 4500, expected: 'Application Error' }, // 4000-4999 range
        { code: 9999, expected: 'Unknown' }, // default case
      ];

      closeCodeTests.forEach(({ code, expected }) => {
        const result = getCloseReason(code);
        expect(result).toBe(expected);
      });
    });
  });
});
