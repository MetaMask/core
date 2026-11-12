import { TransactionType } from '@metamask/transaction-controller';
import { describe, expect, it } from 'vitest';

import { extractTokenTransferRecipient } from './calldata.js';

describe('extractTokenTransferRecipient', () => {
  const recipient = '0x50a9d56c2b8ba9a5c7f2c08c3d26e0499f23a706';
  const from = '0x9bed78535d6a03a955f1504aadba974d9a29e292';

  it('extracts recipient from transfer(address,uint256) calldata', () => {
    const data = `0xa9059cbb000000000000000000000000${recipient.slice(2)}0000000000000000000000000000000000000000000000000000000000004e20`;

    expect(
      extractTokenTransferRecipient(data, TransactionType.tokenMethodTransfer),
    ).toBe(recipient);
  });

  it('extracts recipient from transferFrom(address,address,uint256) calldata', () => {
    const data = `0x23b872dd000000000000000000000000${from.slice(2)}000000000000000000000000${recipient.slice(2)}0000000000000000000000000000000000000000000000000000000000004e20`;

    expect(
      extractTokenTransferRecipient(
        data,
        TransactionType.tokenMethodTransferFrom,
      ),
    ).toBe(recipient);
  });

  it('extracts recipient from safeTransferFrom(address,address,uint256) calldata', () => {
    const data = `0x42842e0e000000000000000000000000${from.slice(2)}000000000000000000000000${recipient.slice(2)}0000000000000000000000000000000000000000000000000000000000000001`;

    expect(
      extractTokenTransferRecipient(
        data,
        TransactionType.tokenMethodSafeTransferFrom,
      ),
    ).toBe(recipient);
  });

  it('extracts recipient from ERC1155 safeTransferFrom calldata', () => {
    const data = `0xf242432a000000000000000000000000${from.slice(2)}000000000000000000000000${recipient.slice(2)}0000000000000000000000000000000000000000000000000000000000000001`;

    expect(
      extractTokenTransferRecipient(
        data,
        TransactionType.tokenMethodSafeTransferFrom,
      ),
    ).toBe(recipient);
  });

  it('returns undefined for malformed calldata', () => {
    expect(
      extractTokenTransferRecipient(
        '0xa9059cbb',
        TransactionType.tokenMethodTransfer,
      ),
    ).toBeUndefined();
  });

  it('returns undefined for undefined data', () => {
    expect(
      extractTokenTransferRecipient(
        undefined,
        TransactionType.tokenMethodTransfer,
      ),
    ).toBeUndefined();
  });

  it('returns undefined for mismatched selector', () => {
    const data = `0x12345678000000000000000000000000${recipient.slice(2)}0000000000000000000000000000000000000000000000000000000000004e20`;

    expect(
      extractTokenTransferRecipient(data, TransactionType.tokenMethodTransfer),
    ).toBeUndefined();
  });

  it('returns undefined for transferFrom with insufficient data', () => {
    const data = `0x23b872dd000000000000000000000000${from.slice(2)}`;

    expect(
      extractTokenTransferRecipient(
        data,
        TransactionType.tokenMethodTransferFrom,
      ),
    ).toBeUndefined();
  });
});
