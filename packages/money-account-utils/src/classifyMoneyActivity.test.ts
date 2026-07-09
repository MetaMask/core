import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  CHAIN_IDS,
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { MoneyActivityKind } from './classifyMoneyActivity';
import {
  classifyMoneyActivity,
  getMoneyActivityStatus,
  moneyActivityLabelKey,
} from './classifyMoneyActivity';
import { MUSD_TOKEN_ADDRESS } from './musd';

const CHAIN_ID: Hex = '0x1';
const USDC_ADDRESS: Hex = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

function makeTx(extra: Record<string, unknown>): TransactionMeta {
  return {
    id: 'tx-1',
    chainId: CHAIN_ID,
    ...extra,
  } as unknown as TransactionMeta;
}

describe('classifyMoneyActivity', () => {
  it('classifies a crypto moneyAccountDeposit as a conversion', () => {
    const tx = makeTx({
      type: TransactionType.moneyAccountDeposit,
      metamaskPay: { tokenAddress: USDC_ADDRESS, chainId: CHAIN_ID },
    });
    expect(classifyMoneyActivity(tx)).toBe('converted');
  });

  it('classifies a bare moneyAccountDeposit (no pay metadata) as a conversion', () => {
    const tx = makeTx({ type: TransactionType.moneyAccountDeposit });
    expect(classifyMoneyActivity(tx)).toBe('converted');
  });

  it('classifies a fiat on-ramp moneyAccountDeposit as a deposit', () => {
    const tx = makeTx({
      type: TransactionType.moneyAccountDeposit,
      metamaskPay: { fiat: { orderId: 'o-1', provider: 'transak-native' } },
    });
    expect(classifyMoneyActivity(tx)).toBe('deposited');
  });

  it('classifies an mUSD-funded moneyAccountDeposit as a deposit (top-up, not conversion)', () => {
    const tx = makeTx({
      type: TransactionType.moneyAccountDeposit,
      metamaskPay: { tokenAddress: MUSD_TOKEN_ADDRESS, chainId: CHAIN_ID },
    });
    expect(classifyMoneyActivity(tx)).toBe('deposited');
  });

  it('classifies musdConversion as a conversion', () => {
    expect(
      classifyMoneyActivity(makeTx({ type: TransactionType.musdConversion })),
    ).toBe('converted');
  });

  it.each([
    TransactionType.incoming,
    TransactionType.tokenMethodTransfer,
    TransactionType.tokenMethodTransferFrom,
  ])('classifies %s as received', (type) => {
    expect(classifyMoneyActivity(makeTx({ type }))).toBe('received');
  });

  it.each([TransactionType.moneyAccountWithdraw, TransactionType.simpleSend])(
    'classifies %s as sent',
    (type) => {
      expect(classifyMoneyActivity(makeTx({ type }))).toBe('sent');
    },
  );

  const MUSD_ON_MONAD = {
    tokenAddress: MUSD_TOKEN_ADDRESS,
    chainId: CHAIN_IDS.MONAD,
  };

  it.each([
    TransactionType.perpsDeposit,
    TransactionType.perpsDepositAndOrder,
    TransactionType.predictDeposit,
    TransactionType.predictDepositAndOrder,
  ])(
    'classifies a money-funded %s as sent (outflow to the service)',
    (type) => {
      expect(
        classifyMoneyActivity(makeTx({ type, metamaskPay: MUSD_ON_MONAD })),
      ).toBe('sent');
    },
  );

  it.each([TransactionType.perpsWithdraw, TransactionType.predictWithdraw])(
    'classifies an mUSD %s as deposited (inflow into the Money account)',
    (type) => {
      const tx = makeTx({
        type: TransactionType.batch,
        nestedTransactions: [{ type }],
        metamaskPay: MUSD_ON_MONAD,
      });
      expect(classifyMoneyActivity(tx)).toBe('deposited');
    },
  );

  it('does not treat a non-mUSD perps deposit as a Money outflow', () => {
    const tx = makeTx({
      type: TransactionType.perpsDeposit,
      metamaskPay: { tokenAddress: USDC_ADDRESS, chainId: CHAIN_ID },
    });
    // Falls through to the default branch rather than the 'sent' early return.
    expect(classifyMoneyActivity(tx)).toBe('received');
  });

  it('resolves the nested type for an EIP-7702 batch crypto deposit', () => {
    const tx = makeTx({
      type: TransactionType.batch,
      nestedTransactions: [{ type: TransactionType.moneyAccountDeposit }],
    });
    expect(classifyMoneyActivity(tx)).toBe('converted');
  });

  it('resolves the nested type for an EIP-7702 batch withdraw', () => {
    const tx = makeTx({
      type: TransactionType.batch,
      nestedTransactions: [{ type: TransactionType.moneyAccountWithdraw }],
    });
    expect(classifyMoneyActivity(tx)).toBe('sent');
  });

  it('falls back to received for a batch with no money-type nested call', () => {
    const tx = makeTx({
      type: TransactionType.batch,
      nestedTransactions: [{ type: TransactionType.swap }],
    });
    expect(classifyMoneyActivity(tx)).toBe('received');
  });

  it('defaults an undefined type to deposited', () => {
    expect(classifyMoneyActivity(makeTx({ type: undefined }))).toBe(
      'deposited',
    );
  });

  it('lets an explicit moneyActivityTitleKey override the derived kind', () => {
    const tx = makeTx({
      // A crypto deposit would derive "converted"; the title key wins.
      type: TransactionType.moneyAccountDeposit,
      metamaskPay: { tokenAddress: USDC_ADDRESS, chainId: CHAIN_ID },
      moneyActivityTitleKey: 'deposited',
    });
    expect(classifyMoneyActivity(tx)).toBe('deposited');
  });

  it('maps the card_transaction title key to the card kind', () => {
    const tx = makeTx({
      type: TransactionType.moneyAccountWithdraw,
      moneyActivityTitleKey: 'card_transaction',
    });
    expect(classifyMoneyActivity(tx)).toBe('card');
  });

  it('falls back to received for an unknown title key', () => {
    const tx = makeTx({
      type: TransactionType.moneyAccountWithdraw,
      moneyActivityTitleKey: 'not-a-real-key',
    });
    expect(classifyMoneyActivity(tx)).toBe('received');
  });
});

describe('getMoneyActivityStatus', () => {
  it.each([
    // approved/signed = held by the MetaMask Pay publish hook while a
    // cross-chain payment completes — in-flight, not mid-compose.
    [TransactionStatus.approved, 'pending'],
    [TransactionStatus.signed, 'pending'],
    [TransactionStatus.submitted, 'pending'],
    [TransactionStatus.failed, 'failed'],
    [TransactionStatus.confirmed, 'confirmed'],
    [undefined, 'confirmed'],
  ])('maps tx.status %s to %s', (status, expected) => {
    expect(getMoneyActivityStatus(makeTx({ status }))).toBe(expected);
  });
});

describe('moneyActivityLabelKey — confirmed labels', () => {
  it.each([
    ['deposited', 'money.transaction.deposited'],
    ['received', 'money.transaction.received'],
    ['converted', 'money.transaction.converted'],
    ['sent', 'money.transaction.sent'],
    ['card', 'money.transaction.card_transaction'],
    ['cashback', 'money.transaction.cashback'],
  ] as [MoneyActivityKind, string][])('kind "%s" → key %s', (kind, key) => {
    expect(moneyActivityLabelKey(kind, 'confirmed')).toBe(key);
  });
});

describe('moneyActivityLabelKey — pending (present-tense) labels', () => {
  it.each([
    ['deposited', 'money.transaction.depositing'],
    ['converted', 'money.transaction.converting'],
    ['sent', 'money.transaction.sending'],
    ['received', 'money.transaction.receiving'],
  ] as [MoneyActivityKind, string][])('kind "%s" pending → %s', (kind, key) => {
    expect(moneyActivityLabelKey(kind, 'pending')).toBe(key);
  });

  it('falls back to the confirmed key for kinds with no pending form', () => {
    expect(moneyActivityLabelKey('card', 'pending')).toBe(
      'money.transaction.card_transaction',
    );
  });
});

describe('moneyActivityLabelKey — failed labels', () => {
  it.each([
    ['deposited', 'money.transaction.deposit_failed'],
    ['converted', 'money.transaction.conversion_failed'],
    ['sent', 'money.transaction.send_failed'],
  ] as [MoneyActivityKind, string][])('kind "%s" failed → %s', (kind, key) => {
    expect(moneyActivityLabelKey(kind, 'failed')).toBe(key);
  });

  it('falls back to the confirmed key for kinds with no failed form', () => {
    expect(moneyActivityLabelKey('received', 'failed')).toBe(
      'money.transaction.received',
    );
  });
});
