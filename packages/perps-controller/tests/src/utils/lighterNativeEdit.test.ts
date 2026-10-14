import type { OrderParams } from '../../../src/types/index.js';
import type {
  LighterEditableOrder,
  LighterSignModifyOrderWireParams,
} from '../../../src/types/lighter-types.js';
import {
  decodeLighterModifyOrder,
  lighterEditOrderId,
  lighterNativeEditTarget,
  parseLighterNativeEditJournal,
  prepareLighterNativeEdit,
  observeLighterNativeEdit,
  lighterNativeEditResult,
} from '../../../src/utils/lighterNativeEdit.js';
import type { LighterNativeEditJournal } from '../../../src/utils/lighterNativeEdit.js';

const orderId = '288230376151711745';
const tuple: LighterSignModifyOrderWireParams = [
  28,
  1,
  orderId,
  100,
  910000,
  0,
  42,
];
const now = 1_700_000_000_000;
const row: LighterEditableOrder = {
  orderIndex: orderId,
  clientOrderIndex: 1,
  marketIndex: 1,
  ownerAccountIndex: 28,
  initialBaseAmount: '0.001',
  remainingBaseAmount: '0.001',
  filledBaseAmount: '0',
  price: '90000',
  isAsk: false,
  type: 'limit',
  timeInForce: 'good-till-time',
  reduceOnly: 0,
  status: 'open',
  orderExpiry: 0,
  timestamp: now,
};
const market = {
  symbol: 'BTC',
  marketId: 1,
  marketType: 'perp',
  status: 'active',
  takerFee: '0',
  makerFee: '0',
  minBaseAmount: '0.0002',
  minQuoteAmount: '10',
  supportedSizeDecimals: 5,
  supportedPriceDecimals: 1,
  supportedQuoteDecimals: 6,
};
const params: OrderParams = {
  symbol: 'BTC',
  isBuy: true,
  orderType: 'limit',
  price: '91000',
  size: '0.001',
};

const signed = (
  changes: Record<string, unknown> = {},
): { txInfo: string; txHash: string } => ({
  txInfo: JSON.stringify({
    AccountIndex: 28,
    ApiKeyIndex: 7,
    MarketIndex: 1,
    Index: orderId,
    BaseAmount: 100,
    Price: 910000,
    TriggerPrice: 0,
    Nonce: 42,
    ExpiredAt: now + 599_000,
    Sig: `${'A'.repeat(107)}=`,
    L2TxAttributes: null,
    ...changes,
  }).replace(/"Index":"(\d+)"/u, '"Index":$1'),
  txHash: 'dddd000000000001',
});
const journal = (): LighterNativeEditJournal => ({
  version: 1,
  wallet: '0x123',
  network: 'testnet',
  accountIndex: 28,
  apiKeyIndex: 7,
  startedAt: now,
  original: lighterNativeEditTarget(row),
  intent: prepareLighterNativeEdit(params, row, market, 28),
  phase: 'attempted',
  status: 'pending',
  nonce: 42,
  txHash: 'dddd000000000001',
  expiresAt: now + 599_000,
});
const scope = {
  wallet: '0x123',
  network: 'testnet' as const,
  accountIndex: 28,
  orderId,
};

describe('native Lighter edit identity and journal', () => {
  it('validates the pinned ABI and returns original signed bytes unchanged', () => {
    const payload = signed();
    expect(decodeLighterModifyOrder(payload, tuple, 7, now, now)).toStrictEqual(
      { ...payload, expiresAt: now + 599_000 },
    );
    expect(lighterEditOrderId('1152921504606846975')).toBe(
      '1152921504606846975',
    );
  });

  it.each([
    0,
    -1,
    Number(orderId),
    '01',
    '+1',
    '1.0',
    '1e1',
    '1152921504606846976',
    '9'.repeat(100),
  ])('refuses invalid native identity %s', (id) => {
    expect(() => lighterEditOrderId(id)).toThrow(Error);
  });

  it.each([
    { AccountIndex: 99 },
    { ApiKeyIndex: 8 },
    { MarketIndex: 2 },
    { Index: '288230376151711746' },
    { BaseAmount: 100.5 },
    { Price: 4294967296 },
    { TriggerPrice: 1 },
    { Nonce: 43 },
    { ExpiredAt: now + 599_001 },
    { Sig: 'bad' },
    { L2TxAttributes: {} },
    { privateExtension: 'secret' },
  ])('refuses signer identity or shape mutation %j', (changes) => {
    expect(() =>
      decodeLighterModifyOrder(signed(changes), tuple, 7, now, now),
    ).toThrow(Error);
  });

  it('rejects duplicate and rounded fractional identities and extra ABI arguments', () => {
    expect(() =>
      decodeLighterModifyOrder(
        {
          ...signed(),
          txInfo: signed().txInfo.replace(
            '"Nonce":42',
            '"Nonce":42,"Nonce":42',
          ),
        },
        tuple,
        7,
        now,
        now,
      ),
    ).toThrow(Error);
    expect(() =>
      decodeLighterModifyOrder(
        {
          ...signed(),
          txInfo: signed().txInfo.replace(
            '"Nonce":42',
            '"Nonce":42.00000000000000001',
          ),
        },
        tuple,
        7,
        now,
        now,
      ),
    ).toThrow(Error);
    expect(() =>
      decodeLighterModifyOrder(
        signed(),
        [...tuple, 1] as unknown as LighterSignModifyOrderWireParams,
        7,
        now,
        now,
      ),
    ).toThrow(Error);
  });

  it('decodes absent and pending storage without discarding original ownership', () => {
    expect(parseLighterNativeEditJournal(null, scope)).toBeNull();
    expect(
      parseLighterNativeEditJournal(JSON.stringify(journal()), scope),
    ).toMatchObject(journal());
  });

  it.each([
    { wallet: 'foreign' },
    { network: 'mainnet' },
    { accountIndex: 99 },
    { apiKeyIndex: 256 },
    { phase: 'prepared' },
    { nonce: 1.5 },
    { txHash: 'private-error' },
    { expiresAt: 0 },
    { status: 'settled' },
    { status: 'terminal' },
    { status: 'failed' },
    { rawSecret: 'must not persist' },
  ])('refuses corrupt or falsely settled durable storage %j', (changes) => {
    expect(() =>
      parseLighterNativeEditJournal(
        JSON.stringify({ ...journal(), ...changes }),
        scope,
      ),
    ).toThrow(Error);
  });

  it('refuses foreign exact client lookup and missing fill observation', () => {
    expect(() =>
      observeLighterNativeEdit({ ...row, ownerAccountIndex: 99 }, journal()),
    ).toThrow(Error);
    expect(() =>
      observeLighterNativeEdit(
        { ...row, filledBaseAmount: undefined },
        journal(),
      ),
    ).toThrow(Error);
    expect(() =>
      observeLighterNativeEdit({ ...row, status: 'unknown' }, journal()),
    ).toThrow(Error);
  });

  it('projects recorded intent separately from a different requested mutation', () => {
    const record = journal();
    record.status = 'settled';
    record.resolution = 'executed';
    record.observation = observeLighterNativeEdit(
      { ...row, price: '91000' },
      record,
    );
    expect(lighterNativeEditResult(record, params)).toMatchObject({
      success: true,
      orderEdit: { status: 'settled' },
    });
    expect(
      lighterNativeEditResult(record, { ...params, price: '92000' }),
    ).toMatchObject({
      success: false,
      orderEdit: { status: 'settled', requestedPrice: '91000' },
    });
    expect(
      lighterNativeEditResult(record, { ...params, symbol: 'ETH' }).success,
    ).toBe(false);
  });
});
