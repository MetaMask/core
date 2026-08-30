import type { TransactionMeta } from '../types.js';
import { TransactionStatus, TransactionType } from '../types.js';
import { getEffectiveRecipient } from './recipient.js';

const FROM_ADDRESS = '0x0987654321098765432109876543210987654321';
const TOKEN_CONTRACT = '0x1234567890123456789012345678901234567890';
const TOKEN_RECIPIENT = '0x1234cccccccccccccccccccccccccccccccc9abc';

// transfer(address _to, uint256 _value)
const TRANSFER_DATA = `0xa9059cbb000000000000000000000000${TOKEN_RECIPIENT.slice(
  2,
)}0000000000000000000000000000000000000000000000000000000000000064`;

// transferFrom(address _from, address _to, uint256 _value)
const TRANSFER_FROM_DATA = `0x23b872dd000000000000000000000000${FROM_ADDRESS.slice(
  2,
)}000000000000000000000000${TOKEN_RECIPIENT.slice(
  2,
)}0000000000000000000000000000000000000000000000000000000000000064`;

/**
 * Builds a minimal transaction meta object for testing.
 *
 * @param type - The transaction type.
 * @param data - Optional transaction calldata.
 * @param to - The `txParams.to` address.
 * @returns The transaction meta object.
 */
function buildTransactionMeta(
  type: TransactionType,
  data?: string,
  to: string = TOKEN_CONTRACT,
): TransactionMeta {
  return {
    chainId: '0x1',
    id: 'test-tx',
    networkClientId: 'mainnet',
    status: TransactionStatus.confirmed,
    time: 123456789,
    txParams: {
      from: FROM_ADDRESS,
      to,
      value: '0x0',
      ...(data ? { data } : {}),
    },
    type,
  } as TransactionMeta;
}

describe('getEffectiveRecipient', () => {
  it('returns txParams.to for simple sends', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.simpleSend,
      undefined,
      TOKEN_RECIPIENT,
    );

    expect(getEffectiveRecipient(transactionMeta)).toBe(TOKEN_RECIPIENT);
  });

  it('returns txParams.to for contract interactions even when calldata is present', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.contractInteraction,
      TRANSFER_DATA,
    );

    expect(getEffectiveRecipient(transactionMeta)).toBe(TOKEN_CONTRACT);
  });

  it('returns the decoded recipient for ERC-20 transfer transactions', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodTransfer,
      TRANSFER_DATA,
    );

    expect(getEffectiveRecipient(transactionMeta)?.toLowerCase()).toBe(
      TOKEN_RECIPIENT,
    );
  });

  it('returns the decoded recipient for transferFrom transactions', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodTransferFrom,
      TRANSFER_FROM_DATA,
    );

    expect(getEffectiveRecipient(transactionMeta)?.toLowerCase()).toBe(
      TOKEN_RECIPIENT,
    );
  });

  it('falls back to txParams.to when token transfer calldata cannot be decoded', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodTransfer,
      '0x01',
    );

    expect(getEffectiveRecipient(transactionMeta)).toBe(TOKEN_CONTRACT);
  });

  it('returns txParams.to when a token transfer transaction has no calldata', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodTransfer,
    );

    expect(getEffectiveRecipient(transactionMeta)).toBe(TOKEN_CONTRACT);
  });
});
