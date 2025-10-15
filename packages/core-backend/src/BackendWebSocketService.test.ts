import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';

import {
  BackendWebSocketService,
  getCloseReason,
  WebSocketState,
  type BackendWebSocketServiceOptions,
  type BackendWebSocketServiceMessenger,
} from './BackendWebSocketService';
import { flushPromises } from '../../../tests/helpers';

// =====================================================
// TYPES
// =====================================================

// Type for global object with WebSocket mock
type GlobalWithWebSocket = typeof global & { lastWebSocket: MockWebSocket };

type AllBackendWebSocketServiceActions =
  MessengerActions<BackendWebSocketServiceMessenger>;

type AllBackendWebSocketServiceEvents =
  MessengerEvents<BackendWebSocketServiceMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllBackendWebSocketServiceActions,
  AllBackendWebSocketServiceEvents
>;

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

  // Track total instances created for testing
  private static instanceCount = 0;

  public static getInstanceCount(): number {
    return MockWebSocket.instanceCount;
  }

  public static resetInstanceCount(): void {
    MockWebSocket.instanceCount = 0;
  }

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
    MockWebSocket.instanceCount += 1;
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
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Creates a real messenger with registered mock actions for testing
 * Each call creates a completely independent messenger to ensure test isolation
 *
 * @returns Object containing the messenger and mock action functions
 */
const getMessenger = () => {
  // Create a unique root messenger for each test
  const rootMessenger = getRootMessenger();
  const messenger = new Messenger<
    'BackendWebSocketService',
    AllBackendWebSocketServiceActions,
    AllBackendWebSocketServiceEvents,
    RootMessenger
  >({
    namespace: 'BackendWebSocketService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: ['AuthenticationController:getBearerToken'],
    events: [
      'AuthenticationController:stateChange',
      'KeyringController:lock',
      'KeyringController:unlock',
    ],
    messenger,
  });

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
  rootMessenger: RootMessenger;
  mocks: {
    getBearerToken: jest.Mock;
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
  rootMessenger: RootMessenger;
  mocks: {
    getBearerToken: jest.Mock;
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
    completeAsyncOperations,
    getMockWebSocket,
    cleanup: () => {
      service?.destroy();
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

  MockWebSocket.resetInstanceCount();

  const setup = setupBackendWebSocketService({ options, mockWebSocketOptions });

  try {
    return await testFunction({
      service: setup.service,
      messenger: setup.messenger,
      rootMessenger: setup.rootMessenger,
      mocks: setup.mocks,
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
 * @param options.channelType - Channel type identifier
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
    channelType?: string;
  },
) => {
  const {
    channels,
    callback,
    requestId,
    subscriptionId = 'test-sub',
    channelType = 'test-channel.v1',
  } = options;

  const subscriptionPromise = service.subscribe({
    channels,
    channelType,
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

    it('should apply default values for options not provided', async () => {
      await withService(
        {
          options: {
            url: 'ws://test.example.com',
            timeout: undefined,
            reconnectDelay: undefined,
            maxReconnectDelay: undefined,
            requestTimeout: undefined,
          },
        },
        async ({ service }) => {
          expect(service.getConnectionInfo().url).toBe('ws://test.example.com');
          expect(service.getConnectionInfo().timeout).toBe(10000);
          expect(service.getConnectionInfo().reconnectDelay).toBe(500);
          expect(service.getConnectionInfo().maxReconnectDelay).toBe(5000);
          expect(service.getConnectionInfo().requestTimeout).toBe(30000);
          expect(service).toBeInstanceOf(BackendWebSocketService);
        },
      );
    });
  });

  // =====================================================
  // CONNECTION LIFECYCLE TESTS
  // =====================================================
  describe('connection lifecycle - connect / disconnect', () => {
    it('should establish WebSocket connection and set state to CONNECTED, publishing state change event', async () => {
      await withService(async ({ service, messenger }) => {
        const connectionStateChangedListener = jest.fn();
        messenger.subscribe(
          'BackendWebSocketService:connectionStateChanged',
          connectionStateChangedListener,
        );

        await service.connect();

        const connectionInfo = service.getConnectionInfo();
        expect(connectionInfo.state).toBe(WebSocketState.CONNECTED);
        expect(connectionInfo.reconnectAttempts).toBe(0);
        expect(connectionInfo.url).toBe('ws://localhost:8080');

        expect(connectionStateChangedListener).toHaveBeenCalledWith(
          expect.objectContaining({
            state: WebSocketState.CONNECTED,
            reconnectAttempts: 0,
          }),
        );
      });
    });

    it('should prevent race condition when multiple concurrent connect() calls are made', async () => {
      await withService(async ({ service }) => {
        // Simulate multiple concurrent connect() calls (as would happen from
        // KeyringController:unlock, AuthenticationController:stateChange, and
        // MetaMaskController.isClientOpen all firing at once)
        const connectPromises = [
          service.connect(),
          service.connect(),
          service.connect(),
        ];

        // Wait for all promises to resolve
        await Promise.all(connectPromises);

        // Verify only ONE WebSocket connection was created
        expect(MockWebSocket.getInstanceCount()).toBe(1);

        // Verify service is in CONNECTED state
        const connectionInfo = service.getConnectionInfo();
        expect(connectionInfo.state).toBe(WebSocketState.CONNECTED);
      });
    });

    it('should handle rapid sequential connect() calls after promise clears without creating duplicates', async () => {
      await withService(async ({ service }) => {
        // First connection
        await service.connect();
        expect(MockWebSocket.getInstanceCount()).toBe(1);
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );

        // Multiple calls after connection is established should not create new connections
        await Promise.all([
          service.connect(),
          service.connect(),
          service.connect(),
        ]);

        // Should still be only 1 connection
        expect(MockWebSocket.getInstanceCount()).toBe(1);
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );
      });
    });

    it('should handle interleaved connect() calls during async getBearerToken without duplicates', async () => {
      await withService(
        { mockWebSocketOptions: { autoConnect: false } },
        async ({ service, getMockWebSocket, mocks }) => {
          // Make getBearerToken async to simulate the race window
          let getBearerTokenResolve: ((value: string) => void) | null = null;
          mocks.getBearerToken.mockImplementation(() => {
            return new Promise<string>((resolve) => {
              getBearerTokenResolve = resolve;
            });
          });

          // Start first connect (will wait on getBearerToken)
          const connect1 = service.connect();

          // Immediately start second connect (should wait for first)
          const connect2 = service.connect();

          // Immediately start third connect (should also wait)
          const connect3 = service.connect();

          // Now resolve the getBearerToken
          expect(getBearerTokenResolve).not.toBeNull();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          getBearerTokenResolve!('test-token');

          // Wait a tick for the token resolution to propagate
          await flushPromises();

          // Manually trigger WebSocket open
          getMockWebSocket().triggerOpen();

          // Wait for all connections to complete
          await Promise.all([connect1, connect2, connect3]);

          // Should only have created ONE WebSocket
          expect(MockWebSocket.getInstanceCount()).toBe(1);
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.CONNECTED,
          );
        },
      );
    });

    it('should handle connection timeout by rejecting with timeout error and setting state to ERROR', async () => {
      await withService(
        {
          options: { timeout: TEST_CONSTANTS.TIMEOUT_MS },
          mockWebSocketOptions: { autoConnect: false },
        },
        async ({ service, completeAsyncOperations }) => {
          const connectPromise = service.connect().catch((error) => error);

          await completeAsyncOperations(TEST_CONSTANTS.TIMEOUT_MS + 50);

          const error = await connectPromise;
          expect(error.message).toBe(
            `Failed to connect to WebSocket: Connection timeout after ${TEST_CONSTANTS.TIMEOUT_MS}ms`,
          );
          expect(service.getConnectionInfo().state).toBe(WebSocketState.ERROR);
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

          expect(() =>
            service.sendMessage({ event: 'test', data: { requestId: 'test' } }),
          ).toThrow('Cannot send message: WebSocket is disconnected');
          await expect(
            service.sendRequest({ event: 'test', data: {} }),
          ).rejects.toThrow('Cannot send request: WebSocket is disconnected');
          await expect(
            service.subscribe({
              channels: ['test'],
              channelType: 'test.v1',
              callback: jest.fn(),
            }),
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

    it('should disconnect WebSocket connection and set state to DISCONNECTED when connected', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );

        const mockWs = getMockWebSocket();

        // Mock the close method to simulate the close event
        mockWs.close.mockImplementation(
          (code = 1000, reason = 'Normal closure') => {
            mockWs.simulateClose(code, reason);
          },
        );

        await service.disconnect();

        const connectionInfo = service.getConnectionInfo();
        expect(connectionInfo.state).toBe(WebSocketState.DISCONNECTED);
        expect(connectionInfo.url).toBe('ws://localhost:8080'); // URL persists after disconnect
        expect(connectionInfo.reconnectAttempts).toBe(0);
      });
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

    it('should remain in CONNECTED state when trying to connect again', async () => {
      await withService(async ({ service }) => {
        await service.connect();
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );

        // Connect again
        await service.connect();
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );
      });
    });

    it('should wait for existing connection promise when already connecting', async () => {
      await withService(
        { mockWebSocketOptions: { autoConnect: false } },
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          const firstConnect = service.connect();
          await completeAsyncOperations(10);

          // Start second connection while first is connecting
          const secondConnect = service.connect();

          // Complete the connection
          const mockWs = getMockWebSocket();
          mockWs.triggerOpen();

          await Promise.all([firstConnect, secondConnect]);
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.CONNECTED,
          );
        },
      );
    });

    it('should remain in DISCONNECTED state when trying to disconnect again', async () => {
      await withService(async ({ service }) => {
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.DISCONNECTED,
        );

        // Disconnect when already disconnected
        await service.disconnect();
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.DISCONNECTED,
        );
      });
    });

    it('should handle WebSocket close during connection phase', async () => {
      await withService(
        { mockWebSocketOptions: { autoConnect: false } },
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          const connectPromise = service.connect();
          await completeAsyncOperations(10);

          const mockWs = getMockWebSocket();
          mockWs.simulateClose(1006, 'Connection failed');

          await expect(connectPromise).rejects.toThrow(
            'WebSocket connection closed during connection',
          );
        },
      );
    });

    it('should handle unexpected disconnect with empty reason by using default close reason', async () => {
      await withService(
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          await service.connect();

          const mockWs = getMockWebSocket();
          // Simulate unexpected disconnect with empty reason string
          // This triggers the getCloseReason fallback in the trace call
          mockWs.simulateClose(1006, '');

          await completeAsyncOperations(0);

          // Verify state changed to disconnected (trace was called)
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );
        },
      );
    });

    it('should handle unexpected disconnect with custom reason', async () => {
      await withService(
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          await service.connect();

          const mockWs = getMockWebSocket();
          // Simulate unexpected disconnect with custom reason string
          // This uses event.reason directly in the trace call
          mockWs.simulateClose(1006, 'Custom unexpected disconnect reason');

          await completeAsyncOperations(0);

          // Verify state changed to disconnected (trace was called)
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );
        },
      );
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
          channelType: 'test-channel-error.v1',
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
          channelType: 'invalid-test.v1',
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

    it('should return false when checking for non-existent channel subscription', async () => {
      await withService(async ({ service }) => {
        expect(service.channelHasSubscription('non-existent')).toBe(false);
      });
    });

    it('should return true when checking for existing channel subscription and return false when checking for non-existent channel subscription', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();
        const mockCallback = jest.fn();

        const subscribePromise = service.subscribe({
          channels: ['test-channel'],
          channelType: 'test-channel.v1',
          callback: mockCallback,
          requestId: 'test-sub-id',
        });

        mockWs.simulateMessage({
          id: 'test-sub-id',
          data: {
            requestId: 'test-sub-id',
            subscriptionId: 'sub-123',
            successful: ['test-channel'],
            failed: [],
          },
        });

        const subscription = await subscribePromise;

        expect(service.channelHasSubscription('test-channel')).toBe(true);

        // Test unsubscribe cleanup
        const unsubscribePromise = subscription.unsubscribe('unsub-req-id');

        mockWs.simulateMessage({
          id: 'unsub-req-id',
          data: {
            requestId: 'unsub-req-id',
            successful: ['test-channel'],
            failed: [],
          },
        });

        await unsubscribePromise;

        // Subscription should be cleaned up
        expect(service.channelHasSubscription('test-channel')).toBe(false);
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
          timestamp: 1760344704595,
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
          timestamp: 1760344704595,
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
          timestamp: 1760344704696,
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
        expect(() => service.sendMessage(testMessage)).toThrow('Send failed');
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

    it('should handle server responses for non-existent requests gracefully', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        // Send response for non-existent request
        mockWs.simulateMessage({
          event: 'response',
          data: {
            requestId: 'non-existent-request',
            result: 'test',
          },
        });

        // Should not crash
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );
      });
    });

    it('should handle channel messages when no callbacks are registered', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        // Send channel message with no callbacks registered
        mockWs.simulateMessage({
          event: 'notification',
          channel: 'test-channel',
          data: { test: 'data' },
          timestamp: 1760344704595,
        });

        // Should not crash
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.CONNECTED,
        );
      });
    });

    it('should handle subscription notifications with null subscriptionId', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        const channelCallback = jest.fn();
        service.addChannelCallback({
          channelName: 'test-channel',
          callback: channelCallback,
        });

        // Send notification with null subscriptionId
        const notification = {
          event: 'notification',
          channel: 'test-channel',
          subscriptionId: null,
          data: { test: 'data' },
          timestamp: 1760344704595,
        };

        mockWs.simulateMessage(notification);

        // Should fall through to channel callback
        expect(channelCallback).toHaveBeenCalledWith(notification);
      });
    });

    it('should handle notifications with unknown subscriptionId by falling through to channel callback', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        const channelCallback = jest.fn();
        service.addChannelCallback({
          channelName: 'test-channel',
          callback: channelCallback,
        });

        // Send notification with subscriptionId that doesn't exist in subscriptions map
        const notification = {
          event: 'notification',
          channel: 'test-channel',
          subscriptionId: 'non-existent-sub-id',
          data: { test: 'data' },
          timestamp: 1760344704595,
        };

        mockWs.simulateMessage(notification);

        // Should fall through to channel callback since subscription doesn't exist
        expect(channelCallback).toHaveBeenCalledWith(notification);
      });
    });

    it('should handle sendRequest errors when sendMessage fails', async () => {
      await withService(async ({ service }) => {
        await service.connect();

        jest.spyOn(service, 'sendMessage').mockImplementation(() => {
          throw new Error('Send failed');
        });

        await expect(
          service.sendRequest({ event: 'test', data: {} }),
        ).rejects.toThrow('Send failed');
      });
    });

    it('should handle sendRequest errors with non-Error objects', async () => {
      await withService(async ({ service }) => {
        await service.connect();

        jest.spyOn(service, 'sendMessage').mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'String error';
        });

        await expect(
          service.sendRequest({ event: 'test', data: {} }),
        ).rejects.toThrow('String error');
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
      });
    });

    it('should trigger connection when KeyringController:unlock event is published', async () => {
      await withService(async ({ service, rootMessenger }) => {
        const connectSpy = jest.spyOn(service, 'connect');

        rootMessenger.publish('KeyringController:unlock');

        expect(connectSpy).toHaveBeenCalled();
      });
    });

    it('should trigger disconnection when KeyringController:lock event is published', async () => {
      await withService(async ({ service, rootMessenger }) => {
        await service.connect();
        const disconnectSpy = jest.spyOn(service, 'disconnect');

        rootMessenger.publish('KeyringController:lock');

        expect(disconnectSpy).toHaveBeenCalled();
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

          await expect(service.connect()).rejects.toThrow(
            'Authentication required: user not signed in',
          );

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
          const authError = new Error('Auth error');
          mocks.getBearerToken.mockRejectedValueOnce(authError);

          await expect(service.connect()).rejects.toThrow('Auth error');

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

    it('should stop reconnection when isEnabled returns false during scheduled reconnect', async () => {
      const mockEnabledCallback = jest.fn().mockReturnValue(true);
      await withService(
        {
          options: {
            isEnabled: mockEnabledCallback,
            reconnectDelay: 50,
          },
        },
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          await service.connect();
          const mockWs = getMockWebSocket();

          mockEnabledCallback.mockClear();

          // Simulate connection loss
          mockWs.simulateClose(1006, 'Connection lost');
          await completeAsyncOperations(0);

          expect(service.getConnectionInfo().reconnectAttempts).toBe(1);

          // Disable the service
          mockEnabledCallback.mockReturnValue(false);

          // Advance time to trigger reconnection check
          await completeAsyncOperations(50);

          // Should have checked isEnabled and stopped reconnection
          expect(mockEnabledCallback).toHaveBeenCalled();
          expect(service.getConnectionInfo().reconnectAttempts).toBe(0);
          expect(service.getConnectionInfo().state).toBe(
            WebSocketState.DISCONNECTED,
          );
        },
      );
    });

    it('should continue reconnection attempts when reconnect fails', async () => {
      await withService(
        {
          options: {
            reconnectDelay: 50,
          },
        },
        async ({ service, getMockWebSocket, completeAsyncOperations }) => {
          await service.connect();
          const mockWs = getMockWebSocket();

          // Simulate connection loss
          mockWs.simulateClose(1006, 'Connection lost');
          await completeAsyncOperations(0);

          const connectSpy = jest
            .spyOn(service, 'connect')
            .mockRejectedValue(new Error('Reconnect failed'));

          // Advance time to trigger first reconnection attempt
          await completeAsyncOperations(50);

          // Should have attempted to reconnect
          expect(connectSpy).toHaveBeenCalled();
        },
      );
    });
  });

  // =====================================================
  // LIFECYCLE AND CLEANUP TESTS
  // =====================================================
  describe('destroy', () => {
    it('should clean up all resources including timers, subscriptions, and pending requests on destroy', async () => {
      await withService(async ({ service, getMockWebSocket }) => {
        await service.connect();
        const mockWs = getMockWebSocket();

        // Create a subscription
        const mockCallback = jest.fn();
        await createSubscription(service, mockWs, {
          channels: ['test-cleanup'],
          callback: mockCallback,
          requestId: 'cleanup-test',
          subscriptionId: 'cleanup-sub',
        });

        // Start a request (to create pending request)
        const requestPromise = service.sendRequest({
          event: 'test-event',
          data: {},
        });

        // Destroy the service
        service.destroy();

        // Pending request should be rejected
        await expect(requestPromise).rejects.toThrow('Service cleanup');

        // Verify service is in disconnected state
        expect(service.getConnectionInfo().state).toBe(
          WebSocketState.DISCONNECTED,
        );
      });
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
