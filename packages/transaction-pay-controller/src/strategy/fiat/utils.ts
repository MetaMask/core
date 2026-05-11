import type { RampsOrder } from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger';
import type { TransactionPayControllerMessenger } from '../../types';
import { getFiatAssetPerTransactionType } from '../../utils/feature-flags';
import { getTokenInfo } from '../../utils/token';
import { getTransferredAmountFromTxHash } from '../../utils/transaction-receipt';
import type { TransactionPayFiatAsset } from './constants';
import { FIAT_ASSET_ID_BY_TX_TYPE } from './constants';

const log = createModuleLogger(projectLogger, 'fiat-utils');

export function deriveFiatAssetForFiatPayment(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionPayFiatAsset {
  const txType = resolveTransactionType(transaction);

  return getFiatAssetPerTransactionType(messenger, txType);
}

function resolveTransactionType(
  transaction: TransactionMeta,
): TransactionType | undefined {
  if (transaction.type !== TransactionType.batch) {
    return transaction.type;
  }

  return transaction.nestedTransactions?.find(
    (tx) => tx.type && FIAT_ASSET_ID_BY_TX_TYPE[tx.type] !== undefined,
  )?.type;
}

/**
 * Resolves the raw source amount for a completed fiat order.
 *
 * Attempts to read the actual transferred amount from the on-chain transaction
 * identified by `order.txHash`. If the on-chain read fails or returns
 * no amount, falls back to computing the amount from `order.cryptoAmount`.
 *
 * @param options - The resolution options.
 * @param options.messenger - Controller messenger for network access.
 * @param options.order - The completed on-ramp order.
 * @param options.fiatAsset - The fiat asset describing the expected token.
 * @returns The raw (atomic) source amount as a decimal string.
 */
export async function resolveSourceAmountRaw({
  messenger,
  order,
  fiatAsset,
}: {
  messenger: TransactionPayControllerMessenger;
  order: RampsOrder;
  fiatAsset: TransactionPayFiatAsset;
}): Promise<string> {
  if (order.txHash) {
    try {
      const onChainAmount = await getTransferredAmountFromTxHash({
        messenger,
        txHash: order.txHash,
        chainId: fiatAsset.chainId,
        tokenAddress: fiatAsset.address,
      });

      if (onChainAmount) {
        log('Resolved source amount from on-chain transaction', {
          txHash: order.txHash,
          onChainAmount,
        });
        return onChainAmount;
      }
    } catch (error) {
      log(
        'Failed to read on-chain amount, falling back to order.cryptoAmount',
        { txHash: order.txHash, error },
      );
    }
  }

  const tokenInfo = getTokenInfo(
    messenger,
    fiatAsset.address,
    fiatAsset.chainId,
  );

  if (!tokenInfo) {
    throw new Error(
      `Unable to resolve token info for fiat asset ${fiatAsset.address} on chain ${fiatAsset.chainId}`,
    );
  }

  return getRawSourceAmountFromOrderCryptoAmount({
    cryptoAmount: order.cryptoAmount,
    decimals: tokenInfo.decimals,
  });
}

/**
 * Converts the order's human-readable crypto amount to a raw token amount.
 *
 * @param options - The conversion options.
 * @param options.cryptoAmount - Human-readable crypto amount from the completed order.
 * @param options.decimals - Token decimals for the fiat asset.
 * @returns The raw token amount as a string.
 */
export function getRawSourceAmountFromOrderCryptoAmount({
  cryptoAmount,
  decimals,
}: {
  cryptoAmount: RampsOrder['cryptoAmount'];
  decimals: number;
}): string {
  const normalizedAmount = new BigNumber(String(cryptoAmount));

  if (!normalizedAmount.isFinite() || normalizedAmount.lte(0)) {
    throw new Error(
      `Invalid fiat order crypto amount: ${String(cryptoAmount)}`,
    );
  }

  const rawAmount = normalizedAmount
    .shiftedBy(decimals)
    .decimalPlaces(0, BigNumber.ROUND_DOWN)
    .toFixed(0);

  if (!new BigNumber(rawAmount).gt(0)) {
    throw new Error('Computed fiat order source amount is not positive');
  }

  return rawAmount;
}
