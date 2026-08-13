import { buildOwnershipMessage } from './ownership-message.js';

describe('buildOwnershipMessage', () => {
  it('builds the exact MoonPay ownership sentence', () => {
    const result = buildOwnershipMessage({
      address: '0xAbCdEf1234567890',
      customerId: 'customer-123',
      now: new Date('2026-08-12T15:30:00.000Z'),
    });

    expect(result).toBe(
      'I am verifying ownership of the wallet address 0xAbCdEf1234567890 as customer customer-123. This message was signed on 12/08/2026 to confirm my control over this wallet.',
    );
  });

  it('formats the date in UTC across a local date boundary', () => {
    const result = buildOwnershipMessage({
      address: '0x1234',
      customerId: 'customer-123',
      now: new Date('2027-01-01T00:30:00.000Z'),
    });

    expect(result).toContain('signed on 01/01/2027');
  });

  it('preserves the exact supplied address casing', () => {
    const result = buildOwnershipMessage({
      address: '0xAbCdEf',
      customerId: 'customer-123',
      now: new Date('2026-08-12T15:30:00.000Z'),
    });

    expect(result).toContain('wallet address 0xAbCdEf as customer');
  });

  it('does not add surrounding whitespace or a trailing newline', () => {
    const result = buildOwnershipMessage({
      address: '0x1234',
      customerId: 'customer-123',
      now: new Date('2026-08-12T15:30:00.000Z'),
    });

    expect(result).toBe(result.trim());
    expect(result.endsWith('\n')).toBe(false);
  });

  it('builds a fresh message after UTC midnight', () => {
    const request = {
      address: '0x1234',
      customerId: 'customer-123',
    };

    const beforeMidnight = buildOwnershipMessage({
      ...request,
      now: new Date('2026-08-12T23:59:59.999Z'),
    });
    const afterMidnight = buildOwnershipMessage({
      ...request,
      now: new Date('2026-08-13T00:00:00.000Z'),
    });

    expect(beforeMidnight).toContain('signed on 12/08/2026');
    expect(afterMidnight).toContain('signed on 13/08/2026');
    expect(afterMidnight).not.toBe(beforeMidnight);
  });
});
