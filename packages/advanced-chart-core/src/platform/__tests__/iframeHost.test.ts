import type { ChartConfig } from '../../core/types.js';
import { createIframeHost } from '../iframeHost.js';

describe('platform/iframeHost', () => {
  afterEach(() => {
    delete window.CONFIG;
    jest.restoreAllMocks();
  });

  describe('postMessage', () => {
    it('posts to a provided target with the default origin', () => {
      const target = { postMessage: jest.fn() };
      createIframeHost({ target }).postMessage('{"type":"X"}');
      expect(target.postMessage).toHaveBeenCalledWith('{"type":"X"}', '*');
    });

    it('honors an explicit targetOrigin', () => {
      const target = { postMessage: jest.fn() };
      createIframeHost({ target, targetOrigin: 'https://app' }).postMessage(
        'payload',
      );
      expect(target.postMessage).toHaveBeenCalledWith(
        'payload',
        'https://app',
      );
    });

    it('resolves targetOrigin from document.referrer when it is in allowedOrigins', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://allowed-host.example.com/page',
        configurable: true,
      });
      const target = { postMessage: jest.fn() };
      createIframeHost({
        target,
        allowedOrigins: ['https://allowed-host.example.com'],
      }).postMessage('payload');
      expect(target.postMessage).toHaveBeenCalledWith(
        'payload',
        'https://allowed-host.example.com',
      );
      Object.defineProperty(document, 'referrer', {
        value: '',
        configurable: true,
      });
    });

    it('falls back to * when document.referrer is not in allowedOrigins', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://unknown.example.com/page',
        configurable: true,
      });
      const target = { postMessage: jest.fn() };
      createIframeHost({
        target,
        allowedOrigins: ['https://allowed-host.example.com'],
      }).postMessage('payload');
      expect(target.postMessage).toHaveBeenCalledWith('payload', '*');
      Object.defineProperty(document, 'referrer', {
        value: '',
        configurable: true,
      });
    });

    it('falls back to * when document.referrer is empty', () => {
      Object.defineProperty(document, 'referrer', {
        value: '',
        configurable: true,
      });
      const target = { postMessage: jest.fn() };
      createIframeHost({
        target,
        allowedOrigins: ['https://allowed-host.example.com'],
      }).postMessage('payload');
      expect(target.postMessage).toHaveBeenCalledWith('payload', '*');
    });

    it('defaults the target to window.parent', () => {
      const spy = jest.spyOn(window.parent, 'postMessage').mockImplementation();
      createIframeHost().postMessage('payload');
      expect(spy).toHaveBeenCalledWith('payload', '*');
    });

    it('swallows postMessage failures', () => {
      const target = {
        postMessage: jest.fn(() => {
          throw new Error('dead');
        }),
      };
      expect(() =>
        createIframeHost({ target }).postMessage('payload'),
      ).not.toThrow();
    });
  });

  describe('subscribe', () => {
    let listeners: EventListener[];

    beforeEach(() => {
      listeners = [];
      jest
        .spyOn(window, 'addEventListener')
        .mockImplementation(
          (type: string, listener: EventListenerOrEventListenerObject) => {
            if (type === 'message') {
              listeners.push(listener as EventListener);
            }
          },
        );
      jest.spyOn(window, 'removeEventListener').mockImplementation();
    });

    it('delivers raw event data when no allowedOrigins is set', () => {
      const onMessage = jest.fn();
      createIframeHost().subscribe(onMessage);
      listeners[0]({ origin: 'https://any', data: 'a' } as MessageEvent);
      expect(onMessage).toHaveBeenCalledWith('a');
    });

    it('delivers raw event data when allowedOrigins is empty', () => {
      const onMessage = jest.fn();
      createIframeHost({ allowedOrigins: [] }).subscribe(onMessage);
      listeners[0]({ origin: 'https://any', data: 'a' } as MessageEvent);
      expect(onMessage).toHaveBeenCalledWith('a');
    });

    it('drops messages from origins not in allowedOrigins', () => {
      const onMessage = jest.fn();
      createIframeHost({
        allowedOrigins: ['https://app', 'https://other'],
      }).subscribe(onMessage);
      listeners[0]({ origin: 'https://evil', data: 'a' } as MessageEvent);
      expect(onMessage).not.toHaveBeenCalled();
    });

    it('accepts messages from origins in allowedOrigins', () => {
      const onMessage = jest.fn();
      createIframeHost({
        allowedOrigins: ['https://app', 'https://other'],
      }).subscribe(onMessage);
      listeners[0]({ origin: 'https://app', data: 'a' } as MessageEvent);
      expect(onMessage).toHaveBeenCalledWith('a');
      listeners[0]({ origin: 'https://other', data: 'b' } as MessageEvent);
      expect(onMessage).toHaveBeenCalledWith('b');
    });

    it('returns an unsubscribe that removes the listener', () => {
      const unsubscribe = createIframeHost().subscribe(() => undefined);
      unsubscribe();
      expect(window.removeEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    });
  });

  describe('getConfig', () => {
    it('prefers the explicitly provided config', () => {
      const config = { libraryUrl: 'https://cdn/' } as ChartConfig;
      window.CONFIG = { libraryUrl: 'https://other/' } as ChartConfig;
      expect(createIframeHost({ config }).getConfig()).toBe(config);
    });

    it('falls back to window.CONFIG', () => {
      const config = { libraryUrl: 'https://cdn/' } as ChartConfig;
      window.CONFIG = config;
      expect(createIframeHost().getConfig()).toBe(config);
    });
  });
});
