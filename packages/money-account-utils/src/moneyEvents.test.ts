import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  BOTTOM_SHEET_NAMES,
  deriveMoneyActivityTransactionProperties,
  REDIRECT_TARGETS_TYPES,
  resolveRedirectTargetType,
  SCREEN_NAMES,
  withRedirectType,
} from './moneyEvents';

describe('analytics vocabulary', () => {
  it('keeps screen and bottom-sheet target names disjoint', () => {
    // resolveRedirectTargetType is precedence-ordered; a duplicated value
    // would be silently misclassified.
    const screens = Object.values(SCREEN_NAMES);
    const sheets = new Set<string>(Object.values(BOTTOM_SHEET_NAMES));
    expect(screens.filter((name) => sheets.has(name))).toStrictEqual([]);
  });
});

describe('resolveRedirectTargetType', () => {
  it('classifies a screen target', () => {
    expect(resolveRedirectTargetType(SCREEN_NAMES.MONEY_HOME)).toBe(
      REDIRECT_TARGETS_TYPES.SCREEN,
    );
  });

  it('classifies a bottom sheet target', () => {
    expect(
      resolveRedirectTargetType(BOTTOM_SHEET_NAMES.MONEY_ADD_MONEY_SHEET),
    ).toBe(REDIRECT_TARGETS_TYPES.BOTTOM_SHEET);
  });

  it('classifies a client URL target when provided', () => {
    expect(
      resolveRedirectTargetType('https://metamask.io/money', [
        'https://metamask.io/money',
      ]),
    ).toBe(REDIRECT_TARGETS_TYPES.EXTERNAL_BROWSER);
  });

  it('returns undefined for an unknown target', () => {
    expect(resolveRedirectTargetType('not-a-target')).toBeUndefined();
    expect(
      resolveRedirectTargetType('https://unknown.example'),
    ).toBeUndefined();
  });
});

describe('withRedirectType', () => {
  it('adds redirect_target_type derived from the target', () => {
    expect(
      withRedirectType({ redirect_target: SCREEN_NAMES.MONEY_HOME }),
    ).toStrictEqual({
      redirect_target: SCREEN_NAMES.MONEY_HOME,
      redirect_target_type: REDIRECT_TARGETS_TYPES.SCREEN,
    });
  });

  it('classifies URL targets using the provided list', () => {
    const url = 'https://metamask.io/money';
    expect(withRedirectType({ redirect_target: url }, [url])).toStrictEqual({
      redirect_target: url,
      redirect_target_type: REDIRECT_TARGETS_TYPES.EXTERNAL_BROWSER,
    });
  });

  it('is a no-op when no target is present (e.g. tooltip clicks)', () => {
    const props = { tooltip_name: 'apy' };
    expect(withRedirectType(props)).toBe(props);
  });
});

describe('deriveMoneyActivityTransactionProperties', () => {
  const baseTx = {
    id: 'tx-1',
    chainId: '0x8f' as Hex,
    status: TransactionStatus.confirmed,
  } as unknown as TransactionMeta;

  it('resolves a nested money deposit and snake_cases the type', () => {
    const tx = {
      ...baseTx,
      type: TransactionType.batch,
      nestedTransactions: [{ type: TransactionType.moneyAccountDeposit }],
    } as unknown as TransactionMeta;

    expect(deriveMoneyActivityTransactionProperties(tx)).toStrictEqual({
      transaction_type: 'money_account_deposit',
      transaction_status: TransactionStatus.confirmed,
      chain_id_source: '0x8f',
      chain_id_destination: '0x8f',
    });
  });

  it('resolves a nested money withdraw', () => {
    const tx = {
      ...baseTx,
      type: TransactionType.batch,
      nestedTransactions: [{ type: TransactionType.moneyAccountWithdraw }],
    } as unknown as TransactionMeta;

    expect(deriveMoneyActivityTransactionProperties(tx).transaction_type).toBe(
      'money_account_withdraw',
    );
  });

  it('falls back to the transaction type for non-money transactions', () => {
    const tx = {
      ...baseTx,
      type: TransactionType.simpleSend,
    } as unknown as TransactionMeta;

    expect(deriveMoneyActivityTransactionProperties(tx).transaction_type).toBe(
      'simple_send',
    );
  });

  it('splits source and destination chain ids for a MetaMask Pay deposit', () => {
    const tx = {
      ...baseTx,
      chainId: '0x8f' as Hex,
      type: TransactionType.moneyAccountDeposit,
      metamaskPay: { chainId: '0x1' as Hex, isPostQuote: false },
    } as unknown as TransactionMeta;

    const derived = deriveMoneyActivityTransactionProperties(tx);
    expect(derived.chain_id_source).toBe('0x1');
    expect(derived.chain_id_destination).toBe('0x8f');
  });
});
