import { describe, expect, it } from 'vitest';

import { v5ApiTransactionFixtures } from '../../../test/fixtures/v5-api-transactions.js';
import {
  fromV5TransactionRecord,
  toHexChainId,
} from './indexed-transaction.js';

const { records } = v5ApiTransactionFixtures;

describe('fromV5TransactionRecord', () => {
  it('maps EVM token transfers to contract addresses instead of asset IDs', () => {
    const { transaction, subjectAddress } = fromV5TransactionRecord(
      records.nftExchangeWethProceeds,
    );

    expect(subjectAddress).toBe('0x020ca66c30bec2c4fe3861a94e4db4a498a35872');
    expect(transaction.valueTransfers).toStrictEqual([
      {
        from: '0x6647e27bb65ee8fd21ce0d6876c3139edf0b70bc',
        to: '0x020ca66c30bec2c4fe3861a94e4db4a498a35872',
        transferType: 'erc20',
        amount: '5395500000000000000',
        decimal: 18,
        symbol: 'WETH',
        name: 'Wrapped Ether',
        contractAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      },
    ]);
  });

  it('keeps the API asset ID for non-EVM transfers', () => {
    const { transaction } = fromV5TransactionRecord(
      records.stellarTokenReceive,
    );

    expect(transaction.valueTransfers?.[0]).toMatchObject({
      transferType: 'asset',
      assetId:
        'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    });
    expect(transaction.valueTransfers?.[0]).not.toHaveProperty(
      'contractAddress',
    );
  });
});

describe('toHexChainId', () => {
  it('returns the hex chain ID for EVM chains', () => {
    expect(toHexChainId('eip155:8453')).toBe('0x2105');
  });

  it('returns undefined for non-EVM chains', () => {
    expect(toHexChainId('stellar:pubnet')).toBeUndefined();
  });
});
