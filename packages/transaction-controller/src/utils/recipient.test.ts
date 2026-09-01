import { Interface } from '@ethersproject/abi';
import { abiERC721, abiERC1155 } from '@metamask/metamask-eth-abis';

import type { TransactionMeta } from '../types.js';
import { TransactionStatus, TransactionType } from '../types.js';
import { getEffectiveRecipient, getSendRecipients } from './recipient.js';

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

const ERC721_SAFE_TRANSFER_FROM_DATA = new Interface(
  abiERC721,
).encodeFunctionData('safeTransferFrom(address,address,uint256)', [
  FROM_ADDRESS,
  TOKEN_RECIPIENT,
  '1',
]);

const ERC1155_SAFE_TRANSFER_FROM_DATA = new Interface(
  abiERC1155,
).encodeFunctionData('safeTransferFrom', [
  FROM_ADDRESS,
  TOKEN_RECIPIENT,
  '1',
  '1',
  '0x',
]);

const ERC1155_SAFE_BATCH_TRANSFER_FROM_DATA = new Interface(
  abiERC1155,
).encodeFunctionData('safeBatchTransferFrom', [
  FROM_ADDRESS,
  TOKEN_RECIPIENT,
  ['1'],
  ['1'],
  '0x',
]);

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

describe('getSendRecipients', () => {
  it('returns the native recipient for simple sends', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.simpleSend,
      undefined,
      TOKEN_RECIPIENT,
    );

    expect(getSendRecipients(transactionMeta)).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('prefers txParamsOriginal.to when container wrapping replaced the recipient', () => {
    const transactionMeta = {
      ...buildTransactionMeta(
        TransactionType.simpleSend,
        undefined,
        TOKEN_CONTRACT,
      ),
      txParamsOriginal: {
        from: FROM_ADDRESS,
        to: TOKEN_RECIPIENT,
        value: '0x0',
      },
    };

    expect(getSendRecipients(transactionMeta)).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('returns the decoded payee for token transfers and ignores the token contract', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodTransfer,
      TRANSFER_DATA,
    );

    expect(
      getSendRecipients(transactionMeta).map((address) =>
        address.toLowerCase(),
      ),
    ).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('returns the decoded payee for transferFrom transactions', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodTransferFrom,
      TRANSFER_FROM_DATA,
    );

    expect(
      getSendRecipients(transactionMeta).map((address) =>
        address.toLowerCase(),
      ),
    ).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('returns the decoded payee for ERC-721 safeTransferFrom transactions', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodSafeTransferFrom,
      ERC721_SAFE_TRANSFER_FROM_DATA,
    );

    expect(
      getSendRecipients(transactionMeta).map((address) =>
        address.toLowerCase(),
      ),
    ).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('returns the decoded payee for ERC-1155 safeTransferFrom transactions', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodSafeTransferFrom,
      ERC1155_SAFE_TRANSFER_FROM_DATA,
    );

    expect(
      getSendRecipients(transactionMeta).map((address) =>
        address.toLowerCase(),
      ),
    ).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('returns no recipients when token transfer calldata cannot be decoded', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodTransfer,
      '0x01',
    );

    expect(getSendRecipients(transactionMeta)).toStrictEqual([]);
  });

  it('returns no recipients for approve transactions', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.tokenMethodApprove,
      '0x095ea7b3000000000000000000000000cccccccccccccccccccccccccccccccccccccccc0000000000000000000000000000000000000000000000000000000000000001',
    );

    expect(getSendRecipients(transactionMeta)).toStrictEqual([]);
  });

  it('returns no recipients for contract interactions', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.contractInteraction,
      TRANSFER_DATA,
    );

    expect(getSendRecipients(transactionMeta)).toStrictEqual([]);
  });

  it('returns the decoded payee for ERC-1155 safeBatchTransferFrom contract interactions', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.contractInteraction,
      ERC1155_SAFE_BATCH_TRANSFER_FROM_DATA,
    );

    expect(
      getSendRecipients(transactionMeta).map((address) =>
        address.toLowerCase(),
      ),
    ).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('returns swapAndSendRecipient for swap-and-send transactions', () => {
    const transactionMeta = {
      ...buildTransactionMeta(TransactionType.swapAndSend, TRANSFER_DATA),
      swapAndSendRecipient: TOKEN_RECIPIENT,
    };

    expect(getSendRecipients(transactionMeta)).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('includes nested send and transfer payees from a batch', () => {
    const nestedSendRecipient = '0x1234dddddddddddddddddddddddddddddddd9abc';
    const transactionMeta = {
      ...buildTransactionMeta(
        TransactionType.batch,
        '0xdeadbeef',
        TOKEN_CONTRACT,
      ),
      nestedTransactions: [
        {
          to: nestedSendRecipient,
          type: TransactionType.simpleSend,
        },
        {
          data: TRANSFER_DATA,
          to: TOKEN_CONTRACT,
          type: TransactionType.tokenMethodTransfer,
        },
        {
          to: TOKEN_CONTRACT,
          type: TransactionType.tokenMethodApprove,
        },
      ],
    };

    expect(
      getSendRecipients(transactionMeta).map((address) =>
        address.toLowerCase(),
      ),
    ).toStrictEqual([nestedSendRecipient, TOKEN_RECIPIENT]);
  });

  it('includes a nested ERC-1155 safeBatchTransferFrom payee from a batch', () => {
    const transactionMeta = {
      ...buildTransactionMeta(
        TransactionType.batch,
        '0xdeadbeef',
        TOKEN_CONTRACT,
      ),
      nestedTransactions: [
        {
          data: ERC1155_SAFE_BATCH_TRANSFER_FROM_DATA,
          to: TOKEN_CONTRACT,
          type: TransactionType.contractInteraction,
        },
      ],
    };

    expect(
      getSendRecipients(transactionMeta).map((address) =>
        address.toLowerCase(),
      ),
    ).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('treats untyped transactions with no calldata as native sends', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.simpleSend,
      undefined,
      TOKEN_RECIPIENT,
    );

    expect(
      getSendRecipients({ ...transactionMeta, type: undefined }),
    ).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('classifies a sped-up simple send using originalType', () => {
    const transactionMeta = {
      ...buildTransactionMeta(
        TransactionType.retry,
        undefined,
        TOKEN_RECIPIENT,
      ),
      originalType: TransactionType.simpleSend,
    };

    expect(getSendRecipients(transactionMeta)).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('decodes the payee for a sped-up token transfer using originalType', () => {
    const transactionMeta = {
      ...buildTransactionMeta(TransactionType.retry, TRANSFER_DATA),
      originalType: TransactionType.tokenMethodTransfer,
    };

    expect(
      getSendRecipients(transactionMeta).map((address) =>
        address.toLowerCase(),
      ),
    ).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('returns no recipients for a cancellation even with a simpleSend originalType', () => {
    const transactionMeta = {
      ...buildTransactionMeta(TransactionType.cancel, undefined, FROM_ADDRESS),
      originalType: TransactionType.simpleSend,
    };

    expect(getSendRecipients(transactionMeta)).toStrictEqual([]);
  });

  it('treats a native transfer to a contract address as a native send', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.contractInteraction,
      undefined,
      TOKEN_RECIPIENT,
    );

    expect(getSendRecipients(transactionMeta)).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('returns no recipients for a contract interaction that has calldata', () => {
    const transactionMeta = buildTransactionMeta(
      TransactionType.contractInteraction,
      '0xdeadbeef',
      TOKEN_RECIPIENT,
    );

    expect(getSendRecipients(transactionMeta)).toStrictEqual([]);
  });

  it('treats a nested native transfer to a contract address as a native send', () => {
    const transactionMeta = {
      ...buildTransactionMeta(
        TransactionType.batch,
        '0xdeadbeef',
        TOKEN_CONTRACT,
      ),
      nestedTransactions: [
        {
          to: TOKEN_RECIPIENT,
          type: TransactionType.contractInteraction,
        },
      ],
    };

    expect(getSendRecipients(transactionMeta)).toStrictEqual([TOKEN_RECIPIENT]);
  });

  it('ignores stale nested transactions on a cancelled batch', () => {
    const nestedSendRecipient = '0x1234dddddddddddddddddddddddddddddddd9abc';
    const transactionMeta = {
      ...buildTransactionMeta(TransactionType.cancel, undefined, FROM_ADDRESS),
      originalType: TransactionType.batch,
      nestedTransactions: [
        {
          to: nestedSendRecipient,
          type: TransactionType.simpleSend,
        },
        {
          data: TRANSFER_DATA,
          to: TOKEN_CONTRACT,
          type: TransactionType.tokenMethodTransfer,
        },
      ],
    };

    expect(getSendRecipients(transactionMeta)).toStrictEqual([]);
  });

  it('still processes nested transactions on a sped-up batch', () => {
    const nestedSendRecipient = '0x1234dddddddddddddddddddddddddddddddd9abc';
    const transactionMeta = {
      ...buildTransactionMeta(TransactionType.retry, undefined, TOKEN_CONTRACT),
      originalType: TransactionType.batch,
      nestedTransactions: [
        {
          to: nestedSendRecipient,
          type: TransactionType.simpleSend,
        },
      ],
    };

    expect(getSendRecipients(transactionMeta)).toStrictEqual([
      nestedSendRecipient,
    ]);
  });
});
