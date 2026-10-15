import { TransactionType } from '@metamask/transaction-controller';

import type { WalletPayFlow } from '../types.js';
import { perpsDepositFlow } from './perps/deposit.js';
import { perpsWithdrawFlow } from './perps/withdraw.js';

const WALLET_PAY_FLOWS: Record<string, WalletPayFlow> = {
  [TransactionType.perpsDeposit]: perpsDepositFlow,
  [TransactionType.perpsWithdraw]: perpsWithdrawFlow,
};

/**
 * Returns the flow for a transaction type, ignoring inherited object keys.
 *
 * @param transactionType - The requested transaction type.
 * @returns The flow, or `undefined` if the type isn't supported.
 */
export function getWalletPayFlow(
  transactionType: string,
): WalletPayFlow | undefined {
  return Object.hasOwn(WALLET_PAY_FLOWS, transactionType)
    ? WALLET_PAY_FLOWS[transactionType]
    : undefined;
}
