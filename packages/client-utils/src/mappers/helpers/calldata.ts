import { TransactionType } from '@metamask/transaction-controller';

const TRANSFER_SELECTOR = '0xa9059cbb';
const TRANSFER_FROM_SELECTOR = '0x23b872dd';
const SAFE_TRANSFER_FROM_SELECTOR = '0x42842e0e';
const ERC1155_SAFE_TRANSFER_FROM_SELECTOR = '0xf242432a';

/**
 * Extracts the recipient address from a token transfer calldata.
 *
 * @param data - The transaction calldata.
 * @param transactionType - The transaction type.
 * @returns The recipient address, or undefined if extraction fails.
 */
export function extractTokenTransferRecipient(
  data: string | undefined,
  transactionType: TransactionType,
): string | undefined {
  if (!data || data.length < 74) {
    return undefined;
  }

  const selector = data.slice(0, 10).toLowerCase();

  if (
    transactionType === TransactionType.tokenMethodTransfer &&
    selector === TRANSFER_SELECTOR
  ) {
    return `0x${data.slice(34, 74)}`;
  }

  if (
    (transactionType === TransactionType.tokenMethodTransferFrom ||
      transactionType === TransactionType.tokenMethodSafeTransferFrom) &&
    (selector === TRANSFER_FROM_SELECTOR ||
      selector === SAFE_TRANSFER_FROM_SELECTOR ||
      selector === ERC1155_SAFE_TRANSFER_FROM_SELECTOR)
  ) {
    if (data.length < 138) {
      return undefined;
    }
    return `0x${data.slice(98, 138)}`;
  }

  return undefined;
}
