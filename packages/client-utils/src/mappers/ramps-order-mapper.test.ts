import type { RampsOrderLike } from './ramps-order-mapper.js';
import { mapRampsOrder } from './ramps-order-mapper.js';

const baseOrder: RampsOrderLike = {
  provider: { id: 'transak', name: 'Transak' },
  cryptoAmount: '0.05',
  fiatAmount: 100,
  cryptoCurrency: {
    assetId: 'eip155:1/slip44:60',
    symbol: 'ETH',
    decimals: 18,
  },
  fiatCurrency: { symbol: 'USD' },
  providerOrderId: 'order-123',
  providerOrderLink: 'https://transak.com/orders/order-123',
  createdAt: 1716367781000,
  totalFeesFiat: 2.5,
  txHash: '0xabc',
  walletAddress: '0xwallet',
  status: 'COMPLETED',
  network: { chainId: '1' },
  statusDescription: 'Your purchase was successful!',
  orderType: 'buy',
  paymentDetails: [{ fiatCurrency: 'USD', paymentMethod: 'card', fields: [] }],
};

describe('mapRampsOrder', () => {
  it('maps a completed buy order to a rampBuy activity item', () => {
    const item = mapRampsOrder(baseOrder);

    expect(item).toMatchObject({
      type: 'rampBuy',
      chainId: 'eip155:1',
      status: 'success',
      timestamp: 1716367781000,
      hash: '0xabc',
      id: 'order-123',
      data: {
        from: '0xwallet',
        fiat: { amount: '100', currency: 'USD' },
        token: {
          amount: '0.05',
          symbol: 'ETH',
          assetId: 'eip155:1/slip44:60',
          direction: 'in',
        },
        fees: [{ type: 'total', amount: '2.5', symbol: 'USD' }],
        provider: {
          id: 'transak',
          name: 'Transak',
          orderLink: 'https://transak.com/orders/order-123',
        },
        statusDescription: 'Your purchase was successful!',
        paymentDetails: [
          { fiatCurrency: 'USD', paymentMethod: 'card', fields: [] },
        ],
      },
    });
  });

  it('passes through an already-CAIP-formatted network chainId unchanged', () => {
    const item = mapRampsOrder({
      ...baseOrder,
      network: { chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' },
    });

    expect(item?.chainId).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
  });

  it('maps a sell order to a rampSell activity item with an outbound token direction', () => {
    const item = mapRampsOrder({ ...baseOrder, orderType: 'sell' });

    expect(item).toMatchObject({
      type: 'rampSell',
      data: { token: { direction: 'out' } },
    });
  });

  it('maps an uppercase BUY orderType (the real V2 API shape) to a rampBuy activity item', () => {
    const item = mapRampsOrder({ ...baseOrder, orderType: 'BUY' });

    expect(item).toMatchObject({
      type: 'rampBuy',
      data: { token: { direction: 'in' } },
    });
  });

  it('maps an uppercase SELL orderType (the real V2 API shape) to a rampSell activity item', () => {
    const item = mapRampsOrder({ ...baseOrder, orderType: 'SELL' });

    expect(item).toMatchObject({
      type: 'rampSell',
      data: { token: { direction: 'out' } },
    });
  });

  it('maps an empty txHash to an undefined hash while keeping the provider order id', () => {
    const item = mapRampsOrder({ ...baseOrder, txHash: '', status: 'PENDING' });

    expect(item?.hash).toBeUndefined();
    expect(item?.type === 'rampBuy' ? item.id : 'unset').toBe('order-123');
    expect(item?.status).toBe('pending');
  });

  it('maps a precreated stub order with an empty chain id to an undefined chainId, not eip155:0', () => {
    const item = mapRampsOrder({
      ...baseOrder,
      network: { chainId: '' },
      cryptoCurrency: undefined,
    });

    expect(item?.chainId).toBeUndefined();
  });

  it('falls through an unparseable network name to cryptoCurrency.chainId', () => {
    // Coinbase (and other generic providers) return network as a free-form
    // name string while still attaching a CAIP cryptoCurrency.chainId.
    const item = mapRampsOrder({
      ...baseOrder,
      network: 'ethereum',
      cryptoCurrency: {
        assetId: 'eip155:1/slip44:60',
        chainId: 'eip155:1',
        symbol: 'ETH',
        decimals: 18,
      },
    });

    expect(item?.chainId).toBe('eip155:1');
  });

  it('falls through an unparseable network name to cryptoCurrency.assetId', () => {
    const item = mapRampsOrder({
      ...baseOrder,
      network: 'ethereum',
      cryptoCurrency: { assetId: 'eip155:1/slip44:60', symbol: 'ETH' },
    });

    expect(item?.chainId).toBe('eip155:1');
  });

  it('returns an undefined chainId when network is an unparseable name and crypto currency has no chain', () => {
    const item = mapRampsOrder({
      ...baseOrder,
      network: 'ethereum',
      cryptoCurrency: undefined,
    });

    expect(item?.chainId).toBeUndefined();
  });

  it.each(['0x', '0x0000'])(
    'treats placeholder txHash %s as missing while keeping the order id',
    (txHash) => {
      const item = mapRampsOrder({ ...baseOrder, txHash });

      expect(item?.hash).toBeUndefined();
      expect(item?.type === 'rampBuy' ? item.id : 'unset').toBe('order-123');
    },
  );

  it.each([
    ['CREATED', 'pending'],
    ['PENDING', 'pending'],
    ['COMPLETED', 'success'],
    ['FAILED', 'failed'],
    ['CANCELLED', 'cancelled'],
  ] as const)(
    'maps RampsOrderStatus %s to Status %s',
    (rampsStatus, expectedStatus) => {
      const item = mapRampsOrder({ ...baseOrder, status: rampsStatus });

      expect(item?.status).toBe(expectedStatus);
    },
  );

  it.each(['UNKNOWN', 'ID_EXPIRED', 'PRECREATED'] as const)(
    'hides orders with RampsOrderStatus %s from the activity list',
    (rampsStatus) => {
      const item = mapRampsOrder({ ...baseOrder, status: rampsStatus });

      expect(item).toBeNull();
    },
  );

  it('hides orders excluded from purchases', () => {
    const item = mapRampsOrder({ ...baseOrder, excludeFromPurchases: true });

    expect(item).toBeNull();
  });

  it.each(['DEPOSIT', 'deposit'] as const)(
    'maps an orderType of %s to a rampBuy activity item',
    (orderType) => {
      const item = mapRampsOrder({ ...baseOrder, orderType });

      expect(item).toMatchObject({ type: 'rampBuy' });
    },
  );

  it('prefers the canonical order id over providerOrderId when present', () => {
    const item = mapRampsOrder({
      ...baseOrder,
      id: 'transak/orders/canonical-id',
    });

    expect(item).toMatchObject({ id: 'transak/orders/canonical-id' });
  });

  it('does not report a decimals field on the token amount, since cryptoAmount is already human-formatted', () => {
    const item = mapRampsOrder(baseOrder);

    expect(item).toMatchObject({
      data: { token: { amount: '0.05', symbol: 'ETH' } },
    });
    expect(
      item?.type === 'rampBuy' ? item.data.token : undefined,
    ).not.toHaveProperty('decimals');
  });

  it('degrades gracefully when optional fields are missing', () => {
    const minimalOrder: RampsOrderLike = {
      cryptoAmount: '0.05',
      fiatAmount: 100,
      providerOrderId: 'order-456',
      providerOrderLink: '',
      createdAt: 1716367781000,
      totalFeesFiat: 0,
      txHash: '',
      walletAddress: '0xwallet',
      status: 'CREATED',
      network: { chainId: '1' },
      orderType: 'buy',
    };

    expect(() => mapRampsOrder(minimalOrder)).not.toThrow();

    const item = mapRampsOrder(minimalOrder);

    expect(item).toMatchObject({
      type: 'rampBuy',
      data: {
        fiat: { amount: '100', currency: undefined },
        token: undefined,
        provider: { id: undefined, name: undefined },
        paymentDetails: undefined,
      },
    });
  });
});
