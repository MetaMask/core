import { jest } from '@jest/globals';

import * as tokenMetadata from './token-metadata.js';
import {
  getFees,
  getLocalTransactionFees,
  getLocalTransactionStatus,
  getNftPaymentTransfer,
  getTokenAmountFromTransfer,
  getTokenMetadataFromKnownToken,
  isNftStandard,
  parseValueTransfers,
  withFallbackTokenAssetId,
} from './transactions.js';

describe('transaction helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isNftStandard', () => {
    it('detects nft transfer types', () => {
      expect(isNftStandard('erc721')).toBe(true);
      expect(isNftStandard('erc1155')).toBe(true);
      expect(isNftStandard('erc20')).toBe(false);
    });
  });

  describe('getNftPaymentTransfer', () => {
    it('returns a buy-side native payment transfer', () => {
      expect(
        getNftPaymentTransfer({
          side: 'buy',
          sentNativeTransfer: {
            from: '0x0000000000000000000000000000000000000001',
            to: '0x0000000000000000000000000000000000000002',
            transferType: 'normal',
            symbol: 'ETH',
            amount: 1,
          },
          nftCounterparty: '0x0000000000000000000000000000000000000002',
          subjectAddress: '0x0000000000000000000000000000000000000001',
        }),
      ).toMatchObject({ symbol: 'ETH' });
    });

    it('returns undefined for sell-side transfers that do not match the counterparty', () => {
      expect(
        getNftPaymentTransfer({
          side: 'sell',
          receivedTransfer: {
            from: '0x0000000000000000000000000000000000000001',
            to: '0x0000000000000000000000000000000000000002',
            transferType: 'erc20',
            symbol: 'USDC',
            amount: 1,
          },
          nftCounterparty: '0x0000000000000000000000000000000000000003',
          subjectAddress: '0x0000000000000000000000000000000000000004',
        }),
      ).toBeUndefined();
    });

    it('returns sell-side payment when the sender matches the transaction from address', () => {
      expect(
        getNftPaymentTransfer({
          side: 'sell',
          receivedTransfer: {
            from: '0x0000000000000000000000000000000000000003',
            to: '0x0000000000000000000000000000000000000004',
            transferType: 'erc20',
            symbol: 'USDC',
            amount: 1,
          },
          nftCounterparty: '0x0000000000000000000000000000000000000005',
          transactionFrom: '0x0000000000000000000000000000000000000003',
          subjectAddress: '0x0000000000000000000000000000000000000004',
        }),
      ).toMatchObject({ symbol: 'USDC' });
    });
  });

  describe('parseValueTransfers', () => {
    it('prefers a received transfer with a different symbol', () => {
      const result = parseValueTransfers(
        [
          {
            from: '0x0000000000000000000000000000000000000001',
            to: '0x0000000000000000000000000000000000000002',
            symbol: 'ETH',
            transferType: 'normal',
          },
          {
            from: '0x0000000000000000000000000000000000000002',
            to: '0x0000000000000000000000000000000000000001',
            symbol: 'USDC',
            transferType: 'erc20',
          },
        ],
        '0x0000000000000000000000000000000000000001',
      );

      expect(result.receivedTransfer?.symbol).toBe('USDC');
    });
  });

  describe('getTokenAmountFromTransfer', () => {
    it('returns token metadata without a symbol when only the amount is present', () => {
      expect(
        getTokenAmountFromTransfer(
          {
            from: '0x1',
            to: '0x2',
            transferType: 'erc20',
            amount: 1,
          },
          'out',
          'eip155:1',
        ),
      ).toStrictEqual({
        direction: 'out',
        amount: '1',
      });
    });

    it('returns token metadata with decimals when they are present', () => {
      expect(
        getTokenAmountFromTransfer(
          {
            from: '0x1',
            to: '0x2',
            transferType: 'erc20',
            symbol: 'USDC',
            amount: 1,
            decimal: 6,
          },
          'out',
          'eip155:1',
        ),
      ).toStrictEqual({
        direction: 'out',
        amount: '1',
        symbol: 'USDC',
        decimals: 6,
      });
    });

    it('returns token metadata without decimals when they are omitted', () => {
      expect(
        getTokenAmountFromTransfer(
          {
            from: '0x1',
            to: '0x2',
            transferType: 'erc20',
            symbol: 'USDC',
            amount: 1,
          },
          'out',
          'eip155:1',
        ),
      ).toStrictEqual({
        direction: 'out',
        amount: '1',
        symbol: 'USDC',
      });
    });

    it('returns undefined when the transfer has no symbol or amount', () => {
      expect(
        getTokenAmountFromTransfer(
          {
            from: '0x1',
            to: '0x2',
            transferType: 'erc20',
          },
          'out',
          'eip155:1',
        ),
      ).toBeUndefined();
    });
  });

  describe('getTokenMetadataFromKnownToken', () => {
    it('returns metadata without a symbol when it is missing', () => {
      jest.spyOn(tokenMetadata, 'getKnownTokenMetadata').mockReturnValue({
        decimals: 18,
        assetId: 'eip155:1/erc20:0x1111111111111111111111111111111111111111',
      });

      expect(
        getTokenMetadataFromKnownToken(
          '0x1111111111111111111111111111111111111111',
          'out',
          'eip155:1',
        ),
      ).toStrictEqual({
        direction: 'out',
        decimals: 18,
        assetId: 'eip155:1/erc20:0x1111111111111111111111111111111111111111',
      });
    });

    it('returns partial metadata when some fields are missing', () => {
      jest.spyOn(tokenMetadata, 'getKnownTokenMetadata').mockReturnValue({
        symbol: 'TKN',
      });

      expect(
        getTokenMetadataFromKnownToken(
          '0x1111111111111111111111111111111111111111',
          'out',
          'eip155:1',
        ),
      ).toStrictEqual({ direction: 'out', symbol: 'TKN' });
    });

    it('returns undefined for unknown tokens', () => {
      expect(
        getTokenMetadataFromKnownToken(
          '0x1111111111111111111111111111111111111111',
          'out',
          'eip155:1',
        ),
      ).toBeUndefined();
    });
  });

  describe('withFallbackTokenAssetId', () => {
    it('returns the token unchanged when the fallback address cannot be encoded', () => {
      const token = { direction: 'out' as const, symbol: 'USDC' };

      expect(
        withFallbackTokenAssetId(token, 'not-an-address', 'erc20', 'eip155:1'),
      ).toBe(token);
    });
  });

  describe('getLocalTransactionFees', () => {
    it('returns fallback native fee metadata for unsupported chains', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0x539',
            txParams: {},
            txReceipt: {
              gasUsed: '0x1',
              effectiveGasPrice: '0x2',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '2',
          decimals: 18,
        },
      ]);
    });

    it('returns undefined when gas fields are missing', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0x1',
            txParams: {},
          },
        } as Parameters<typeof getLocalTransactionFees>[0]),
      ).toBeUndefined();
    });
  });

  describe('getFees', () => {
    it('returns network fees for supported chains', () => {
      expect(
        getFees(
          {
            gasUsed: '0x2',
            effectiveGasPrice: '0x3',
          } as Parameters<typeof getFees>[0],
          'eip155:1',
        ),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '6',
          decimals: 18,
          symbol: 'ETH',
          assetId: 'eip155:1/slip44:60',
        },
      ]);
    });
  });

  describe('getLocalTransactionStatus', () => {
    it('maps cancelled transaction groups to failed', () => {
      expect(
        getLocalTransactionStatus({
          primaryTransaction: {
            status: 'cancelled',
          },
          initialTransaction: {
            status: 'cancelled',
          },
        } as Parameters<typeof getLocalTransactionStatus>[0]),
      ).toBe('failed');
    });
  });
});
