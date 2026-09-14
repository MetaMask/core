import type {
  ApplyAutorampRemoteStatusResult,
  AutorampAccount,
  AutorampRemoteSnapshot,
} from './autorampAccount.js';
import {
  AutorampStatus,
  applyAutorampRemoteStatus,
  createAutorampAccount,
  isTerminalAutorampStatus,
  markAutorampNotified,
  normalizeAutorampStatus,
} from './autorampAccount.js';

describe('autorampAccount', () => {
  describe('normalizeAutorampStatus', () => {
    it('returns known statuses as-is', () => {
      expect(normalizeAutorampStatus(AutorampStatus.Approved)).toBe(
        AutorampStatus.Approved,
      );
      expect(normalizeAutorampStatus('DepositAccountAdded')).toBe(
        AutorampStatus.DepositAccountAdded,
      );
    });

    it('falls back to Created for unknown values', () => {
      expect(normalizeAutorampStatus('Nope')).toBe(AutorampStatus.Created);
    });
  });

  describe('isTerminalAutorampStatus', () => {
    it('identifies terminal statuses', () => {
      expect(isTerminalAutorampStatus(AutorampStatus.Rejected)).toBe(true);
      expect(isTerminalAutorampStatus(AutorampStatus.Cancelled)).toBe(true);
      expect(isTerminalAutorampStatus(AutorampStatus.Approved)).toBe(false);
      expect(isTerminalAutorampStatus(AutorampStatus.Authorized)).toBe(false);
    });
  });

  describe('createAutorampAccount', () => {
    it('defaults status to Authorized and mirrors lastSeenStatus', () => {
      const account = createAutorampAccount({
        id: 'ar-1',
        customerId: 'cust-1',
        walletAddress: '0xabc',
        updatedAt: 1000,
      });

      expect(account).toStrictEqual({
        id: 'ar-1',
        customerId: 'cust-1',
        walletAddress: '0xabc',
        status: AutorampStatus.Authorized,
        lastSeenStatus: AutorampStatus.Authorized,
        updatedAt: 1000,
        depositRailsSummary: undefined,
      });
    });
  });

  describe('applyAutorampRemoteStatus', () => {
    const baseLocal: AutorampAccount = createAutorampAccount({
      id: 'ar-1',
      customerId: 'cust-1',
      walletAddress: '0xabc',
      status: AutorampStatus.Authorized,
      updatedAt: 1,
    });

    it('creates a local account without notify when local is null', () => {
      const remote: AutorampRemoteSnapshot = {
        id: 'ar-1',
        customerId: 'cust-1',
        walletAddress: '0xabc',
        status: AutorampStatus.Approved,
        depositRailsSummary: { ready: true, currency: 'EUR' },
      };

      const result = applyAutorampRemoteStatus(null, remote);

      expect(result.statusChanged).toBe(false);
      expect(result.shouldNotify).toBe(false);
      expect(result.account.status).toBe(AutorampStatus.Approved);
      expect(result.account.depositRailsSummary).toStrictEqual({
        ready: true,
        currency: 'EUR',
      });
    });

    it('defaults missing identity on first upsert', () => {
      const result = applyAutorampRemoteStatus(null, {
        id: 'ar-1',
        status: AutorampStatus.Authorized,
      });
      expect(result.account.customerId).toBe('');
      expect(result.account.walletAddress).toBe('');
    });

    it('detects Approved transition and requests notify once', () => {
      const remote: AutorampRemoteSnapshot = {
        id: 'ar-1',
        customerId: 'cust-1',
        status: AutorampStatus.Approved,
        depositRailsSummary: { ready: true },
      };

      const result = applyAutorampRemoteStatus(baseLocal, remote);

      expect(result).toMatchObject({
        previousStatus: AutorampStatus.Authorized,
        statusChanged: true,
        shouldNotify: true,
      } satisfies Partial<ApplyAutorampRemoteStatusResult>);
      expect(result.account.status).toBe(AutorampStatus.Approved);
      expect(result.account.lastSeenStatus).toBe(AutorampStatus.Authorized);
    });

    it('does not notify again when already notified for that status', () => {
      const local = markAutorampNotified({
        ...baseLocal,
        status: AutorampStatus.Approved,
        lastSeenStatus: AutorampStatus.Authorized,
        notifiedForStatus: AutorampStatus.Approved,
      });

      const result = applyAutorampRemoteStatus(local, {
        id: 'ar-1',
        customerId: 'cust-1',
        status: AutorampStatus.Approved,
      });

      expect(result.statusChanged).toBe(false);
      expect(result.shouldNotify).toBe(false);
    });

    it('does not notify for non-notable transitions', () => {
      const result = applyAutorampRemoteStatus(baseLocal, {
        id: 'ar-1',
        customerId: 'cust-1',
        status: AutorampStatus.DepositAccountAdded,
      });

      expect(result.statusChanged).toBe(true);
      expect(result.shouldNotify).toBe(false);
    });

    it('keeps local identity when remote omits or blanks customerId and walletAddress', () => {
      const omitted = applyAutorampRemoteStatus(baseLocal, {
        id: 'ar-1',
        status: AutorampStatus.Approved,
      });
      expect(omitted.account.customerId).toBe('cust-1');
      expect(omitted.account.walletAddress).toBe('0xabc');

      const blank = applyAutorampRemoteStatus(baseLocal, {
        id: 'ar-1',
        customerId: '',
        walletAddress: '',
        status: AutorampStatus.Approved,
      });
      expect(blank.account.customerId).toBe('cust-1');
      expect(blank.account.walletAddress).toBe('0xabc');
    });

    it('notifies for Rejected', () => {
      const result = applyAutorampRemoteStatus(baseLocal, {
        id: 'ar-1',
        customerId: 'cust-1',
        status: AutorampStatus.Rejected,
      });

      expect(result.shouldNotify).toBe(true);
    });
  });

  describe('markAutorampNotified', () => {
    it('sets notifiedForStatus to current status', () => {
      const account = createAutorampAccount({
        id: 'ar-1',
        customerId: 'cust-1',
        walletAddress: '0xabc',
        status: AutorampStatus.Approved,
      });

      expect(markAutorampNotified(account).notifiedForStatus).toBe(
        AutorampStatus.Approved,
      );
    });
  });
});
