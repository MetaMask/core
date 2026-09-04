import type { Hex } from '@metamask/utils';

import type {
  ApplyDepositRemoteStatusResult,
  MoneyAccountDeposit,
  MoneyAccountDepositRemoteSnapshot,
} from './moneyAccountDeposit.js';
import {
  MoneyAccountDepositStatus,
  applyDepositRemoteStatus,
  createMoneyAccountDeposit,
  isTerminalDepositStatus,
  markDepositNotified,
  normalizeDepositStatus,
} from './moneyAccountDeposit.js';

const MONEY_ACCOUNT = '0xaccount' as Hex;
const PAYOUT_HASH = '0xpayout' as Hex;

describe('moneyAccountDeposit', () => {
  describe('normalizeDepositStatus', () => {
    it('returns known statuses as-is', () => {
      expect(normalizeDepositStatus(MoneyAccountDepositStatus.Completed)).toBe(
        MoneyAccountDepositStatus.Completed,
      );
      expect(normalizeDepositStatus('Processing')).toBe(
        MoneyAccountDepositStatus.Processing,
      );
    });

    it('falls back to Pending for unknown values', () => {
      expect(normalizeDepositStatus('Nope')).toBe(
        MoneyAccountDepositStatus.Pending,
      );
    });
  });

  describe('isTerminalDepositStatus', () => {
    it('identifies terminal statuses', () => {
      expect(isTerminalDepositStatus(MoneyAccountDepositStatus.Completed)).toBe(
        true,
      );
      expect(isTerminalDepositStatus(MoneyAccountDepositStatus.Failed)).toBe(
        true,
      );
      expect(isTerminalDepositStatus(MoneyAccountDepositStatus.Cancelled)).toBe(
        true,
      );
      expect(isTerminalDepositStatus(MoneyAccountDepositStatus.Pending)).toBe(
        false,
      );
      expect(isTerminalDepositStatus(MoneyAccountDepositStatus.Processing)).toBe(
        false,
      );
    });
  });

  describe('createMoneyAccountDeposit', () => {
    it('defaults status to Pending and mirrors lastSeenStatus', () => {
      const deposit = createMoneyAccountDeposit({
        id: 'dep-1',
        moneyAccountAddress: MONEY_ACCOUNT,
        updatedAt: 1000,
      });

      expect(deposit).toStrictEqual({
        id: 'dep-1',
        autorampId: undefined,
        moneyAccountAddress: MONEY_ACCOUNT,
        status: MoneyAccountDepositStatus.Pending,
        payoutTransactionHash: undefined,
        amount: undefined,
        currency: undefined,
        lastSeenStatus: MoneyAccountDepositStatus.Pending,
        updatedAt: 1000,
      });
    });

    it('carries optional display + payout fields', () => {
      const deposit = createMoneyAccountDeposit({
        id: 'dep-1',
        moneyAccountAddress: MONEY_ACCOUNT,
        autorampId: 'ar-1',
        status: MoneyAccountDepositStatus.Completed,
        payoutTransactionHash: PAYOUT_HASH,
        amount: '100.00',
        currency: 'BRL',
        updatedAt: 5,
      });

      expect(deposit).toMatchObject({
        autorampId: 'ar-1',
        status: MoneyAccountDepositStatus.Completed,
        payoutTransactionHash: PAYOUT_HASH,
        amount: '100.00',
        currency: 'BRL',
      });
    });
  });

  describe('applyDepositRemoteStatus', () => {
    const baseLocal: MoneyAccountDeposit = createMoneyAccountDeposit({
      id: 'dep-1',
      moneyAccountAddress: MONEY_ACCOUNT,
      autorampId: 'ar-1',
      status: MoneyAccountDepositStatus.Processing,
      updatedAt: 1,
    });

    it('creates a local deposit without notify when local is null', () => {
      const remote: MoneyAccountDepositRemoteSnapshot = {
        id: 'dep-1',
        autorampId: 'ar-1',
        moneyAccountAddress: MONEY_ACCOUNT,
        status: MoneyAccountDepositStatus.Pending,
      };

      const result = applyDepositRemoteStatus(null, remote);

      expect(result.statusChanged).toBe(false);
      expect(result.shouldNotify).toBe(false);
      expect(result.deposit.status).toBe(MoneyAccountDepositStatus.Pending);
      expect(result.deposit.autorampId).toBe('ar-1');
    });

    it('detects Completed transition and requests notify once', () => {
      const remote: MoneyAccountDepositRemoteSnapshot = {
        id: 'dep-1',
        status: MoneyAccountDepositStatus.Completed,
        payoutTransactionHash: PAYOUT_HASH,
      };

      const result = applyDepositRemoteStatus(baseLocal, remote);

      expect(result).toMatchObject({
        previousStatus: MoneyAccountDepositStatus.Processing,
        statusChanged: true,
        shouldNotify: true,
      } satisfies Partial<ApplyDepositRemoteStatusResult>);
      expect(result.deposit.status).toBe(MoneyAccountDepositStatus.Completed);
      expect(result.deposit.lastSeenStatus).toBe(
        MoneyAccountDepositStatus.Processing,
      );
      expect(result.deposit.payoutTransactionHash).toBe(PAYOUT_HASH);
    });

    it('does not notify again when already notified for that status', () => {
      const local = markDepositNotified({
        ...baseLocal,
        status: MoneyAccountDepositStatus.Completed,
        lastSeenStatus: MoneyAccountDepositStatus.Processing,
        notifiedForStatus: MoneyAccountDepositStatus.Completed,
      });

      const result = applyDepositRemoteStatus(local, {
        id: 'dep-1',
        status: MoneyAccountDepositStatus.Completed,
      });

      expect(result.statusChanged).toBe(false);
      expect(result.shouldNotify).toBe(false);
    });

    it('does not notify for non-notable transitions', () => {
      const local = createMoneyAccountDeposit({
        id: 'dep-1',
        moneyAccountAddress: MONEY_ACCOUNT,
        status: MoneyAccountDepositStatus.Pending,
        updatedAt: 1,
      });

      const result = applyDepositRemoteStatus(local, {
        id: 'dep-1',
        status: MoneyAccountDepositStatus.Processing,
      });

      expect(result.statusChanged).toBe(true);
      expect(result.shouldNotify).toBe(false);
    });

    it('notifies for Failed', () => {
      const result = applyDepositRemoteStatus(baseLocal, {
        id: 'dep-1',
        status: MoneyAccountDepositStatus.Failed,
      });

      expect(result.shouldNotify).toBe(true);
    });

    it('preserves a previously observed payout hash when a later snapshot omits it', () => {
      const local: MoneyAccountDeposit = {
        ...baseLocal,
        status: MoneyAccountDepositStatus.Completed,
        payoutTransactionHash: PAYOUT_HASH,
      };

      const result = applyDepositRemoteStatus(local, {
        id: 'dep-1',
        status: MoneyAccountDepositStatus.Completed,
      });

      expect(result.deposit.payoutTransactionHash).toBe(PAYOUT_HASH);
    });

    it('preserves local money account address when the snapshot omits it', () => {
      const result = applyDepositRemoteStatus(baseLocal, {
        id: 'dep-1',
        status: MoneyAccountDepositStatus.Completed,
      });

      expect(result.deposit.moneyAccountAddress).toBe(MONEY_ACCOUNT);
    });
  });

  describe('markDepositNotified', () => {
    it('sets notifiedForStatus to current status', () => {
      const deposit = createMoneyAccountDeposit({
        id: 'dep-1',
        moneyAccountAddress: MONEY_ACCOUNT,
        status: MoneyAccountDepositStatus.Completed,
      });

      expect(markDepositNotified(deposit).notifiedForStatus).toBe(
        MoneyAccountDepositStatus.Completed,
      );
    });
  });
});
