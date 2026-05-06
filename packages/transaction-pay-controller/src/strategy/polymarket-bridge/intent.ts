import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_POLYGON } from '../../constants';
import { projectLogger } from '../../logger';
import { PUSD_ADDRESS_POLYGON } from './constants';

const log = createModuleLogger(projectLogger, 'polymarket-bridge-intent');

/**
 * ERC-20 `transfer(address,uint256)` four-byte selector.
 */
const TOKEN_TRANSFER_SELECTOR = '0xa9059cbb';

/**
 * Minimum length of a valid `transfer(address,uint256)` calldata string.
 * 0x (2) + selector (8) + address param (64) + uint256 param (64) = 138.
 */
const TRANSFER_CALLDATA_MIN_LENGTH = 138;

/**
 * Extract the intent from a Polymarket deposit-wallet predictWithdraw
 * transaction.
 *
 * Returns the pUSD transfer amount and the deposit wallet address for
 * deposit-wallet users. Returns `undefined` for non-matching transactions
 * (wrong type, wrong chain, Safe-based withdrawals, etc.).
 *
 * @param transaction - Transaction metadata.
 * @returns The withdrawal intent or `undefined`.
 */
export function extractPolymarketWithdrawIntent(
  transaction: TransactionMeta,
): { amount: bigint; depositWalletAddress: Hex } | undefined {
  if (!isPredictWithdraw(transaction)) {
    log('Not a predictWithdraw transaction', transaction.type);
    return undefined;
  }

  if (transaction.chainId !== CHAIN_ID_POLYGON) {
    log('Not on Polygon', transaction.chainId);
    return undefined;
  }

  const transferCall = findPusdTransferCall(transaction);

  if (!transferCall) {
    log('No pUSD transfer call found');
    return undefined;
  }

  const { data, from } = transferCall;

  const decoded = decodeTransferCalldata(data);

  if (!decoded) {
    log('Failed to decode transfer calldata');
    return undefined;
  }

  const result = {
    amount: decoded.amount,
    depositWalletAddress: from,
  };

  log('Extracted withdraw intent', {
    amount: result.amount.toString(),
    depositWalletAddress: result.depositWalletAddress,
  });

  return result;
}

/**
 * Check whether a transaction is a predictWithdraw, either directly or
 * via nested transactions.
 *
 * @param transaction - Transaction metadata.
 * @returns `true` when the transaction is a predictWithdraw.
 */
function isPredictWithdraw(transaction: TransactionMeta): boolean {
  return (
    transaction.type === TransactionType.predictWithdraw ||
    (transaction.nestedTransactions?.some(
      (nt) => nt.type === TransactionType.predictWithdraw,
    ) ??
      false)
  );
}

/**
 * Locate the nested or top-level call that transfers pUSD.
 *
 * For deposit-wallet users the transaction contains a `pUSD.transfer` call
 * targeting the pUSD contract on Polygon. Safe users use a different
 * calldata shape (execTransaction) which will not match here.
 *
 * The deposit wallet address is always recovered from `txParams.from`
 * (the top-level sender), because nested transactions do not carry a
 * separate `from` field.
 *
 * @param transaction - Transaction metadata.
 * @returns The `to`, `data`, and `from` of the matching call, or `undefined`.
 */
function findPusdTransferCall(
  transaction: TransactionMeta,
): { to: Hex; data: Hex; from: Hex } | undefined {
  const isPusdTarget = (to?: string): boolean =>
    to?.toLowerCase() === PUSD_ADDRESS_POLYGON.toLowerCase();

  const isTransferData = (data?: string): boolean =>
    Boolean(data?.startsWith(TOKEN_TRANSFER_SELECTOR));

  // Check nested transactions first (batch wrapper pattern).
  const nestedMatch = transaction.nestedTransactions?.find(
    (nt) => isPusdTarget(nt.to) && isTransferData(nt.data),
  );

  if (nestedMatch) {
    return {
      to: nestedMatch.to as Hex,
      data: nestedMatch.data as Hex,
      from: transaction.txParams.from as Hex,
    };
  }

  // Fall back to the top-level txParams.
  const { txParams } = transaction;

  if (isPusdTarget(txParams.to) && isTransferData(txParams.data)) {
    return {
      to: txParams.to as Hex,
      data: txParams.data as Hex,
      from: txParams.from as Hex,
    };
  }

  return undefined;
}

/**
 * Decode `transfer(address,uint256)` calldata into recipient and amount.
 *
 * Layout:
 * - bytes 0–3 (chars 2–9 after 0x): selector `0xa9059cbb`
 * - bytes 4–35 (chars 10–73): ABI-encoded address (left-padded to 32 bytes)
 * - bytes 36–67 (chars 74–137): ABI-encoded uint256
 *
 * @param data - Raw calldata hex string.
 * @returns Decoded recipient and amount, or `undefined` if invalid.
 */
function decodeTransferCalldata(
  data: Hex,
): { recipient: Hex; amount: bigint } | undefined {
  if (data.length < TRANSFER_CALLDATA_MIN_LENGTH) {
    return undefined;
  }

  // Extract the 20-byte address from the 32-byte ABI-encoded slot.
  // Chars 10–73 is the full 32-byte word; the address is the last 20 bytes (chars 34–73).
  const recipient = `0x${data.slice(34, 74)}` as Hex;

  // Chars 74–137 is the 32-byte uint256 amount.
  const amountHex = data.slice(74, 138);
  const amount = BigInt(`0x${amountHex}`);

  return { recipient, amount };
}
