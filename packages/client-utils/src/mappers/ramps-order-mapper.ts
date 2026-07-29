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
  id?: string;
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
  excludeFromPurchases?: boolean;
  paymentDetails?: RampOrderPaymentDetail[];
};

function mapStatus(status: RampsOrderStatusLike): Status {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

// `UNKNOWN`, `ID_EXPIRED`, and `PRECREATED` represent background checkout
// attempts (e.g. precreated orders that never matched a real order, or whose
// id expired before the provider assigned one) that the user never knowingly
// initiated as a distinct order and shouldn't see in their history.
const HIDDEN_STATUSES = new Set<RampsOrderStatusLike>([
  'UNKNOWN',
  'ID_EXPIRED',
  'PRECREATED',
]);

/**
 * Maps a ramps order into the shared activity item shape.
 *
 * @param order - The ramps order to map.
 * @returns The normalized activity item, or `null` if the order's status
 * should not be surfaced in the activity list.
 */
export function mapRampsOrder(order: RampsOrderLike): ActivityItem | null {
  if (HIDDEN_STATUSES.has(order.status) || order.excludeFromPurchases) {
    return null;
  }

  // The V2 API returns `orderType` uppercased (e.g. `'BUY'`); normalize since
  // some call sites (e.g. locally-created stub orders) use lowercase. Transak
  // deposits (`'DEPOSIT'`) are a buy variant, not a sell.
  const normalizedOrderType = order.orderType.toUpperCase();
  const isBuy =
    normalizedOrderType === 'BUY' || normalizedOrderType === 'DEPOSIT';
  const direction: TokenAmount['direction'] = isBuy ? 'in' : 'out';

  // `cryptoAmount`/`fiatAmount` are already human-formatted by the API, unlike
  // `TokenAmount.decimals` elsewhere in this package, which signals a raw
  // on-chain amount that still needs scaling. Omit `decimals` so clients don't
  // wrongly re-scale an already-human amount.
  const token: TokenAmount | undefined = order.cryptoCurrency
    ? {
        amount: String(order.cryptoAmount),
        symbol: order.cryptoCurrency.symbol,
        assetId: order.cryptoCurrency.assetId,
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

  // `network.chainId` may already be CAIP-2 (non-EVM orders), a bare
  // numeric/hex reference (today's only observed EVM format), or empty (a
  // precreated stub order awaiting provider assignment) — normalize without
  // assuming a namespace.
  const chainId = formatChainIdToCaip(order.network.chainId);

  return {
    type: isBuy ? 'rampBuy' : 'rampSell',
    chainId,
    status: mapStatus(order.status),
    timestamp: order.createdAt,
    hash: order.txHash || undefined,
    id: order.id ?? order.providerOrderId,
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
