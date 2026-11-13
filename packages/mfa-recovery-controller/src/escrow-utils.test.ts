import { describe, expect, it } from 'vitest';

import { isMutationReceipt } from './escrow-utils.js';

const RECEIPT = {
  mutationId: '0x1',
  requestHash: '0x2',
  escrowId: 'cubist',
  version: 1,
  receiptKeyId: '0xabc',
  signature: '0xdef',
};

describe('isMutationReceipt', () => {
  it('accepts a receipt with the expected shape', () => {
    expect(isMutationReceipt(RECEIPT)).toBe(true);
  });

  it('accepts extra fields', () => {
    expect(isMutationReceipt({ ...RECEIPT, extra: true })).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'receipt'],
    ['an array', [RECEIPT]],
    ['a missing mutation id', { ...RECEIPT, mutationId: undefined }],
    ['a non-string request hash', { ...RECEIPT, requestHash: 2 }],
    ['a non-string escrow id', { ...RECEIPT, escrowId: 1 }],
    ['a fractional version', { ...RECEIPT, version: 1.5 }],
    ['a NaN version', { ...RECEIPT, version: Number.NaN }],
    ['a negative version', { ...RECEIPT, version: -1 }],
    ['a non-string receipt key id', { ...RECEIPT, receiptKeyId: null }],
    ['a non-string signature', { ...RECEIPT, signature: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(isMutationReceipt(value)).toBe(false);
  });
});
