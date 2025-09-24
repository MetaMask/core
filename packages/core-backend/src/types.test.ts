import type {
  Transaction,
  Asset,
  Balance,
  Transfer,
  BalanceUpdate,
  AccountActivityMessage,
} from './types';

describe('Types', () => {
  describe('Transaction type', () => {
    it('should have correct shape', () => {
      const transaction: Transaction = {
        hash: '0x123abc',
        chain: 'eip155:1',
        status: 'confirmed',
        timestamp: 1609459200000,
        from: '0x1234567890123456789012345678901234567890',
        to: '0x9876543210987654321098765432109876543210',
      };

      expect(transaction).toMatchObject({
        hash: expect.any(String),
        chain: expect.any(String),
        status: expect.any(String),
        timestamp: expect.any(Number),
        from: expect.any(String),
        to: expect.any(String),
      });
    });
  });

  describe('Asset type', () => {
    it('should have correct shape for fungible asset', () => {
      const asset: Asset = {
        fungible: true,
        type: 'eip155:1/erc20:0xa0b86a33e6776689e1f3b45ce05aadc5d8cda88e',
        unit: 'USDT',
      };

      expect(asset).toMatchObject({
        fungible: expect.any(Boolean),
        type: expect.any(String),
        unit: expect.any(String),
      });
      expect(asset.fungible).toBe(true);
    });

    it('should have correct shape for non-fungible asset', () => {
      const asset: Asset = {
        fungible: false,
        type: 'eip155:1/erc721:0x123',
        unit: 'NFT',
      };

      expect(asset.fungible).toBe(false);
    });
  });

  describe('Balance type', () => {
    it('should have correct shape with amount', () => {
      const balance: Balance = {
        amount: '1000000000000000000', // 1 ETH in wei
      };

      expect(balance).toMatchObject({
        amount: expect.any(String),
      });
    });

    it('should have correct shape with error', () => {
      const balance: Balance = {
        amount: '0',
        error: 'Network error',
      };

      expect(balance).toMatchObject({
        amount: expect.any(String),
        error: expect.any(String),
      });
    });
  });

  describe('Transfer type', () => {
    it('should have correct shape', () => {
      const transfer: Transfer = {
        from: '0x1234567890123456789012345678901234567890',
        to: '0x9876543210987654321098765432109876543210',
        amount: '500000000000000000', // 0.5 ETH in wei
      };

      expect(transfer).toMatchObject({
        from: expect.any(String),
        to: expect.any(String),
        amount: expect.any(String),
      });
    });
  });

  describe('BalanceUpdate type', () => {
    it('should have correct shape', () => {
      const balanceUpdate: BalanceUpdate = {
        asset: {
          fungible: true,
          type: 'eip155:1/slip44:60',
          unit: 'ETH',
        },
        postBalance: {
          amount: '1500000000000000000',
        },
        transfers: [
          {
            from: '0x1234567890123456789012345678901234567890',
            to: '0x9876543210987654321098765432109876543210',
            amount: '500000000000000000',
          },
        ],
      };

      expect(balanceUpdate).toMatchObject({
        asset: expect.any(Object),
        postBalance: expect.any(Object),
        transfers: expect.any(Array),
      });
    });

    it('should handle empty transfers array', () => {
      const balanceUpdate: BalanceUpdate = {
        asset: {
          fungible: true,
          type: 'eip155:1/slip44:60',
          unit: 'ETH',
        },
        postBalance: {
          amount: '1000000000000000000',
        },
        transfers: [],
      };

      expect(balanceUpdate.transfers).toHaveLength(0);
    });
  });

  describe('AccountActivityMessage type', () => {
    it('should have correct complete shape', () => {
      const activityMessage: AccountActivityMessage = {
        address: '0x1234567890123456789012345678901234567890',
        tx: {
          hash: '0x123abc',
          chain: 'eip155:1',
          status: 'confirmed',
          timestamp: 1609459200000,
          from: '0x1234567890123456789012345678901234567890',
          to: '0x9876543210987654321098765432109876543210',
        },
        updates: [
          {
            asset: {
              fungible: true,
              type: 'eip155:1/slip44:60',
              unit: 'ETH',
            },
            postBalance: {
              amount: '1500000000000000000',
            },
            transfers: [
              {
                from: '0x1234567890123456789012345678901234567890',
                to: '0x9876543210987654321098765432109876543210',
                amount: '500000000000000000',
              },
            ],
          },
        ],
      };

      expect(activityMessage).toMatchObject({
        address: expect.any(String),
        tx: expect.any(Object),
        updates: expect.any(Array),
      });

      expect(activityMessage.updates).toHaveLength(1);
      expect(activityMessage.updates[0].transfers).toHaveLength(1);
    });

    it('should handle multiple balance updates', () => {
      const activityMessage: AccountActivityMessage = {
        address: '0x1234567890123456789012345678901234567890',
        tx: {
          hash: '0x123abc',
          chain: 'eip155:1',
          status: 'confirmed',
          timestamp: 1609459200000,
          from: '0x1234567890123456789012345678901234567890',
          to: '0x9876543210987654321098765432109876543210',
        },
        updates: [
          {
            asset: {
              fungible: true,
              type: 'eip155:1/slip44:60',
              unit: 'ETH',
            },
            postBalance: { amount: '1500000000000000000' },
            transfers: [],
          },
          {
            asset: {
              fungible: true,
              type: 'eip155:1/erc20:0xa0b86a33e6776689e1f3b45ce05aadc5d8cda88e',
              unit: 'USDT',
            },
            postBalance: { amount: '1000000' }, // 1 USDT (6 decimals)
            transfers: [
              {
                from: '0x1234567890123456789012345678901234567890',
                to: '0x9876543210987654321098765432109876543210',
                amount: '500000', // 0.5 USDT
              },
            ],
          },
        ],
      };

      expect(activityMessage.updates).toHaveLength(2);
      expect(activityMessage.updates[0].transfers).toHaveLength(0);
      expect(activityMessage.updates[1].transfers).toHaveLength(1);
    });

    it('should handle empty updates array', () => {
      const activityMessage: AccountActivityMessage = {
        address: '0x1234567890123456789012345678901234567890',
        tx: {
          hash: '0x123abc',
          chain: 'eip155:1',
          status: 'pending',
          timestamp: Date.now(),
          from: '0x1234567890123456789012345678901234567890',
          to: '0x9876543210987654321098765432109876543210',
        },
        updates: [],
      };

      expect(activityMessage.updates).toHaveLength(0);
    });
  });

  describe('Transaction status variations', () => {
    const baseTransaction = {
      hash: '0x123abc',
      chain: 'eip155:1',
      timestamp: Date.now(),
      from: '0x1234567890123456789012345678901234567890',
      to: '0x9876543210987654321098765432109876543210',
    };

    it('should handle pending status', () => {
      const transaction: Transaction = {
        ...baseTransaction,
        status: 'pending',
      };

      expect(transaction.status).toBe('pending');
    });

    it('should handle confirmed status', () => {
      const transaction: Transaction = {
        ...baseTransaction,
        status: 'confirmed',
      };

      expect(transaction.status).toBe('confirmed');
    });

    it('should handle failed status', () => {
      const transaction: Transaction = {
        ...baseTransaction,
        status: 'failed',
      };

      expect(transaction.status).toBe('failed');
    });
  });

  describe('Multi-chain support', () => {
    it('should handle different chain formats', () => {
      const ethereumTx: Transaction = {
        hash: '0x123',
        chain: 'eip155:1',
        status: 'confirmed',
        timestamp: Date.now(),
        from: '0x123',
        to: '0x456',
      };

      const polygonTx: Transaction = {
        hash: '0x456',
        chain: 'eip155:137',
        status: 'confirmed',
        timestamp: Date.now(),
        from: '0x789',
        to: '0xabc',
      };

      const bscTx: Transaction = {
        hash: '0x789',
        chain: 'eip155:56',
        status: 'confirmed',
        timestamp: Date.now(),
        from: '0xdef',
        to: '0x012',
      };

      expect(ethereumTx.chain).toBe('eip155:1');
      expect(polygonTx.chain).toBe('eip155:137');
      expect(bscTx.chain).toBe('eip155:56');
    });
  });

  describe('Asset type variations', () => {
    it('should handle native asset', () => {
      const nativeAsset: Asset = {
        fungible: true,
        type: 'eip155:1/slip44:60',
        unit: 'ETH',
      };

      expect(nativeAsset.type).toContain('slip44');
    });

    it('should handle ERC20 token', () => {
      const erc20Asset: Asset = {
        fungible: true,
        type: 'eip155:1/erc20:0xa0b86a33e6776689e1f3b45ce05aadc5d8cda88e',
        unit: 'USDT',
      };

      expect(erc20Asset.type).toContain('erc20');
    });

    it('should handle ERC721 NFT', () => {
      const nftAsset: Asset = {
        fungible: false,
        type: 'eip155:1/erc721:0x123',
        unit: 'BAYC',
      };

      expect(nftAsset.fungible).toBe(false);
      expect(nftAsset.type).toContain('erc721');
    });
  });
});
