import type { ChartConfig } from '../../core/types.js';
import { createReactNativeHost } from '../reactNativeHost.js';

type MockBridge = {
  postMessage: jest.Mock<void, [string]>;
};

const installRNBridge = (): MockBridge => {
  const bridge: MockBridge = { postMessage: jest.fn() };
  window.ReactNativeWebView = bridge;
  return bridge;
};

describe('platform/reactNativeHost', () => {
  afterEach(() => {
    delete window.ReactNativeWebView;
    delete window.CONFIG;
    jest.restoreAllMocks();
  });

  describe('postMessage', () => {
    it('forwards the serialized string to window.ReactNativeWebView', () => {
      const bridge = installRNBridge();
      createReactNativeHost().postMessage('{"type":"CHART_READY"}');
      expect(bridge.postMessage).toHaveBeenCalledWith('{"type":"CHART_READY"}');
    });

    it('no-ops when the RN bridge is unavailable', () => {
      expect(() =>
        createReactNativeHost().postMessage('{"type":"DEBUG"}'),
      ).not.toThrow();
    });

    it('swallows postMessage failures', () => {
      const bridge = installRNBridge();
      bridge.postMessage.mockImplementation(() => {
        throw new Error('bridge dead');
      });
      expect(() =>
        createReactNativeHost().postMessage('{"type":"DEBUG"}'),
      ).not.toThrow();
    });
  });

  describe('subscribe', () => {
    let listeners: { window: EventListener[]; document: EventListener[] };

    beforeEach(() => {
      listeners = { window: [], document: [] };
      jest
        .spyOn(window, 'addEventListener')
        .mockImplementation(
          (type: string, listener: EventListenerOrEventListenerObject) => {
            if (type === 'message') {
              listeners.window.push(listener as EventListener);
            }
          },
        );
      jest
        .spyOn(document, 'addEventListener')
        .mockImplementation(
          (type: string, listener: EventListenerOrEventListenerObject) => {
            if (type === 'message') {
              listeners.document.push(listener as EventListener);
            }
          },
        );
      jest.spyOn(window, 'removeEventListener').mockImplementation();
      jest.spyOn(document, 'removeEventListener').mockImplementation();
    });

    it('subscribes to both window and document message events', () => {
      createReactNativeHost().subscribe(() => undefined);
      expect(listeners.window).toHaveLength(1);
      expect(listeners.document).toHaveLength(1);
    });

    it('delivers the raw event data to the listener', () => {
      const onMessage = jest.fn();
      createReactNativeHost().subscribe(onMessage);
      listeners.window[0]({ data: '{"type":"X"}' } as MessageEvent);
      expect(onMessage).toHaveBeenCalledWith('{"type":"X"}');
    });

    it('rejects messages from real web origins', () => {
      const onMessage = jest.fn();
      createReactNativeHost().subscribe(onMessage);
      listeners.window[0]({
        origin: 'https://evil.com',
        data: '{"type":"X"}',
      } as MessageEvent);
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('accepts null and file: origins', () => {
      const onMessage = jest.fn();
      createReactNativeHost().subscribe(onMessage);
      listeners.window[0]({ origin: 'null', data: 'a' } as MessageEvent);
      listeners.window[0]({
        origin: 'file:///index.html',
        data: 'b',
      } as MessageEvent);
      expect(onMessage).toHaveBeenCalledTimes(2);
    });

    it('returns an unsubscribe that removes both listeners', () => {
      const unsubscribe = createReactNativeHost().subscribe(() => undefined);
      unsubscribe();
      expect(window.removeEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
      expect(document.removeEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    });
  });

  describe('getConfig', () => {
    it('returns window.CONFIG', () => {
      const config = { libraryUrl: 'https://cdn/' } as ChartConfig;
      window.CONFIG = config;
      expect(createReactNativeHost().getConfig()).toBe(config);
    });

    it('returns undefined when window.CONFIG is absent', () => {
      expect(createReactNativeHost().getConfig()).toBeUndefined();
    });
  });
});
