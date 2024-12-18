import type { ExtendedJsonRpcMiddleware } from './MultichainMiddlewareManager';
import { MultichainMiddlewareManager } from './MultichainMiddlewareManager';

const scope = 'eip155:1';
const origin = 'example.com';
const tabId = 123;

describe('MultichainMiddlewareManager', () => {
  it('should add middleware and get called for the scope, origin, and tabId', () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = jest.fn() as unknown as ExtendedJsonRpcMiddleware;
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

    const nextSpy = jest.fn();
    const endSpy = jest.fn();

    middleware(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(middlewareSpy).toHaveBeenCalledWith(
      { jsonrpc: '2.0' as const, id: 0, method: 'method', scope },
      { jsonrpc: '2.0', id: 0 },
      nextSpy,
      endSpy,
    );
    expect(nextSpy).not.toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('should remove middleware by origin and tabId when the multiplexing middleware is destroyed and the middleware has no destroy function', async () => {
    const multichainMiddlewareManager = new MultichainMiddlewareManager();
    const middlewareSpy = jest.fn() as unknown as ExtendedJsonRpcMiddleware;
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

    const nextSpy = jest.fn();
    const endSpy = jest.fn();

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
    const middlewareSpy = jest.fn() as unknown as ExtendedJsonRpcMiddleware;
    // eslint-disable-next-line jest/prefer-spy-on
    middlewareSpy.destroy = jest.fn().mockResolvedValue(undefined);
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

    const nextSpy = jest.fn();
    const endSpy = jest.fn();

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
    const middlewareSpy = jest.fn() as unknown as ExtendedJsonRpcMiddleware;
    // eslint-disable-next-line jest/prefer-spy-on
    middlewareSpy.destroy = jest
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

    const nextSpy = jest.fn();
    const endSpy = jest.fn();

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
    const middlewareSpy = jest.fn() as unknown as ExtendedJsonRpcMiddleware;
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

    const nextSpy = jest.fn();
    const endSpy = jest.fn();

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
    const middlewareSpy = jest.fn() as unknown as ExtendedJsonRpcMiddleware;
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

    const nextSpy = jest.fn();
    const endSpy = jest.fn();

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
    const middlewareSpy = jest.fn() as unknown as ExtendedJsonRpcMiddleware;
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

    const nextSpy = jest.fn();
    const endSpy = jest.fn();

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
