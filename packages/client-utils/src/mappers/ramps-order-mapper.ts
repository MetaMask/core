import type { CaipChainId } from '@metamask/utils';
import { isCaipChainId } from '@metamask/utils';

import type {
  ActivityItem,
  Fee,
  FiatAmount,
  RampOrderPaymentDetail,
  Status,
  TokenAmount,
} from '../types.js';
import { formatChainIdToCaip } from './helpers/caip.js';

/**
 * Extracts the CAIP-2 chain id from a CAIP-19 asset id
 * (`eip155:1/slip44:60` → `eip155:1`).
 *
 * @param assetId - CAIP-19 asset id.
 * @returns The CAIP-2 chain id, or `undefined` when it can't be extracted.
 */
function caipChainIdFromAssetId(
  assetId: string | undefined,
): CaipChainId | undefined {
  if (!assetId) {
    return undefined;
  }
  const slash = assetId.indexOf('/');
  const chainPart = slash === -1 ? assetId : assetId.slice(0, slash);
  return isCaipChainId(chainPart) ? chainPart : undefined;
}

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
  cryptoCurrency?: {
    assetId?: string;
    chainId?: string;
    symbol: string;
    decimals?: number;
  };
  fiatCurrency?: { symbol: string };
  providerOrderId: string;
  providerOrderLink: string;
  createdAt: number;
  totalFeesFiat: number;
  txHash: string;
  walletAddress: string;
  status: RampsOrderStatusLike;
  // Declared as an object, but generic providers (e.g. Coinbase) actually send
  // a free-form network name string at runtime — see `resolveRampsOrderChainId`.
  network: { chainId: string } | string;
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
 * Resolves the CAIP-2 chain id for a ramps order.
 *
 * Tries each source in order and falls through when a value is present but
 * unparseable (e.g. Coinbase's network name string `"ethereum"`). Generic
 * providers often return a free-form network name while still attaching a
 * real CAIP `cryptoCurrency.chainId` / `assetId`.
 *
 * Precedence: `network.chainId` (object) → `network` (string) →
 * `cryptoCurrency.chainId` → chain segment of `cryptoCurrency.assetId`.
 *
 * @param order - The ramps order to resolve a chain id for.
 * @returns The CAIP-2 chain id, or `undefined` when it can't be resolved.
 */
function resolveRampsOrderChainId(
  order: RampsOrderLike,
): ReturnType<typeof formatChainIdToCaip> {
  const { network } = order;
  const networkChainId =
    typeof network === 'string' ? network : network.chainId;

  return (
    formatChainIdToCaip(networkChainId) ??
    (order.cryptoCurrency?.chainId
      ? formatChainIdToCaip(order.cryptoCurrency.chainId)
      : undefined) ??
    caipChainIdFromAssetId(order.cryptoCurrency?.assetId)
  );
}

/**
 * Returns true when `txHash` looks like a real on-chain hash. Provider
 * placeholders such as `""`, `"0x"`, and all-zero hashes must not be used as
 * Activity row keys — they collide across orders whose hash isn't set yet.
 *
 * @param txHash - The order's raw `txHash` value.
 * @returns `true` when the hash looks like a real on-chain hash.
 */
function isPlausibleRampTxHash(txHash: string): boolean {
  const normalized = txHash.trim().toLowerCase();
  return normalized !== '' && !/^0x0*$/u.test(normalized);
}

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

  const chainId = resolveRampsOrderChainId(order);

  return {
    type: isBuy ? 'rampBuy' : 'rampSell',
    chainId,
    status: mapStatus(order.status),
    timestamp: order.createdAt,
    hash: isPlausibleRampTxHash(order.txHash) ? order.txHash : undefined,
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
      id: order.id ?? order.providerOrderId,
    },
  };
}
