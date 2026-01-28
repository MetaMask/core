/* eslint-disable @typescript-eslint/no-explicit-any */
// Mock for @nktkas/hyperliquid SDK

const mockExchangeClient = {
  order: jest.fn(),
  modify: jest.fn(),
  cancel: jest.fn(),
  usdClassTransfer: jest.fn(),
  usdSend: jest.fn(),
  withdraw3: jest.fn(),
  updateLeverage: jest.fn(),
  updateIsolatedMargin: jest.fn(),
  scheduleCancel: jest.fn(),
};

const mockInfoClient = {
  clearinghouseState: jest.fn(),
  accountState: jest.fn(),
  meta: jest.fn(),
  allMids: jest.fn(),
  userFills: jest.fn(),
  userFunding: jest.fn(),
  userFillsByTime: jest.fn(),
  metaAndAssetCtxs: jest.fn(),
  l2Book: jest.fn(),
  candleSnapshot: jest.fn(),
  openOrders: jest.fn(),
  orderStatus: jest.fn(),
};

const asyncDisposeSymbol = Symbol.for('asyncDispose');

const mockSubscriptionClient = {
  subscription: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  [asyncDisposeSymbol]: jest.fn(),
};

const mockWebSocketTransport = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  send: jest.fn(),
  [asyncDisposeSymbol]: jest.fn(),
};

const mockHttpTransport = {};

function createExchangeClient(): any {
  return mockExchangeClient;
}

function createInfoClient(): any {
  return mockInfoClient;
}

function createSubscriptionClient(): any {
  return mockSubscriptionClient;
}

function createWebSocketTransport(): any {
  return mockWebSocketTransport;
}

function createHttpTransport(): any {
  return mockHttpTransport;
}

export const ExchangeClient = createExchangeClient;
export const InfoClient = createInfoClient;
export const SubscriptionClient = createSubscriptionClient;
export const WebSocketTransport = createWebSocketTransport;
export const HttpTransport = createHttpTransport;

// Mock signing functions
export const actionSorter = jest.fn();
export const signL1Action = jest.fn();
