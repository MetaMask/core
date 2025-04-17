import type { CaipAssetType } from '@metamask/utils';

import { getAssetIdsForToken, toExchangeRates } from './assets';
import { getNativeAssetForChainId } from './bridge';
import { formatAddressToAssetId } from './caip-formatters';

// Mock the imported functions
jest.mock('./bridge', () => ({
  getNativeAssetForChainId: jest.fn(),
}));

jest.mock('./caip-formatters', () => ({
  formatAddressToAssetId: jest.fn(),
}));

describe('assets utils', () => {
  describe('getAssetIdsForToken', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return empty array when formatAddressToAssetId returns null', () => {
      (formatAddressToAssetId as jest.Mock).mockReturnValue(null);

      const result = getAssetIdsForToken('0x123', '1');

      expect(result).toStrictEqual([]);
      expect(formatAddressToAssetId).toHaveBeenCalledWith('0x123', '1');
      expect(getNativeAssetForChainId).not.toHaveBeenCalled();
    });

    it('should return token asset ID when native asset has no assetId', () => {
      (formatAddressToAssetId as jest.Mock).mockReturnValue(
        'eip155:1/erc20:0x123',
      );
      (getNativeAssetForChainId as jest.Mock).mockReturnValue({
        address: '0x0',
        symbol: 'ETH',
        // no assetId
      });

      const result = getAssetIdsForToken('0x123', '1');

      expect(result).toStrictEqual(['eip155:1/erc20:0x123']);
      expect(formatAddressToAssetId).toHaveBeenCalledWith('0x123', '1');
      expect(getNativeAssetForChainId).toHaveBeenCalledWith('1');
    });

    it('should return both token and native asset IDs when both exist', () => {
      (formatAddressToAssetId as jest.Mock).mockReturnValue(
        'eip155:1/erc20:0x123',
      );
      (getNativeAssetForChainId as jest.Mock).mockReturnValue({
        address: '0x0',
        symbol: 'ETH',
        assetId: 'eip155:1/slip44:60',
      });

      const result = getAssetIdsForToken('0x123', '1');

      expect(result).toStrictEqual([
        'eip155:1/erc20:0x123',
        'eip155:1/slip44:60',
      ]);
      expect(formatAddressToAssetId).toHaveBeenCalledWith('0x123', '1');
      expect(getNativeAssetForChainId).toHaveBeenCalledWith('1');
    });
  });

  describe('toExchangeRates', () => {
    it('should convert price data to exchange rates format', () => {
      const pricesByAssetId = {
        'eip155:1/erc20:0x123': {
          usd: '1.5',
          eur: '1.3',
          gbp: '1.2',
        },
        'eip155:1/slip44:60': {
          usd: '1800',
          eur: '1650',
          gbp: '1500',
        },
      } as Record<CaipAssetType, { [currency: string]: string }>;

      const result = toExchangeRates('eur', pricesByAssetId);

      expect(result).toStrictEqual({
        'eip155:1/erc20:0x123': {
          exchangeRate: '1.3',
          usdExchangeRate: '1.5',
        },
        'eip155:1/slip44:60': {
          exchangeRate: '1650',
          usdExchangeRate: '1800',
        },
      });
    });

    it('should handle missing USD prices', () => {
      const pricesByAssetId = {
        'eip155:1/erc20:0x123': {
          eur: '1.3',
          gbp: '1.2',
        },
      } as Record<CaipAssetType, { [currency: string]: string }>;

      const result = toExchangeRates('eur', pricesByAssetId);

      expect(result).toStrictEqual({
        'eip155:1/erc20:0x123': {
          exchangeRate: '1.3',
          usdExchangeRate: undefined,
        },
      });
    });

    it('should handle missing requested currency prices', () => {
      const pricesByAssetId = {
        'eip155:1/erc20:0x123': {
          usd: '1.5',
          gbp: '1.2',
        },
      } as Record<CaipAssetType, { [currency: string]: string }>;

      const result = toExchangeRates('eur', pricesByAssetId);

      expect(result).toStrictEqual({
        'eip155:1/erc20:0x123': {
          exchangeRate: undefined,
          usdExchangeRate: '1.5',
        },
      });
    });

    it('should handle empty price data', () => {
      const result = toExchangeRates('eur', {});

      expect(result).toStrictEqual({});
    });

    it('should handle asset with no prices', () => {
      const pricesByAssetId = {
        'eip155:1/erc20:0x123': {},
      } as Record<CaipAssetType, { [currency: string]: string }>;

      const result = toExchangeRates('eur', pricesByAssetId);

      expect(result).toStrictEqual({
        'eip155:1/erc20:0x123': {
          exchangeRate: undefined,
          usdExchangeRate: undefined,
        },
      });
    });

    it('should handle multiple assets with mixed price availability', () => {
      const pricesByAssetId = {
        'eip155:1/erc20:0x123': {
          usd: '1.5',
          eur: '1.3',
        },
        'eip155:1/erc20:0x456': {
          eur: '2.3',
        },
        'eip155:1/erc20:0x789': {
          usd: '3.5',
        },
        'eip155:1/erc20:0xabc': {},
      } as Record<CaipAssetType, { [currency: string]: string }>;

      const result = toExchangeRates('eur', pricesByAssetId);

      expect(result).toStrictEqual({
        'eip155:1/erc20:0x123': {
          exchangeRate: '1.3',
          usdExchangeRate: '1.5',
        },
        'eip155:1/erc20:0x456': {
          exchangeRate: '2.3',
          usdExchangeRate: undefined,
        },
        'eip155:1/erc20:0x789': {
          exchangeRate: undefined,
          usdExchangeRate: '3.5',
        },
        'eip155:1/erc20:0xabc': {
          exchangeRate: undefined,
          usdExchangeRate: undefined,
        },
      });
    });
  });
});
