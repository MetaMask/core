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
 * Helper to create a connected service for testing
 *
 * @param options - Test setup options
 * @returns Promise with service and cleanup function
 */
const createConnectedService = async (options: TestSetupOptions = {}) => {
  const setup = setupBackendWebSocketService(options);
  await setup.service.connect();
  return setup;
};

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
      const { service, completeAsyncOperations, cleanup } =
        setupBackendWebSocketService({
          options: {
            url: 'wss://custom.example.com',
            timeout: 5000,
          },
          mockWebSocketOptions: { autoConnect: false },
        });

      await completeAsyncOperations();

      expect(service).toBeInstanceOf(BackendWebSocketService);
      expect(service.getConnectionInfo().url).toBe('wss://custom.example.com');

      cleanup();
    });
  });

  // =====================================================
  // CONNECTION LIFECYCLE TESTS
  // =====================================================
  describe('connection lifecycle - connect / disconnect', () => {
    it('should connect successfully', async () => {
      const { service, spies, cleanup } = setupBackendWebSocketService();

      await service.connect();

      expect(service.getConnectionInfo().state).toBe(WebSocketState.CONNECTED);
      expect(spies.publish).toHaveBeenCalledWith(
        'BackendWebSocketService:connectionStateChanged',
        expect.objectContaining({ state: WebSocketState.CONNECTED }),
      );

      cleanup();
    });

    it('should not connect if already connected', async () => {
      const { service, spies, cleanup } = await createConnectedService();

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

      cleanup();
    });

    it('should handle connection timeout', async () => {
      const { service, completeAsyncOperations, cleanup } =
        setupBackendWebSocketService({
          options: { timeout: TEST_CONSTANTS.TIMEOUT_MS },
          mockWebSocketOptions: { autoConnect: false },
        });

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

      expect(service.getConnectionInfo().state).toBe(WebSocketState.ERROR);
      expect(service.getConnectionInfo()).toBeDefined();

      cleanup();
    });

    it('should reject operations when disconnected', async () => {
      const { service, cleanup } = setupBackendWebSocketService({
        mockWebSocketOptions: { autoConnect: false },
      });

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

      cleanup();
    });

    it('should handle request timeout and force reconnection', async () => {
      const { service, cleanup, getMockWebSocket } =
        setupBackendWebSocketService({
          options: { requestTimeout: 1000 },
        });

      await service.connect();
      const mockWs = getMockWebSocket();
      const closeSpy = jest.spyOn(mockWs, 'close');

      const requestPromise = service.sendRequest({
        event: 'timeout-test',
        data: { requestId: 'timeout-req-1', method: 'test', params: {} },
      });

      jest.advanceTimersByTime(1001);

      await expect(requestPromise).rejects.toThrow(
        'Request timeout after 1000ms',
      );
      expect(closeSpy).toHaveBeenCalledWith(
        1001,
        'Request timeout - forcing reconnect',
      );

      closeSpy.mockRestore();
      cleanup();
    });

    it('should hit WebSocket error and reconnection branches', async () => {
      const { service, cleanup, getMockWebSocket } =
        setupBackendWebSocketService();

      await service.connect();
      const mockWs = getMockWebSocket();

      // Test various WebSocket close scenarios to hit different branches
      mockWs.simulateClose(1006, 'Abnormal closure'); // Should trigger reconnection

      await flushPromises();

      // Advance time for reconnection logic
      jest.advanceTimersByTime(50);

      await flushPromises();

      // Test different error scenarios
      mockWs.simulateError();

      await flushPromises();

      // Test normal close (shouldn't reconnect)
      mockWs.simulateClose(1000, 'Normal closure');

      await flushPromises();

      // Verify service handled the error and close events
      expect(service.getConnectionInfo()).toBeDefined();
      expect([
        WebSocketState.DISCONNECTED,
        WebSocketState.ERROR,
        WebSocketState.CONNECTING,
      ]).toContain(service.getConnectionInfo().state);

      cleanup();
    });

    it('should handle reconnection failures and trigger error logging', async () => {
      const { service, completeAsyncOperations, cleanup, getMockWebSocket } =
        setupBackendWebSocketService({
          options: {
            reconnectDelay: 50, // Very short for testing
            maxReconnectDelay: 100,
          },
        });

      // Mock console.error to spy on specific error logging
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Connect first
      await service.connect();

      // Set up the mock to fail on all subsequent connect attempts
      let connectCallCount = 0;
      jest.spyOn(service, 'connect').mockImplementation(async () => {
        connectCallCount += 1;
        // Always fail on reconnection attempts (after initial successful connection)
        throw new Error(
          `Mocked reconnection failure attempt ${connectCallCount}`,
        );
      });

      // Get the mock WebSocket and simulate unexpected closure to trigger reconnection
      const mockWs = getMockWebSocket();
      mockWs.simulateClose(1006, 'Connection lost unexpectedly');
      await completeAsyncOperations();

      // Advance time to trigger the reconnection attempt which should now fail
      jest.advanceTimersByTime(75); // Advance past the reconnect delay to trigger setTimeout callback
      await completeAsyncOperations();

      // Verify the specific error message was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/❌ Reconnection attempt #\d+ failed:/u),
        expect.any(Error),
      );

      // Verify that the connect method was called (indicating reconnection was attempted)
      expect(connectCallCount).toBeGreaterThanOrEqual(1);

      // Clean up
      consoleErrorSpy.mockRestore();
      (service.connect as jest.Mock).mockRestore();
      cleanup();
    });

    it('should handle WebSocket close during connection establishment without reason', async () => {
      const { service, completeAsyncOperations, cleanup, getMockWebSocket } =
        setupBackendWebSocketService();

      // Connect and get the WebSocket instance
      await service.connect();

      const mockWs = getMockWebSocket();

      // Simulate close event without reason - this should hit line 918 (event.reason || 'none' falsy branch)
      mockWs.simulateClose(1006, undefined);
      await completeAsyncOperations();

      // Verify the service state changed due to the close event
      expect(service.name).toBeDefined();
      expect(service.getConnectionInfo().state).toBe(
        WebSocketState.DISCONNECTED,
      );

      cleanup();
    });

    it('should disconnect successfully when connected', async () => {
      const { service, cleanup } = await createConnectedService();

      await service.disconnect();

      expect(service.getConnectionInfo().state).toBe(
        WebSocketState.DISCONNECTED,
      );

      cleanup();
    });

    it('should handle disconnect when already disconnected', async () => {
      const { service, cleanup } = setupBackendWebSocketService();

      expect(() => service.disconnect()).not.toThrow();
      expect(service.getConnectionInfo().state).toBe(
        WebSocketState.DISCONNECTED,
      );

      cleanup();
    });

    it('should test getCloseReason functionality with all close codes', () => {
      const { cleanup } = setupBackendWebSocketService();

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
        // Test the getCloseReason utility function directly
        const result = getCloseReason(code);
        expect(result).toBe(expected);
      });

      cleanup();
    });

    it('should handle messenger publish errors during state changes', async () => {
      const { service, messenger, cleanup } = setupBackendWebSocketService();

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
      expect(service.getConnectionInfo()).toBeDefined();
      publishSpy.mockRestore();
      cleanup();
    });
  });

  // =====================================================
  // SUBSCRIPTION TESTS
  // =====================================================
  describe('subscribe', () => {
    it('should subscribe to channels successfully', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();

      const mockCallback = jest.fn();
      const mockWs = getMockWebSocket();

      const subscription = await createSubscription(service, mockWs, {
        channels: [TEST_CONSTANTS.TEST_CHANNEL],
        callback: mockCallback,
        requestId: 'test-subscribe-success',
        subscriptionId: TEST_CONSTANTS.SUBSCRIPTION_ID,
      });

      expect(subscription.subscriptionId).toBe(TEST_CONSTANTS.SUBSCRIPTION_ID);
      expect(typeof subscription.unsubscribe).toBe('function');

      cleanup();
    });

    it('should hit various error branches with comprehensive scenarios', async () => {
      const { service, getMockWebSocket, cleanup } =
        setupBackendWebSocketService();

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

      cleanup();
    });

    it('should handle unsubscribe errors and connection errors', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();
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
      cleanup();
    });

    it('should throw error when subscription response is missing subscription ID', async () => {
      const { service, cleanup } = await createConnectedService();
      const mockWs = (global as GlobalWithWebSocket).lastWebSocket;

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

      cleanup();
    });

    it('should throw subscription-specific error when channels fail to subscribe', async () => {
      const { service, cleanup } = await createConnectedService();

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

      cleanup();
    });

    it('should get subscription by channel', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();

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
      expect(service.getSubscriptionsByChannel('nonexistent')).toHaveLength(0);

      cleanup();
    });

    it('should find subscriptions by channel prefix', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();

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

      cleanup();
    });
  });

  // =====================================================
  // MESSAGE HANDLING TESTS
  // =====================================================
  describe('message handling', () => {
    it('should silently ignore invalid JSON and trigger parseMessage', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();
      const mockWs = getMockWebSocket();

      const channelCallback = jest.fn();
      service.addChannelCallback({
        channelName: 'test-channel',
        callback: channelCallback,
      });

      const subscriptionCallback = jest.fn();
      const testRequestId = 'test-parse-message-invalid-json';
      const subscriptionPromise = service.subscribe({
        channels: ['test-channel'],
        callback: subscriptionCallback,
        requestId: testRequestId,
      });

      const responseMessage = {
        id: testRequestId,
        data: {
          requestId: testRequestId,
          subscriptionId: 'test-sub-123',
          successful: ['test-channel'],
          failed: [],
        },
      };
      mockWs.simulateMessage(responseMessage);
      await subscriptionPromise;

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
        const invalidEvent = new MessageEvent('message', { data: invalidJson });
        mockWs.onmessage?.(invalidEvent);
      }

      expect(channelCallback).not.toHaveBeenCalled();
      expect(subscriptionCallback).not.toHaveBeenCalled();
      expect(service.getConnectionInfo().state).toBe(WebSocketState.CONNECTED);

      const validNotification = {
        event: 'notification',
        subscriptionId: 'test-sub-123',
        channel: 'test-channel',
        data: { message: 'valid notification after invalid json' },
      };
      mockWs.simulateMessage(validNotification);

      expect(subscriptionCallback).toHaveBeenCalledTimes(1);
      expect(subscriptionCallback).toHaveBeenCalledWith(validNotification);

      cleanup();
    });

    it('should not process messages with both subscriptionId and channel twice', async () => {
      const { service, completeAsyncOperations, getMockWebSocket, cleanup } =
        setupBackendWebSocketService();

      await service.connect();

      const subscriptionCallback = jest.fn();
      const channelCallback = jest.fn();
      const mockWs = getMockWebSocket();

      // Set up subscription callback
      const testRequestId = 'test-duplicate-handling-subscribe';
      const subscriptionPromise = service.subscribe({
        channels: ['test-channel'],
        callback: subscriptionCallback,
        requestId: testRequestId,
      });

      // Send subscription response
      const responseMessage = {
        id: testRequestId,
        data: {
          requestId: testRequestId,
          subscriptionId: 'sub-123',
          successful: ['test-channel'],
          failed: [],
        },
      };
      mockWs.simulateMessage(responseMessage);
      await completeAsyncOperations();
      await subscriptionPromise;

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

      cleanup();
    });

    it('should properly clear pending requests and their timeouts during disconnect', async () => {
      const { service, cleanup } = await createConnectedService();

      const requestPromise = service.sendRequest({
        event: 'test-request',
        data: { test: true },
      });

      await service.disconnect();

      await expect(requestPromise).rejects.toThrow('WebSocket disconnected');
      cleanup();
    });

    it('should handle WebSocket send error and call error handler', async () => {
      const { service, getMockWebSocket, cleanup } =
        setupBackendWebSocketService();

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

      cleanup();
    });

    it('should gracefully handle server responses for non-existent requests', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();
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
      expect(service.getConnectionInfo().state).toBe(WebSocketState.CONNECTED);
      cleanup();
    });

    it('should handle sendRequest error when sendMessage fails with non-Error object', async () => {
      const { service, cleanup } = await createConnectedService();

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
      expect(service.getConnectionInfo().state).toBe(WebSocketState.CONNECTED);

      sendMessageSpy.mockRestore();
      cleanup();
    });

    it('should handle channel messages when no channel callbacks are registered', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();
      const mockWs = getMockWebSocket();

      // Send a channel message when no callbacks are registered
      const channelMessage = {
        event: 'notification',
        channel: 'test-channel-no-callbacks',
        data: { message: 'test message' },
      };

      mockWs.simulateMessage(JSON.stringify(channelMessage));

      // Should not crash and remain connected
      expect(service.getConnectionInfo().state).toBe(WebSocketState.CONNECTED);
      cleanup();
    });

    it('should handle subscription notifications with falsy subscriptionId', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();
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
      expect(service.getConnectionInfo().state).toBe(WebSocketState.CONNECTED);
      cleanup();
    });

    it('should handle channel callback management comprehensively', async () => {
      const { service, cleanup } = setupBackendWebSocketService({
        mockWebSocketOptions: { autoConnect: false },
      });

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
      expect(service.removeChannelCallback('non-existent-channel')).toBe(false);

      cleanup();
    });
  });

  describe('authentication flows', () => {
    it('should handle authentication state changes - sign out', async () => {
      const { service, completeAsyncOperations, rootMessenger, cleanup } =
        setupBackendWebSocketService({
          options: {},
        });

      await completeAsyncOperations();

      // Start with signed in state by publishing event
      rootMessenger.publish(
        'AuthenticationController:stateChange',
        { isSignedIn: true },
        [],
      );
      await completeAsyncOperations();

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
      await completeAsyncOperations();

      // Assert that reconnection attempts were reset to 0 when user signs out
      expect(service.getConnectionInfo().reconnectAttempts).toBe(0);

      connectSpy.mockRestore();
      cleanup();
    });

    it('should throw error on authentication setup failure', async () => {
      // Mock messenger subscribe to throw error for authentication events
      const { messenger, cleanup } = setupBackendWebSocketService({
        options: {},
        mockWebSocketOptions: { autoConnect: false },
      });

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
      cleanup();
    });

    it('should handle authentication state change sign-in connection failure', async () => {
      const { service, completeAsyncOperations, rootMessenger, cleanup } =
        setupBackendWebSocketService({
          options: {},
        });

      await completeAsyncOperations();

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
      await completeAsyncOperations();

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
      cleanup();
    });

    it('should handle authentication required but user not signed in', async () => {
      const { service, mocks, cleanup } = setupBackendWebSocketService({
        options: {},
        mockWebSocketOptions: { autoConnect: false },
      });

      mocks.getBearerToken.mockResolvedValueOnce(null);
      await service.connect();

      expect(service.getConnectionInfo().state).toBe(
        WebSocketState.DISCONNECTED,
      );
      expect(mocks.getBearerToken).toHaveBeenCalled();

      cleanup();
    });

    it('should handle getBearerToken error during connection', async () => {
      const { service, mocks, cleanup } = setupBackendWebSocketService({
        options: {},
        mockWebSocketOptions: { autoConnect: false },
      });

      mocks.getBearerToken.mockRejectedValueOnce(new Error('Auth error'));
      await service.connect();

      expect(service.getConnectionInfo().state).toBe(
        WebSocketState.DISCONNECTED,
      );
      expect(mocks.getBearerToken).toHaveBeenCalled();

      cleanup();
    });

    it('should handle concurrent connect calls by awaiting existing connection promise', async () => {
      const { service, getMockWebSocket, completeAsyncOperations, cleanup } =
        setupBackendWebSocketService({
          mockWebSocketOptions: { autoConnect: false },
        });

      // Start first connection (will be in CONNECTING state)
      const firstConnect = service.connect();
      await completeAsyncOperations(10); // Allow connect to start

      expect(service.getConnectionInfo().state).toBe(WebSocketState.CONNECTING);

      // Start second connection while first is still connecting
      // This should await the existing connection promise
      const secondConnect = service.connect();

      // Complete the first connection
      const mockWs = getMockWebSocket();
      mockWs.triggerOpen();
      await completeAsyncOperations();

      // Both promises should resolve successfully
      await Promise.all([firstConnect, secondConnect]);

      expect(service.getConnectionInfo().state).toBe(WebSocketState.CONNECTED);

      cleanup();
    });

    it('should handle WebSocket error events during connection establishment', async () => {
      const { service, getMockWebSocket, completeAsyncOperations, cleanup } =
        setupBackendWebSocketService({
          mockWebSocketOptions: { autoConnect: false },
        });

      const connectPromise = service.connect();
      await completeAsyncOperations(10);

      // Trigger error event during connection phase
      const mockWs = getMockWebSocket();
      mockWs.simulateError();

      await expect(connectPromise).rejects.toThrow(
        'WebSocket connection error',
      );
      expect(service.getConnectionInfo().state).toBe(WebSocketState.ERROR);

      cleanup();
    });

    it('should handle WebSocket close events during connection establishment', async () => {
      const { service, getMockWebSocket, completeAsyncOperations, cleanup } =
        setupBackendWebSocketService({
          mockWebSocketOptions: { autoConnect: false },
        });

      const connectPromise = service.connect();
      await completeAsyncOperations(10);

      // Trigger close event during connection phase
      const mockWs = getMockWebSocket();
      mockWs.simulateClose(1006, 'Connection failed');

      await expect(connectPromise).rejects.toThrow(
        'WebSocket connection closed during connection',
      );

      cleanup();
    });

    it('should properly transition through disconnecting state during manual disconnect', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();

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

      cleanup();
    });
  });

  // =====================================================
  // ENABLED CALLBACK TESTS
  // =====================================================
  describe('enabledCallback functionality', () => {
    it('should respect enabledCallback returning false during connection', async () => {
      const mockEnabledCallback = jest.fn().mockReturnValue(false);
      const { service, completeAsyncOperations, cleanup } =
        setupBackendWebSocketService({
          options: {
            isEnabled: mockEnabledCallback,
          },
          mockWebSocketOptions: { autoConnect: false },
        });

      await completeAsyncOperations();

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
      cleanup();
    });

    it('should stop reconnection attempts when enabledCallback returns false during scheduled reconnect', async () => {
      // Start with enabled callback returning true
      const mockEnabledCallback = jest.fn().mockReturnValue(true);
      const { service, getMockWebSocket, cleanup } =
        setupBackendWebSocketService({
          options: {
            isEnabled: mockEnabledCallback,
            reconnectDelay: 50, // Use shorter delay for faster test
          },
        });

      // Connect successfully first
      await service.connect();
      const mockWs = getMockWebSocket();

      // Clear mock calls from initial connection
      mockEnabledCallback.mockClear();

      // Simulate connection loss to trigger reconnection scheduling
      mockWs.simulateClose(1006, 'Connection lost');
      await flushPromises();

      // Verify reconnection was scheduled and attempts were incremented
      expect(service.getConnectionInfo().reconnectAttempts).toBe(1);

      // Change enabledCallback to return false (simulating app closed/backgrounded)
      mockEnabledCallback.mockReturnValue(false);

      // Advance timer to trigger the scheduled reconnection timeout (which should check enabledCallback)
      jest.advanceTimersByTime(50);
      await flushPromises();

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
      cleanup();
    });

    it('should handle multiple subscriptions and unsubscriptions with different channels', async () => {
      const { service, getMockWebSocket, cleanup } =
        await createConnectedService();
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

      cleanup();
    });

    it('should handle sendRequest error scenarios', async () => {
      const { service, cleanup } = setupBackendWebSocketService();
      await service.connect();

      // Test sendRequest error handling when message sending fails
      const sendMessageSpy = jest
        .spyOn(service, 'sendMessage')
        .mockRejectedValue(new Error('Send failed'));

      await expect(
        service.sendRequest({ event: 'test', data: { test: 'value' } }),
      ).rejects.toStrictEqual(new Error('Send failed'));

      sendMessageSpy.mockRestore();
      cleanup();
    });

    it('should handle missing access token during URL building', async () => {
      // Test: No access token error during URL building
      // First getBearerToken call succeeds, second returns null
      const { service, spies, cleanup } = setupBackendWebSocketService();

      // First call succeeds, second call returns null
      spies.call
        .mockImplementationOnce(() =>
          Promise.resolve('valid-token-for-auth-check'),
        )
        .mockImplementationOnce(() => Promise.resolve(null));

      await expect(service.connect()).rejects.toStrictEqual(
        new Error('Failed to connect to WebSocket: No access token available'),
      );

      cleanup();
    });
  });
});
