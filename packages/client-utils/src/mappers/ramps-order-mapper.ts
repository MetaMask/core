import type { CaipChainId } from '@metamask/utils';

import type {
  ActivityItem,
  Fee,
  FiatAmount,
  RampOrderPaymentDetail,
  Status,
  TokenAmount,
} from '../types.js';
import { formatChainIdToCaip } from './helpers/caip.js';

type RampsOrderStatusLike =
  | 'UNKNOWN'
  | 'PRECREATED'
  | 'CREATED'
  | 'PENDING'
  | 'FAILED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ID_EXPIRED';

/**
 * The subset of `RampsOrder` (from `@metamask/ramps-controller`) that this
 * mapper depends on. Redeclared locally rather than imported to keep
 * `client-utils` free of a dependency on `ramps-controller`.
 */
export type RampsOrderLike = {
  provider?: { id?: string; name?: string };
  cryptoAmount: string | number;
  fiatAmount: number;
  cryptoCurrency?: { assetId?: string; symbol: string; decimals?: number };
  fiatCurrency?: { symbol: string };
  providerOrderId: string;
  providerOrderLink: string;
  createdAt: number;
  totalFeesFiat: number;
  txHash: string;
  walletAddress: string;
  status: RampsOrderStatusLike;
  network: { chainId: string };
  statusDescription?: string;
  orderType: string;
  paymentDetails?: RampOrderPaymentDetail[];
};

function mapStatus(status: RampsOrderStatusLike): Status {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
    case 'ID_EXPIRED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

/**
 * Maps a ramps order into the shared activity item shape.
 *
 * @param order - The ramps order to map.
 * @returns The normalized activity item.
 */
export function mapRampsOrder(order: RampsOrderLike): ActivityItem {
  // The V2 API returns `orderType` uppercased (e.g. `'BUY'`); normalize since
  // some call sites (e.g. locally-created stub orders) use lowercase.
  const isBuy = order.orderType.toUpperCase() === 'BUY';
  const direction: TokenAmount['direction'] = isBuy ? 'in' : 'out';

  const token: TokenAmount | undefined = order.cryptoCurrency
    ? {
        amount: String(order.cryptoAmount),
        symbol: order.cryptoCurrency.symbol,
        assetId: order.cryptoCurrency.assetId,
        decimals: order.cryptoCurrency.decimals,
        direction,
      }
    : undefined;

  const fiat: FiatAmount = {
    amount: String(order.fiatAmount),
    currency: order.fiatCurrency?.symbol,
  };

  const fees: Fee[] = [
    {
      type: 'total',
      amount: String(order.totalFeesFiat),
      symbol: order.fiatCurrency?.symbol,
    },
  ];

  // `network.chainId` may already be CAIP-2 (non-EVM orders) or a bare
  // numeric/hex reference (today's only observed EVM format) — normalize
  // without assuming a namespace.
  const chainId = formatChainIdToCaip(order.network.chainId) as CaipChainId;

  return {
    type: isBuy ? 'rampBuy' : 'rampSell',
    chainId,
    status: mapStatus(order.status),
    timestamp: order.createdAt,
    hash: order.txHash || undefined,
    id: order.providerOrderId,
    data: {
      from: order.walletAddress,
      fiat,
      token,
      fees,
      provider: {
        id: order.provider?.id,
        name: order.provider?.name,
        orderLink: order.providerOrderLink,
      },
      statusDescription: order.statusDescription,
      paymentDetails: order.paymentDetails,
    },
  };
}
