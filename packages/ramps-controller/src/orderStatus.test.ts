import {
  TERMINAL_ORDER_STATUSES,
  isTerminalOrderStatus,
} from './orderStatus.js';
import { RampsOrderStatus } from './RampsService.js';

describe('TERMINAL_ORDER_STATUSES', () => {
  it('includes completed, failed, cancelled, and id expired', () => {
    expect(TERMINAL_ORDER_STATUSES.has(RampsOrderStatus.Completed)).toBe(true);
    expect(TERMINAL_ORDER_STATUSES.has(RampsOrderStatus.Failed)).toBe(true);
    expect(TERMINAL_ORDER_STATUSES.has(RampsOrderStatus.Cancelled)).toBe(true);
    expect(TERMINAL_ORDER_STATUSES.has(RampsOrderStatus.IdExpired)).toBe(true);
  });

  it('excludes non-terminal statuses', () => {
    expect(TERMINAL_ORDER_STATUSES.has(RampsOrderStatus.Unknown)).toBe(false);
    expect(TERMINAL_ORDER_STATUSES.has(RampsOrderStatus.Precreated)).toBe(
      false,
    );
    expect(TERMINAL_ORDER_STATUSES.has(RampsOrderStatus.Created)).toBe(false);
    expect(TERMINAL_ORDER_STATUSES.has(RampsOrderStatus.Pending)).toBe(false);
  });
});

describe('isTerminalOrderStatus', () => {
  it.each([
    RampsOrderStatus.Completed,
    RampsOrderStatus.Failed,
    RampsOrderStatus.Cancelled,
    RampsOrderStatus.IdExpired,
  ])('returns true for terminal status %s', (status) => {
    expect(isTerminalOrderStatus(status)).toBe(true);
  });

  it.each([
    RampsOrderStatus.Unknown,
    RampsOrderStatus.Precreated,
    RampsOrderStatus.Created,
    RampsOrderStatus.Pending,
  ])('returns false for non-terminal status %s', (status) => {
    expect(isTerminalOrderStatus(status)).toBe(false);
  });
});
