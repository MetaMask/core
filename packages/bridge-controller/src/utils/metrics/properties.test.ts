import { SolScope } from '@metamask/keyring-api';
import type { CaipChainId } from '@metamask/utils';

import { MetricsActionType, MetricsSwapType } from './constants';
import {
  quoteRequestToInputChangedProperties,
  quoteRequestToInputChangedPropertyValues,
  getActionType,
  getSwapType,
  formatProviderLabel,
  getRequestParams,
} from './properties';
import type { QuoteResponse } from '../../types';
import { getNativeAssetForChainId } from '../bridge';
import { formatChainIdToCaip } from '../caip-formatters';

describe('properties', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('quoteRequestToInputChangedProperties', () => {
    it('should map quote request properties to input keys', () => {
      expect(quoteRequestToInputChangedProperties.srcTokenAddress).toBe(
        'token_source',
      );
      expect(quoteRequestToInputChangedProperties.destTokenAddress).toBe(
        'token_destination',
      );
      expect(quoteRequestToInputChangedProperties.srcChainId).toBe(
        'chain_source',
      );
      expect(quoteRequestToInputChangedProperties.destChainId).toBe(
        'chain_destination',
      );
      expect(quoteRequestToInputChangedProperties.slippage).toBe('slippage');
    });
  });

  describe('quoteRequestToInputChangedPropertyValues', () => {
    it('should format srcTokenAddress correctly', () => {
      const srcTokenAddressFormatter =
        quoteRequestToInputChangedPropertyValues.srcTokenAddress;
      const result = srcTokenAddressFormatter?.({
        srcTokenAddress: '0x123',
        srcChainId: '1',
      });

      expect(result).toBe('eip155:1/erc20:0x123');
    });

    it('should format srcTokenAddress when srcAssetId is undefined', () => {
      const srcTokenAddressFormatter =
        quoteRequestToInputChangedPropertyValues.srcTokenAddress;
      const result = srcTokenAddressFormatter?.({
        srcTokenAddress: '123',
        srcChainId: '2',
      });

      expect(result).toBeUndefined();
    });

    it('should format srcTokenAddress when srcTokenAddress is undefined', () => {
      const srcTokenAddressFormatter =
        quoteRequestToInputChangedPropertyValues.srcTokenAddress;
      const result = srcTokenAddressFormatter?.({
        srcChainId: '1',
      });

      expect(result).toBe('eip155:1/slip44:60');
    });

    it('should return undefined for srcTokenAddress when srcChainId is missing', () => {
      const srcTokenAddressFormatter =
        quoteRequestToInputChangedPropertyValues.srcTokenAddress;
      const result = srcTokenAddressFormatter?.({
        srcTokenAddress: '0x123',
      });

      expect(result).toBeUndefined();
    });

    it('should format destTokenAddress correctly', () => {
      const destTokenAddressFormatter =
        quoteRequestToInputChangedPropertyValues.destTokenAddress;
      const result = destTokenAddressFormatter?.({
        destTokenAddress: '0x123',
        destChainId: '1',
      });

      expect(result).toBe('eip155:1/erc20:0x123');
    });

    it('should format destTokenAddress correctly when destTokenAddress is undefined', () => {
      const destTokenAddressFormatter =
        quoteRequestToInputChangedPropertyValues.destTokenAddress;
      const result = destTokenAddressFormatter?.({
        destChainId: '1',
      });

      expect(result).toBe('eip155:1/slip44:60');
    });

    it('should format srcChainId correctly', () => {
      const srcChainIdFormatter =
        quoteRequestToInputChangedPropertyValues.srcChainId;
      const result = srcChainIdFormatter?.({
        srcChainId: '1',
      });

      expect(result).toBe('eip155:1');
    });

    it('should format srcChainId correctly when srcChainId is undefined', () => {
      const srcChainIdFormatter =
        quoteRequestToInputChangedPropertyValues.srcChainId;
      const result = srcChainIdFormatter?.({});

      expect(result).toBeUndefined();
    });

    it('should format destChainId correctly', () => {
      const destChainIdFormatter =
        quoteRequestToInputChangedPropertyValues.destChainId;
      const result = destChainIdFormatter?.({
        destChainId: '1',
      });

      expect(result).toBe('eip155:1');
    });

    it('should format slippage correctly', () => {
      const slippageFormatter =
        quoteRequestToInputChangedPropertyValues.slippage;
      const result = slippageFormatter?.({
        slippage: 0.5,
      });

      expect(result).toBe(0.5);
    });

    it('should format slippage correctly when slippage is undefined', () => {
      const slippageFormatter =
        quoteRequestToInputChangedPropertyValues.slippage;
      const result = slippageFormatter?.({});

      expect(result).toBeUndefined();
    });
  });

  describe('getActionType', () => {
    it('should return SWAPBRIDGE_V1 when srcChainId equals destChainId', () => {
      const result = getActionType({
        srcChainId: '1',
        destChainId: '1',
      });

      expect(result).toBe(MetricsActionType.SWAPBRIDGE_V1);
    });

    it('should return CROSSCHAIN_V1 when srcChainId does not equal destChainId', () => {
      const result = getActionType({
        srcChainId: '1',
        destChainId: '2',
      });

      expect(result).toBe(MetricsActionType.CROSSCHAIN_V1);
    });
  });

  describe('getSwapType', () => {
    it('should return SINGLE when srcChainId equals destChainId', () => {
      const result = getSwapType({
        srcChainId: 1,
        destChainId: 1,
      });

      expect(result).toBe(MetricsSwapType.SINGLE);
    });

    it('should return SINGLE when destChainId is undefined', () => {
      const result = getSwapType({
        srcChainId: 1,
      });

      expect(result).toBe(MetricsSwapType.SINGLE);
    });

    it('should return CROSSCHAIN when srcChainId does not equal destChainId', () => {
      const result = getSwapType({
        srcChainId: 1,
        destChainId: 10,
      });

      expect(result).toBe(MetricsSwapType.CROSSCHAIN);
    });
  });

  describe('formatProviderLabel', () => {
    it('should format provider label correctly', () => {
      const mockQuoteResponse: QuoteResponse = {
        quote: {
          requestId: 'request1',
          srcChainId: 1,
          srcAsset: {
            chainId: 1,
            address: '0x123',
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
            assetId: 'eip155:1/slip44:60',
          },
          srcTokenAmount: '1000000000000000000',
          destChainId: 1,
          destAsset: {
            chainId: 1,
            address: '0x456',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            assetId: 'eip155:1/erc20:0x456',
          },
          destTokenAmount: '1000000',
          feeData: {
            metabridge: {
              amount: '10000000000000000',
              asset: {
                chainId: 1,
                address: '0x123',
                symbol: 'ETH',
                name: 'Ethereum',
                decimals: 18,
                assetId: 'eip155:1/slip44:60',
              },
            },
          },
          bridgeId: 'bridge1',
          bridges: ['bridge1'],
          steps: [],
        },
        trade: {
          chainId: 1,
          to: '0x789',
          from: '0xabc',
          value: '0',
          data: '0x',
          gasLimit: 100000,
        },
        estimatedProcessingTimeInSeconds: 60,
      };

      const result = formatProviderLabel(mockQuoteResponse);

      expect(result).toBe('bridge1_bridge1');
    });
  });

  describe('getRequestParams', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should format request params correctly with all values provided', () => {
      const result = getRequestParams(
        {
          destChainId: SolScope.Mainnet,
          srcTokenAddress: '0x123',
          destTokenAddress: 'ABD456',
        },
        'eip155:1' as CaipChainId,
      );

      expect(result).toStrictEqual({
        chain_id_destination: SolScope.Mainnet,
        chain_id_source: 'eip155:1',
        token_address_destination:
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:ABD456',
        token_address_source: 'eip155:1/erc20:0x123',
      });
    });

    it('should fallback to src chainId when destChainId is undefined', () => {
      const result = getRequestParams(
        {
          srcTokenAddress: getNativeAssetForChainId('0x1')?.address,
          destTokenAddress: getNativeAssetForChainId('0xa')?.address,
          srcChainId: 1,
        },
        formatChainIdToCaip(1),
      );

      expect(result).toStrictEqual({
        chain_id_source: 'eip155:1',
        chain_id_destination: undefined,
        token_address_source: 'eip155:1/slip44:60',
        token_address_destination: 'eip155:1/slip44:60',
      });
    });

    it('should use native asset when srcTokenAddress is not provided', () => {
      const result = getRequestParams(
        {
          destChainId: '2',
          srcTokenAddress: undefined,
          destTokenAddress: '0x456',
        },
        'eip155:1' as CaipChainId,
      );

      expect(result).toStrictEqual({
        chain_id_destination: 'eip155:2',
        chain_id_source: 'eip155:1',
        token_address_destination: 'eip155:2/erc20:0x456',
        token_address_source: 'eip155:1/slip44:60',
      });
    });

    it('should use native asset when formatAddressToAssetId returns null', () => {
      const result = getRequestParams(
        {
          destChainId: '2',
          srcTokenAddress: '123',
          destTokenAddress: '456',
        },
        'eip155:1' as CaipChainId,
      );

      expect(result).toStrictEqual({
        chain_id_source: 'eip155:1',
        chain_id_destination: 'eip155:2',
        token_address_destination: undefined,
        token_address_source: 'eip155:1/slip44:60',
      });
    });
  });
});
