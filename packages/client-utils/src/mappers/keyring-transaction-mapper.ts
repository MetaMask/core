import type { Transaction as KeyringTransaction } from '@metamask/keyring-api';
import {
  TransactionStatus,
  TransactionType as KeyringTransactionType,
} from '@metamask/keyring-api';

import type { Fee, ActivityItem, Status, TokenAmount } from '../types';

type Movement = KeyringTransaction['from'][number];
type KeyringFee = KeyringTransaction['fees'][number];
type FungibleAsset = Extract<
  NonNullable<Movement['asset']>,
  { fungible: true }
>;

/**
 * Custom labels for non-EVM transactions.
 *
 * The labels are used to map the transaction type to the title in the activity list and dialog.
 * The labels are defined in the `transaction.details.typeLabel` property.
 * For details: {@link https://github.com/MetaMask/metamask-extension/pull/38040}
 */
export enum CustomTransactionTypeLabel {
  // Token requires one off approve to receive
  TrustlineApprove = 'trustline-approve',
  // Token requires revoke the approve to stop receiving
  TrustlineDisapprove = 'trustline-disapprove',
}

function hasTrustlineTypeLabel(
  details: KeyringTransaction['details'],
): boolean {
  // A flag to indicate if the transaction is a trustline type.
  return [
    String(CustomTransactionTypeLabel.TrustlineApprove),
    String(CustomTransactionTypeLabel.TrustlineDisapprove),
  ].includes(details?.typeLabel ?? '');
}

function mapStatus(status: KeyringTransaction['status']): Status {
  switch (status) {
    case TransactionStatus.Confirmed:
      return 'success';
    case TransactionStatus.Failed:
      return 'failed';
    case TransactionStatus.Submitted:
    case TransactionStatus.Unconfirmed:
    default:
      return 'pending';
  }
}

function getAddress(movements: Movement[]): string {
  return movements[0]?.address ?? '';
}

function hasFungibleAsset(
  movement: Movement,
): movement is Movement & { asset: FungibleAsset } {
  return movement.asset?.fungible === true;
}

function getToken(
  movements: Movement[],
  direction: TokenAmount['direction'],
): TokenAmount | undefined {
  const movement = movements.find(hasFungibleAsset);

  if (!movement) {
    return undefined;
  }

  return {
    amount: movement.asset.amount,
    symbol: movement.asset.unit,
    assetId: movement.asset.type,
    direction,
  };
}

function getFee(fee: KeyringFee): Fee | undefined {
  const { asset } = fee;

  if (!asset.fungible) {
    return undefined;
  }

  return {
    type: fee.type,
    amount: asset.amount,
    symbol: asset.unit,
    assetId: asset.type,
  };
}

function getFees(transaction: KeyringTransaction): Fee[] {
  return transaction.fees.flatMap((fee) => {
    const mappedFee = getFee(fee);

    return mappedFee ? [mappedFee] : [];
  });
}

const approveAmountMaxIntegerDigits = 15;

/**
 * Maps a keyring transaction into the shared activity item shape.
 *
 * @param options - The mapping options.
 * @param options.transaction - The keyring transaction to map.
 * @param options.subjectAddress - Account address used for send/receive attribution.
 * @returns The normalized activity item.
 */
export function mapKeyringTransaction({
  transaction,
  subjectAddress,
}: {
  transaction: KeyringTransaction;
  subjectAddress?: string;
}): ActivityItem {
  const { type, id } = transaction;
  const status = mapStatus(transaction.status);
  const timestamp = transaction.timestamp ? transaction.timestamp * 1000 : 0;
  const chainId = transaction.chain;

  const from =
    type === KeyringTransactionType.Send && subjectAddress
      ? subjectAddress
      : getAddress(transaction.from);

  const to =
    type === KeyringTransactionType.Receive && subjectAddress
      ? subjectAddress
      : getAddress(transaction.to);

  const fees = getFees(transaction);
  const common = { chainId, status, timestamp, hash: id };

  switch (type) {
    case KeyringTransactionType.Send: {
      const fromToken = getToken(transaction.from, 'out');
      const token =
        !fromToken && chainId.startsWith('bip122:')
          ? getToken(transaction.to, 'out')
          : fromToken;

      return {
        type: 'send',
        ...common,
        data: {
          from,
          to,
          token,
          fees,
        },
      };
    }

    case KeyringTransactionType.Receive:
      return {
        type: 'receive',
        ...common,
        data: {
          from,
          to,
          token: getToken(transaction.to, 'in'),
          fees,
        },
      };

    case KeyringTransactionType.Swap:
      return {
        type: 'swap',
        ...common,
        data: {
          from,
          destinationToken: getToken(transaction.to, 'in'),
          sourceToken: getToken(transaction.from, 'out'),
          fees,
        },
      };

    case KeyringTransactionType.TokenApprove: {
      const rawToken = getToken(transaction.from, 'out');

      if (hasTrustlineTypeLabel(transaction.details)) {
        return {
          type: 'assetActivation',
          ...common,
          data: {
            from,
            token: rawToken ? { ...rawToken, amount: undefined } : rawToken,
            fees,
          },
        };
      }

      const isUnlimited =
        rawToken?.amount !== undefined &&
        rawToken.amount.split('.')[0].length > approveAmountMaxIntegerDigits;

      return {
        type: 'approveSpendingCap',
        ...common,
        data: {
          from,
          token: rawToken
            ? { ...rawToken, amount: isUnlimited ? undefined : rawToken.amount }
            : rawToken,
          fees,
        },
      };
    }

    case KeyringTransactionType.TokenDisapprove: {
      if (!hasTrustlineTypeLabel(transaction.details)) {
        return {
          type: 'contractInteraction',
          ...common,
          data: {
            from,
            to,
            fees,
          },
        };
      }

      const rawToken = getToken(transaction.from, 'out');

      return {
        type: 'assetDeactivation',
        ...common,
        data: {
          from,
          token: rawToken ? { ...rawToken, amount: undefined } : rawToken,
          fees,
        },
      };
    }

    default:
      return {
        type: 'contractInteraction',
        ...common,
        data: {
          from,
          to,
          fees,
        },
      };
  }
}
