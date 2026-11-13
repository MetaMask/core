import { rpcErrors } from '@metamask/rpc-errors';
import { describe, expect, it, vi } from 'vitest';

import type { ExtendedJsonRpcMiddleware } from './MultichainMiddlewareManager.js';
import { MultichainMiddlewareManager } from './MultichainMiddlewareManager.js';

const scope = 'eip155:1';
const origin = 'example.com';
const tabId = 123;

describe('MultichainMiddlewareManager', () => {
  it('should add middleware and get called for the scope, origin, and tabId if request is "eth_subscribe', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = vi.fn() as unknown as ExtendedJsonRpcMiddleware;
    multichainMiddlewareManager.addMiddleware({
      scope,
      origin,
      tabId,
      middleware: middlewareSpy,
    });

    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'eth_subscribe', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).toHaveBeenCalledWith(
      { jsonrpc: '2.0' as const, id: 0, method: 'eth_subscribe', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(nextSpy).not.toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('should add middleware and get called for the scope, origin, and tabId if request is "eth_unsubscribe', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = vi.fn() as unknown as ExtendedJsonRpcMiddleware;
    multichainMiddlewareManager.addMiddleware({
      scope,
      origin,
      tabId,
      middleware: middlewareSpy,
    });

    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'eth_unsubscribe', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).toHaveBeenCalledWith(
      { jsonrpc: '2.0' as const, id: 0, method: 'eth_unsubscribe', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(nextSpy).not.toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('should add middleware and call next if called for the scope, origin, and tabId but request is not "eth_subscribe" or "eth_unsubscribe"', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = vi.fn() as unknown as ExtendedJsonRpcMiddleware;
    multichainMiddlewareManager.addMiddleware({
      scope,
      origin,
      tabId,
      middleware: middlewareSpy,
    });

    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).not.toHaveBeenCalled();
    expect(nextSpy).toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('call next if no middleware exists for scope, origin, and tabId and request is not "eth_subscribe" or "eth_unsubscribe', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(nextSpy).toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('return error if no middleware exists for scope, origin, and tabId and request is "eth_subscribe"', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'eth_subscribe', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(nextSpy).not.toHaveBeenCalled();
    expect(endSpy).toHaveBeenCalledWith(rpcErrors.methodNotFound());
  });

  it('return error if no middleware exists for scope, origin, and tabId and request is "eth_unsubscribe"', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'eth_unsubscribe', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(nextSpy).not.toHaveBeenCalled();
    expect(endSpy).toHaveBeenCalledWith(rpcErrors.methodNotFound());
  });

  it('should remove middleware by origin and tabId when the multiplexing middleware is destroyed and the middleware has no destroy function', async () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = vi.fn() as unknown as ExtendedJsonRpcMiddleware;
    multichainMiddlewareManager.addMiddleware({
      scope,
      origin,
      tabId,
      middleware: middlewareSpy,
    });

    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    await middleware.destroy?.();

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).not.toHaveBeenCalled();
    expect(nextSpy).toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('should remove middleware by origin and tabId when the multiplexing middleware is destroyed and the middleware destroy function resolves', async () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = vi.fn() as unknown as ExtendedJsonRpcMiddleware;
    // eslint-disable-next-line vitest/prefer-spy-on
    middlewareSpy.destroy = vi.fn().mockResolvedValue(undefined);
    multichainMiddlewareManager.addMiddleware({
      scope,
      origin,
      tabId,
      middleware: middlewareSpy,
    });

    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    await middleware.destroy?.();

    expect(middlewareSpy.destroy).toHaveBeenCalled();

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).not.toHaveBeenCalled();
    expect(nextSpy).toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('should remove middleware by origin and tabId when the multiplexing middleware is destroyed and the middleware destroy function rejects', async () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = vi.fn() as unknown as ExtendedJsonRpcMiddleware;
    // eslint-disable-next-line vitest/prefer-spy-on
    middlewareSpy.destroy = vi
      .fn()
      .mockRejectedValue(
        new Error('failed to destroy the actual underlying middleware'),
      );
    multichainMiddlewareManager.addMiddleware({
      scope,
      origin,
      tabId,
      middleware: middlewareSpy,
    });

    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    await middleware.destroy?.();

    expect(middlewareSpy.destroy).toHaveBeenCalled();

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).not.toHaveBeenCalled();
    expect(nextSpy).toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('should remove middleware by scope', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = vi.fn() as unknown as ExtendedJsonRpcMiddleware;
    multichainMiddlewareManager.addMiddleware({
      scope,
      origin,
      tabId,
      middleware: middlewareSpy,
    });

    multichainMiddlewareManager.removeMiddlewareByScope(scope);

    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).not.toHaveBeenCalled();
    expect(nextSpy).toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('should remove middleware by scope and origin', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = vi.fn() as unknown as ExtendedJsonRpcMiddleware;
    multichainMiddlewareManager.addMiddleware({
      scope,
      origin,
      tabId,
      middleware: middlewareSpy,
    });

    multichainMiddlewareManager.removeMiddlewareByScopeAndOrigin(scope, origin);

    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).not.toHaveBeenCalled();
    expect(nextSpy).toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('should remove middleware by origin and tabId', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = vi.fn() as unknown as ExtendedJsonRpcMiddleware;
    multichainMiddlewareManager.addMiddleware({
      scope,
      origin,
      tabId,
      middleware: middlewareSpy,
    });

    multichainMiddlewareManager.removeMiddlewareByOriginAndTabId(origin, tabId);

    const middleware =
      multichainMiddlewareManager.generateMultichainMiddlewareForOriginAndTabId(
        origin,
        123,
      );

    const nextSpy = vi.fn();
    const endSpy = vi.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).not.toHaveBeenCalled();
    expect(nextSpy).toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });
});
