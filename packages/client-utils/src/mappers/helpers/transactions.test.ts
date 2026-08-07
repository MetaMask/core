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
      ).toMatchObject({
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
        assetType: 'erc20',
      });
    });

    it('marks native transfers with type native and assetId', () => {
      expect(
        getTokenAmountFromTransfer(
          {
            from: '0x1',
            to: '0x2',
            transferType: 'normal',
            symbol: 'POL',
            amount: '1000000000000000000',
            decimal: 18,
          },
          'out',
          'eip155:137',
        ),
      ).toStrictEqual({
        direction: 'out',
        amount: '1000000000000000000',
        symbol: 'POL',
        decimals: 18,
        assetType: 'native',
        assetId: 'eip155:137/slip44:966',
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
      ).toMatchObject({
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
        assetType: 'erc20',
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
      ).toMatchObject({
        direction: 'out',
        symbol: 'TKN',
      });
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

  describe('getLocalTransactionFees', () => {
    it('resolves fee assetId via ETH symbol when chainlist only has testnet slip44:1', () => {
      // 0x539 = Geth Testnet (1337); chainlist slip44 is 1, which we skip.
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
          assetType: 'native',
          symbol: 'ETH',
          assetId: 'eip155:1337/slip44:60',
        },
      ]);
    });

    it('returns native fee assetId when nativeAssetSymbol is on the group', () => {
      expect(
        getLocalTransactionFees({
          nativeAssetSymbol: 'ETH',
          primaryTransaction: {
            chainId: '0x1',
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
          assetType: 'native',
          symbol: 'ETH',
          assetId: 'eip155:1/slip44:60',
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

    it('returns undefined when the chain id cannot be normalized', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0xzzzz',
            txParams: {},
            txReceipt: {
              gasUsed: '0x1',
              effectiveGasPrice: '0x2',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0]),
      ).toBeUndefined();
    });

    it('resolves fee assetId from nativeAssetSymbol when the chain is unknown', () => {
      expect(
        getLocalTransactionFees({
          nativeAssetSymbol: 'ETH',
          primaryTransaction: {
            chainId: '0x3b9ac9f7',
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
          assetType: 'native',
          symbol: 'ETH',
          assetId: 'eip155:999999991/slip44:60',
        },
      ]);
    });

    it('keeps the nativeAssetSymbol on fees when it cannot be mapped to an assetId', () => {
      expect(
        getLocalTransactionFees({
          nativeAssetSymbol: 'NOTACOIN',
          primaryTransaction: {
            chainId: '0x3b9ac9f7',
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
          assetType: 'native',
          symbol: 'NOTACOIN',
        },
      ]);
    });

    it('adds layer1GasFee (L1 + operator) onto the L2 network fee', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0x1388',
            layer1GasFee: '0x5f5e100', // 100_000_000
            txParams: {},
            txReceipt: {
              gasUsed: '0x5208',
              effectiveGasPrice: '0x3b9aca00',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          // 21_000_000_000_000 + 100_000_000
          amount: '21000100000000',
          decimals: 18,
          assetType: 'native',
        },
      ]);
    });

    it('falls back to receipt L1 + operator fee when layer1GasFee is absent', () => {
      const gasUsed = BigInt('0xceaf');
      const operatorFee = gasUsed * BigInt('0x5f5e100') * 100n;
      const l1Fee = BigInt('0x9173c910a1ac');
      const l2Amount = BigInt('0xceaf') * BigInt('0xba43cfaa0');
      const expected = String(l2Amount + l1Fee + operatorFee);

      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0x1388',
            txParams: {},
            txReceipt: {
              gasUsed: '0xceaf',
              effectiveGasPrice: '0xba43cfaa0',
              l1Fee: '0x9173c910a1ac',
              operatorFeeConstant: '0x0',
              operatorFeeScalar: '0x5f5e100',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0])?.[0]?.amount,
      ).toBe(expected);
    });

    it('falls back to receipt l1Fee for Optimism-style receipts', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0xa',
            txParams: {},
            txReceipt: {
              gasUsed: '0x5208',
              effectiveGasPrice: '0x3b9aca00',
              l1Fee: '0x5f5e100',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '21000100000000',
          decimals: 18,
          assetType: 'native',
          symbol: 'ETH',
          assetId: 'eip155:10/slip44:60',
        },
      ]);
    });

    it('adds operator fee from receipt when l1Fee is absent', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0x1388',
            txParams: {},
            txReceipt: {
              gasUsed: '0x1',
              effectiveGasPrice: '0x2',
              operatorFeeScalar: '0x1',
              operatorFeeConstant: '0xa',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          // L2 (2) + operator (1 * 1 * 100 + 10 = 110)
          amount: '112',
          decimals: 18,
          assetType: 'native',
        },
      ]);
    });

    it('prefers layer1GasFee over receipt fees to avoid double-counting', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0x1388',
            layer1GasFee: '0x5f5e100',
            txParams: {},
            txReceipt: {
              gasUsed: '0x5208',
              effectiveGasPrice: '0x3b9aca00',
              l1Fee: '0xffffffff',
              operatorFeeScalar: '0x5f5e100',
              operatorFeeConstant: '0x0',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0])?.[0]?.amount,
      ).toBe('21000100000000');
    });

    it('ignores invalid receipt fee hex and keeps the L2 network fee', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0x1388',
            txParams: {},
            txReceipt: {
              gasUsed: '0x5208',
              effectiveGasPrice: '0x3b9aca00',
              l1Fee: 'not-a-hex',
              operatorFeeScalar: 'also-bad',
              operatorFeeConstant: '0x0',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '21000000000000',
          decimals: 18,
          assetType: 'native',
        },
      ]);
    });

    it('ignores invalid layer1GasFee and keeps the L2 network fee', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0x1388',
            layer1GasFee: 'not-a-hex',
            txParams: {},
            txReceipt: {
              gasUsed: '0x5208',
              effectiveGasPrice: '0x3b9aca00',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '21000000000000',
          decimals: 18,
          assetType: 'native',
        },
      ]);
    });

    it('ignores empty receipt fee hex values', () => {
      expect(
        getLocalTransactionFees({
          primaryTransaction: {
            chainId: '0x1388',
            txParams: {},
            txReceipt: {
              gasUsed: '0x5208',
              effectiveGasPrice: '0x3b9aca00',
              l1Fee: '0x',
              operatorFeeScalar: '',
              operatorFeeConstant: '0X',
            },
          },
        } as Parameters<typeof getLocalTransactionFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '21000000000000',
          decimals: 18,
          assetType: 'native',
        },
      ]);
    });
  });

  describe('getFees', () => {
    it('returns network fees with native symbol and assetId from the chain id', () => {
      expect(
        getFees({
          chainId: 1,
          gasUsed: '0x2',
          effectiveGasPrice: '0x3',
        } as Parameters<typeof getFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '6',
          decimals: 18,
          assetType: 'native',
          symbol: 'ETH',
          assetId: 'eip155:1/slip44:60',
        },
      ]);
    });

    it('returns native fee assetId from native value transfers', () => {
      expect(
        getFees({
          chainId: 59144,
          gasUsed: 341413,
          effectiveGasPrice: '34544851',
          valueTransfers: [
            {
              from: '0xa',
              to: '0xb',
              amount: '1',
              decimal: 18,
              contractAddress: '0x0',
              symbol: 'ETH',
              name: 'Ether',
              transferType: 'internal',
            },
          ],
        } as Parameters<typeof getFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: String(341413n * 34544851n),
          decimals: 18,
          assetType: 'native',
          symbol: 'ETH',
          assetId: 'eip155:59144/slip44:60',
        },
      ]);
    });

    it('returns undefined when the chain id cannot be normalized', () => {
      expect(
        getFees({
          chainId: '0xzzzz',
          gasUsed: '0x2',
          effectiveGasPrice: '0x3',
        } as Parameters<typeof getFees>[0]),
      ).toBeUndefined();
    });

    it('returns fee amount without symbol or assetId when the chain is unknown', () => {
      expect(
        getFees({
          chainId: 999999991,
          gasUsed: '0x2',
          effectiveGasPrice: '0x3',
        } as Parameters<typeof getFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '6',
          decimals: 18,
          assetType: 'native',
        },
      ]);
    });

    it('uses ETH slip44:60 for Sepolia fees instead of chainlist testnet coin type 1', () => {
      expect(
        getFees({
          chainId: 11155111,
          gasUsed: '0x2',
          effectiveGasPrice: '0x3',
        } as Parameters<typeof getFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '6',
          decimals: 18,
          assetType: 'native',
          symbol: 'ETH',
          assetId: 'eip155:11155111/slip44:60',
        },
      ]);
    });

    it('uses chainlist Avalanche slip44:9005 for fees instead of registry AVAX 9000', () => {
      expect(
        getFees({
          chainId: 43114,
          gasUsed: '0x2',
          effectiveGasPrice: '0x3',
        } as Parameters<typeof getFees>[0]),
      ).toStrictEqual([
        {
          type: 'base',
          amount: '6',
          decimals: 18,
          assetType: 'native',
          symbol: 'AVAX',
          assetId: 'eip155:43114/slip44:9005',
        },
      ]);
    });

    it('keeps wei decimals for fees when chainlist nativeCurrency.decimals is not 18', () => {
      expect(
        getFees({
          chainId: 4160,
          gasUsed: '21000',
          effectiveGasPrice: '1000000000',
        } as Parameters<typeof getFees>[0]),
      ).toMatchObject({
        0: {
          amount: '21000000000000',
          decimals: 18,
          symbol: 'ALGO',
        },
      });
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
