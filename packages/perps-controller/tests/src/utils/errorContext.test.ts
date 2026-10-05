import {
  PERPS_ERROR_ACTION,
  PERPS_ERROR_COMPONENT,
  PERPS_ERROR_OPERATION,
  createPerpsErrorContext,
} from '../../../src/utils/errorContext.js';

describe('createPerpsErrorContext', () => {
  it('builds the standard logger payload', () => {
    expect(
      createPerpsErrorContext({
        contextName: 'PerpsController',
        method: 'performInitialization',
        provider: 'hyperliquid',
        network: 'mainnet',
        data: { attempt: 1 },
      }),
    ).toStrictEqual({
      tags: {
        feature: 'perps',
        provider: 'hyperliquid',
        network: 'mainnet',
      },
      context: {
        name: 'PerpsController',
        data: {
          method: 'performInitialization',
          attempt: 1,
        },
      },
    });
  });

  it('adds bounded dashboard tags without replacing diagnostic context', () => {
    expect(
      createPerpsErrorContext({
        contextName: 'PerpsController',
        method: 'reconnect',
        provider: 'hyperliquid',
        network: 'testnet',
        errorTags: {
          operation: PERPS_ERROR_OPERATION.ConnectionManagement,
          component: PERPS_ERROR_COMPONENT.ConnectionManager,
          action: PERPS_ERROR_ACTION.ConnectionConnection,
        },
        data: {
          operation: 'websocket_reconnect',
          symbol: 'BTC',
        },
      }),
    ).toStrictEqual({
      tags: {
        feature: 'perps',
        provider: 'hyperliquid',
        network: 'testnet',
        operation: 'connection_management',
        component: 'PerpsConnectionManager',
        action: 'connection_connection',
      },
      context: {
        name: 'PerpsController',
        data: {
          method: 'reconnect',
          operation: 'websocket_reconnect',
          symbol: 'BTC',
        },
      },
    });
  });

  it('does not promote diagnostic data to tags', () => {
    const result = createPerpsErrorContext({
      contextName: 'TradingService',
      method: 'cancelOrder',
      errorTags: {
        operation: PERPS_ERROR_OPERATION.OrderManagement,
        action: PERPS_ERROR_ACTION.OrderCancellation,
      },
      data: {
        accountId: 'eip155:1:0x123',
        message: 'Provider failed',
        symbol: 'BTC',
      },
    });

    expect(result.tags).toStrictEqual({
      feature: 'perps',
      operation: 'order_management',
      action: 'order_cancellation',
    });
    expect(result.context?.data).toMatchObject({
      accountId: 'eip155:1:0x123',
      message: 'Provider failed',
      symbol: 'BTC',
    });
  });
});
