import type { TransactionMeta } from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import type { BridgeHistoryItem } from '../types.js';
import {
  getActualSwapReceivedAmount,
  getReceivedERC20Amount,
} from './swap-received-amount.js';

const WALLET = '0x30e8ccad5a980bdf30447f8c2c48e70989d9d294';
const OTHER_WALLET = '0x0a2854fbbd9b3ef66f17d47284e7f899b9509330';
const TOKEN = '0x0b2c639c533813f4aa9d7837caf62653d097ff85';
const OTHER_TOKEN = '0x0000000000000000000000000000000000000001';
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const toTopic = (address: string): `0x${string}` =>
  `0x${address.slice(2).padStart(64, '0')}`;
const toData = (amount: number): `0x${string}` =>
  `0x${amount.toString(16).padStart(64, '0')}`;

const transferLog = ({
  token = TOKEN,
  to = WALLET,
  amount,
}: {
  token?: string;
  to?: string;
  amount: number;
}) => ({
  address: token,
  data: toData(amount),
  topics: [TRANSFER_TOPIC, toTopic(OTHER_WALLET), toTopic(to)],
});

describe('getReceivedERC20Amount', () => {
  it('returns null when logs are missing', () => {
    expect(getReceivedERC20Amount(WALLET, TOKEN)).toBeNull();
  });

  it('adds up matching transfer amounts in a receipt', () => {
    expect(
      getReceivedERC20Amount(WALLET, TOKEN, [
        transferLog({ amount: 100 }),
        transferLog({ to: OTHER_WALLET, amount: 999 }),
        transferLog({ token: OTHER_TOKEN, amount: 50 }),
        transferLog({ amount: 50 }),
      ])?.toString(10),
    ).toBe('150');
  });

  it('skips matching transfer logs that have no data', () => {
    expect(
      getReceivedERC20Amount(WALLET, TOKEN, [
        { ...transferLog({ amount: 100 }), data: undefined },
        transferLog({ amount: 40 }),
      ])?.toString(10),
    ).toBe('40');
  });
});

describe('getActualSwapReceivedAmount', () => {
  it('returns a null native amount when gas is missing', () => {
    const historyItem = {
      account: WALLET,
      quote: {
        destTokenAmount: '1000000000000000000',
        destAsset: {
          address: '0x0000000000000000000000000000000000000000',
          decimals: 18,
        },
      },
      pricingData: { quotedReturnInUsd: '1' },
    } as BridgeHistoryItem;

    expect(
      getActualSwapReceivedAmount(historyItem, null, {
        preTxBalance: '0x1',
        postTxBalance: '0x2',
        txReceipt: { status: '0x1' },
      } as TransactionMeta),
    ).toStrictEqual({ amount: null, usd: null });
  });
});
