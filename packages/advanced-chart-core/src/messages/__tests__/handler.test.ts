import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  _resetHandlersForTests,
  dispatchInboundMessage,
  registerHandler,
} from '../handler.js';

type MockBridge = {
  postMessage: Mock<(...args: [string]) => void>;
};

const installRNBridge = (): MockBridge => {
  const bridge: MockBridge = { postMessage: vi.fn() };
  window.ReactNativeWebView = bridge;
  return bridge;
};

describe('messages/handler', () => {
  beforeEach(() => {
    _resetHandlersForTests();
    delete window.ReactNativeWebView;
  });

  it('routes a typed message to the registered handler', () => {
    const handler = vi.fn();
    registerHandler('SET_THEME_COLORS', handler);

    dispatchInboundMessage({
      type: 'SET_THEME_COLORS',
      payload: { lineColor: 'rgb(255,255,255)' },
    });

    expect(handler).toHaveBeenCalledWith({ lineColor: 'rgb(255,255,255)' });
  });

  it('silently drops messages with no registered handler', () => {
    expect(() =>
      dispatchInboundMessage({
        type: 'SET_THEME_COLORS',
        payload: {},
      }),
    ).not.toThrow();
  });

  it('forwards handler errors to the ERROR channel', () => {
    const bridge = installRNBridge();
    registerHandler('SET_THEME_COLORS', () => {
      throw new Error('handler boom');
    });

    dispatchInboundMessage({
      type: 'SET_THEME_COLORS',
      payload: {},
    });

    expect(bridge.postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'ERROR',
        payload: { message: 'handler boom' },
      }),
    );
  });

  it('replacing a handler keeps the latest one only', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerHandler('SET_THEME_COLORS', first);
    registerHandler('SET_THEME_COLORS', second);

    dispatchInboundMessage({ type: 'SET_THEME_COLORS', payload: {} });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
