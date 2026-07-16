import { RampsOrderStatus } from '../RampsService';
import type { RampsOrder } from '../RampsService';
import { USER_STORAGE_VERSION, USER_STORAGE_VERSION_KEY } from './constants';
import type { SyncRampsOrder, UserStorageRampsOrderEntry } from './types';
import {
  areOrdersEqual,
  createOrderStorageKey,
  isSyncableOrder,
  mapRampsOrderToUserStorageEntry,
  mapUserStorageEntryToRampsOrder,
  stripDeletedAt,
  stripSyncMetadata,
} from './utils';

function createMockOrder(overrides: Partial<RampsOrder> = {}): RampsOrder {
  return {
    id: '/providers/transak/orders/abc-123',
    isOnlyLink: false,
    provider: {
      id: 'transak',
      name: 'Transak',
      environmentType: 'PRODUCTION',
      logos: { light: {}, dark: {} },
      links: [],
      deliveryTime: 5,
      orderFrequency: null,
    } as RampsOrder['provider'],
    success: true,
    cryptoAmount: 0.05,
    fiatAmount: 100,
    cryptoCurrency: { symbol: 'ETH', decimals: 18 },
    fiatCurrency: { symbol: 'USD', decimals: 2, denomSymbol: '$' },
    providerOrderId: 'abc-123',
    providerOrderLink: 'https://transak.com/order/abc-123',
    createdAt: 1700000000000,
    paymentMethod: { id: '/payments/debit-credit-card', name: 'Card' },
    totalFeesFiat: 5,
    txHash: '',
    walletAddress: '0xabc',
    status: RampsOrderStatus.Completed,
    network: { chainId: '1', name: 'Ethereum Mainnet' },
    canBeUpdated: false,
    idHasExpired: false,
    excludeFromPurchases: false,
    timeDescriptionPending: '',
    orderType: 'BUY',
    exchangeRate: 2000,
    ...overrides,
  };
}

describe('order-syncing/utils', () => {
  describe('createOrderStorageKey', () => {
    it('prefers the code embedded in the order id path', () => {
      expect(
        createOrderStorageKey({
          id: '/providers/transak/orders/order-1',
          providerOrderId: 'provider-native-id',
        }),
      ).toBe('order-1');
    });

    it('falls back to providerOrderId', () => {
      expect(
        createOrderStorageKey({
          providerOrderId: 'provider-native-id',
        }),
      ).toBe('provider-native-id');
    });

    it('trims whitespace from providerOrderId keys', () => {
      expect(
        createOrderStorageKey({
          providerOrderId: '  provider-native-id  ',
        }),
      ).toBe('provider-native-id');
    });

    it('returns an empty key when providerOrderId is missing', () => {
      expect(createOrderStorageKey({})).toBe('');
    });
  });

  describe('isSyncableOrder', () => {
    it('returns true when providerOrderId is present', () => {
      expect(isSyncableOrder(createMockOrder())).toBe(true);
    });

    it('returns true when only the order id path is present', () => {
      expect(
        isSyncableOrder(
          createMockOrder({
            providerOrderId: '',
            id: '/providers/transak/orders/order-from-id',
          }),
        ),
      ).toBe(true);
    });

    it('returns false when both id and providerOrderId are missing', () => {
      expect(
        isSyncableOrder(
          createMockOrder({ id: undefined, providerOrderId: '' }),
        ),
      ).toBe(false);
    });

    it('accepts minimal id/providerOrderId picks', () => {
      expect(
        isSyncableOrder({
          id: '/providers/transak/orders/order-from-id',
          providerOrderId: 'provider-native-id',
        }),
      ).toBe(true);
    });
  });

  describe('mapRampsOrderToUserStorageEntry / mapUserStorageEntryToRampsOrder', () => {
    it('defaults lastUpdatedAt when mapping to storage', () => {
      const entry = mapRampsOrderToUserStorageEntry(createMockOrder());

      expect(entry.lu).toStrictEqual(expect.any(Number));
    });

    it('maps storage entries without lastUpdatedAt metadata', () => {
      const entry: UserStorageRampsOrderEntry = {
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        o: createMockOrder(),
      };

      const mapped = mapUserStorageEntryToRampsOrder(entry);
      expect(mapped.lastUpdatedAt).toBeUndefined();
    });

    it('round-trips a full order with sync metadata', () => {
      const order: SyncRampsOrder = {
        ...createMockOrder(),
        lastUpdatedAt: 1700000001000,
      };

      const entry = mapRampsOrderToUserStorageEntry(order);

      expect(entry[USER_STORAGE_VERSION_KEY]).toBe(USER_STORAGE_VERSION);
      expect(entry.o.providerOrderId).toBe('abc-123');
      expect(entry.lu).toBe(1700000001000);
      expect(entry.dt).toBeUndefined();

      const mapped = mapUserStorageEntryToRampsOrder(entry);
      expect(mapped.providerOrderId).toBe('abc-123');
      expect(mapped.lastUpdatedAt).toBe(1700000001000);
      expect(mapped.deletedAt).toBeUndefined();
    });

    it('preserves soft-delete tombstones', () => {
      const entry: UserStorageRampsOrderEntry = {
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        o: createMockOrder(),
        lu: 1700000002000,
        dt: 1700000002000,
      };

      const mapped = mapUserStorageEntryToRampsOrder(entry);
      expect(mapped.deletedAt).toBe(1700000002000);
    });
  });

  describe('stripSyncMetadata', () => {
    it('removes lastUpdatedAt and deletedAt', () => {
      const stripped = stripSyncMetadata({
        ...createMockOrder(),
        lastUpdatedAt: 1,
        deletedAt: 2,
      });

      expect(stripped).not.toHaveProperty('lastUpdatedAt');
      expect(stripped).not.toHaveProperty('deletedAt');
      expect(stripped.providerOrderId).toBe('abc-123');
    });
  });

  describe('stripDeletedAt', () => {
    it('removes deletedAt while preserving lastUpdatedAt', () => {
      const stripped = stripDeletedAt({
        ...createMockOrder(),
        lastUpdatedAt: 1,
        deletedAt: 2,
      });

      expect(stripped.lastUpdatedAt).toBe(1);
      expect(stripped).not.toHaveProperty('deletedAt');
      expect(stripped.providerOrderId).toBe('abc-123');
    });
  });

  describe('areOrdersEqual', () => {
    it('returns true for identical order bodies ignoring sync metadata', () => {
      const a = { ...createMockOrder(), lastUpdatedAt: 1 };
      const b = { ...createMockOrder(), lastUpdatedAt: 999 };
      expect(areOrdersEqual(a, b)).toBe(true);
    });

    it('returns false when order content differs', () => {
      const a = createMockOrder({ fiatAmount: 100 });
      const b = createMockOrder({ fiatAmount: 200 });
      expect(areOrdersEqual(a, b)).toBe(false);
    });
  });
});
