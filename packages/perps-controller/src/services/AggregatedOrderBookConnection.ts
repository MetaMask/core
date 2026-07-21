import { SubscriptionClient, WebSocketTransport } from '@nktkas/hyperliquid';
import type { ISubscription } from '@nktkas/hyperliquid';

import { HYPERLIQUID_TRANSPORT_CONFIG } from '../constants/hyperLiquidConfig';
import type { OrderBookData } from '../types';

/**
 * A single L2 book price level as delivered by Hyperliquid's `l2Book`
 * subscription. Declared locally to avoid coupling to the SDK's exported type
 * names (and to keep this the only file that references the SDK's shapes).
 */
type HyperliquidL2BookLevel = {
  /** Price. */
  px: string;
  /** Total size resting at this price. */
  sz: string;
  /** Number of individual orders. */
  n: number;
};

/** `l2Book` snapshot event (index 0 = bids, index 1 = asks). */
type HyperliquidL2BookEvent = {
  coin: string;
  time: number;
  levels: [bids: HyperliquidL2BookLevel[], asks: HyperliquidL2BookLevel[]];
  spread?: string;
};

/**
 * Health of the dedicated order-book socket, surfaced to the UI so the panel
 * can show a reconnect affordance.
 *
 * - `connecting`: socket opening or reconnecting after a transient drop.
 * - `connected`: subscription is live.
 * - `error`: dropped and automatic reconnection was exhausted; needs a manual reconnect.
 */
export type OrderBookConnectionStatus = 'connecting' | 'connected' | 'error';

export type SubscribeAggregatedOrderBookParams = {
  /** Market symbol (e.g. 'BTC'). */
  symbol: string;
  /** Number of levels per side to keep. */
  levels?: number;
  /**
   * Server-side aggregation significant figures. Required: omitting it would
   * request the raw, full-precision book instead of an aggregated one, which
   * contradicts this service's contract.
   */
  nSigFigs: 2 | 3 | 4 | 5;
  /** Mantissa refinement when `nSigFigs` is 5. */
  mantissa?: 2 | 5;
  /** Invoked with each processed snapshot. */
  callback: (data: OrderBookData) => void;
  /** Invoked when the underlying socket's health changes. */
  onStatusChange?: (status: OrderBookConnectionStatus) => void;
};

export type AggregatedOrderBookConnectionOptions = {
  /** Resolves the current network at subscribe time. */
  isTestnet: () => boolean;
};

// Fast mode streams 5 levels per side (slow mode streams 20). We run fast mode
// for lower-latency ladder updates, so the book never carries more than this.
const DEFAULT_LEVELS = 5;

/**
 * Transforms a raw Hyperliquid `l2Book` snapshot into the `OrderBookData` shape
 * the UI consumes. Mirrors the subscription service's internal
 * `processOrderBookData` so this dedicated connection is a drop-in replacement
 * for `subscribeToOrderBook` on the aggregated channel.
 *
 * @param data - Raw `l2Book` event.
 * @param levels - Number of levels per side to keep.
 * @returns Processed order-book snapshot.
 */
export function processAggregatedOrderBook(
  data: HyperliquidL2BookEvent,
  levels: number,
): OrderBookData {
  const bidsRaw = data?.levels?.[0] ?? [];
  const asksRaw = data?.levels?.[1] ?? [];

  let bidCumulativeSize = 0;
  let bidCumulativeNotional = 0;
  const bids = bidsRaw.slice(0, levels).map((level) => {
    const price = Number.parseFloat(level.px);
    const size = Number.parseFloat(level.sz);
    const notional = price * size;
    bidCumulativeSize += size;
    bidCumulativeNotional += notional;
    return {
      price: level.px,
      size: level.sz,
      total: bidCumulativeSize.toString(),
      notional: notional.toFixed(2),
      totalNotional: bidCumulativeNotional.toFixed(2),
    };
  });

  let askCumulativeSize = 0;
  let askCumulativeNotional = 0;
  const asks = asksRaw.slice(0, levels).map((level) => {
    const price = Number.parseFloat(level.px);
    const size = Number.parseFloat(level.sz);
    const notional = price * size;
    askCumulativeSize += size;
    askCumulativeNotional += notional;
    return {
      price: level.px,
      size: level.sz,
      total: askCumulativeSize.toString(),
      notional: notional.toFixed(2),
      totalNotional: askCumulativeNotional.toFixed(2),
    };
  });

  const bestBid = bids[0];
  const bestAsk = asks[0];
  const bidPrice = bestBid ? Number.parseFloat(bestBid.price) : 0;
  const askPrice = bestAsk ? Number.parseFloat(bestAsk.price) : 0;
  const spread = askPrice > 0 && bidPrice > 0 ? askPrice - bidPrice : 0;
  const midPrice = askPrice > 0 && bidPrice > 0 ? (askPrice + bidPrice) / 2 : 0;
  const spreadPercentage =
    midPrice > 0 ? ((spread / midPrice) * 100).toFixed(4) : '0';
  const maxTotal = Math.max(bidCumulativeSize, askCumulativeSize).toString();

  return {
    bids,
    asks,
    spread: spread.toFixed(5),
    spreadPercentage,
    midPrice: midPrice.toFixed(5),
    lastUpdated: Date.now(),
    maxTotal,
  };
}

/**
 * Owns a dedicated Hyperliquid WebSocket connection used solely for the
 * order-book panel's server-aggregated `l2Book` subscription.
 *
 * The main connection (managed by the subscription service) multiplexes every
 * subscription onto a single socket. The Hyperliquid SDK dispatches `l2Book`
 * events by `coin` only, so running the raw (full-precision) and the aggregated
 * (`nSigFigs`) subscriptions for the same coin on that shared socket
 * cross-contaminates them — the coarse ladder and the precise spread/slippage
 * clobber each other. Giving the aggregated subscription its own socket removes
 * the collision entirely: this socket only ever carries a single `l2Book`
 * stream, and the main socket is never touched by the panel's grouping.
 *
 * The socket is created lazily on the first subscription and torn down once the
 * last subscription is removed, so it exists only while an order-book panel is
 * open. Because network is a global setting, the transport is recreated if
 * `isTestnet` changes between (re)subscriptions.
 */
export class AggregatedOrderBookConnection {
  readonly #isTestnet: () => boolean;

  #transport: WebSocketTransport | null = null;

  #transportIsTestnet = false;

  #activeCount = 0;

  // Tracks the single `l2Book` payload the dedicated socket carries per asset,
  // keyed by symbol. The SDK dispatches `l2Book` events by `coin` only, so two
  // subscriptions for the same asset with different params (e.g. `nSigFigs`)
  // would cross-contaminate on this shared socket — exactly the collision this
  // connection exists to avoid. `count` refcounts the (identical) subscriptions
  // sharing a payload so the entry is dropped once the last one unsubscribes.
  readonly #payloads = new Map<string, { signature: string; count: number }>();

  // Set when the socket's auto-reconnection is exhausted (its
  // `terminationSignal` aborts). A terminated socket cannot recover, so the next
  // subscribe must build a fresh transport instead of reusing the dead one.
  #terminated = false;

  constructor({ isTestnet }: AggregatedOrderBookConnectionOptions) {
    this.#isTestnet = isTestnet;
  }

  /**
   * Opens an aggregated `l2Book` subscription on the dedicated socket.
   *
   * Mirrors the subscription service's synchronous-unsubscribe contract: the
   * returned function can be called before the async subscribe resolves and
   * will cancel the pending subscription.
   *
   * Only one `l2Book` payload per asset may be active at a time. Subscribing to
   * an asset that already has a live subscription with different params (e.g. a
   * different `nSigFigs` or `mantissa`) throws, because the shared socket
   * dispatches by `coin` and the conflicting streams would clobber each other.
   *
   * @param params - Subscription parameters.
   * @returns An unsubscribe function.
   * @throws If the asset already has an active subscription with different params.
   */
  subscribe(params: SubscribeAggregatedOrderBookParams): () => void {
    const levels = params.levels ?? DEFAULT_LEVELS;
    // The `l2Book` subscription params the socket carries. `levels` is
    // client-side only (it slices each snapshot), so it is deliberately excluded
    // from the params and their signature.
    const l2BookParams = {
      coin: params.symbol,
      nSigFigs: params.nSigFigs,
      mantissa: params.mantissa ?? null,
      fast: true as const,
    };
    const signature = JSON.stringify(l2BookParams);

    const transport = this.#ensureTransport(this.#isTestnet());

    // Reject a conflicting payload for an asset already on this socket. A
    // recreated transport (first use, network change, or terminate) starts with
    // an empty payload map, so this can only trip on the reuse path — the shared
    // socket that would actually suffer the collision.
    const existingPayload = this.#payloads.get(params.symbol);
    if (existingPayload && existingPayload.signature !== signature) {
      throw new Error(
        `AggregatedOrderBookConnection: "${params.symbol}" is already subscribed with different params; only one l2Book payload per asset is allowed on the dedicated socket.`,
      );
    }

    const { socket } = transport;

    let cancelled = false;
    let subscription: ISubscription | null = null;
    this.#activeCount += 1;
    if (existingPayload) {
      existingPayload.count += 1;
    } else {
      this.#payloads.set(params.symbol, { signature, count: 1 });
    }

    // Set once this subscription's socket terminates (reconnection exhausted).
    // The `error` state is terminal until teardown/resubscribe, so once set we
    // suppress any late `connected`/`connecting` — e.g. from a subscribe promise
    // that resolves *after* the socket died — which would otherwise flip the UI
    // back to a healthy state on a dead socket and hide the manual-reconnect
    // affordance.
    let terminated = false;
    const reportStatus = (status: OrderBookConnectionStatus): void => {
      // Suppress reports from a subscription that no longer drives the UI: it
      // was unsubscribed (`cancelled`), its transport was replaced by a network
      // flip or recreate (`transport !== this.#transport`, so its socket is
      // dead), or its socket permanently terminated and `error` is now sticky
      // until teardown (`terminated`).
      if (
        cancelled ||
        transport !== this.#transport ||
        (terminated && status !== 'error')
      ) {
        return;
      }
      params.onStatusChange?.(status);
    };

    // Reflect the socket's live health. Every drop dispatches a `close` event;
    // the reconnecting socket only exposes permanent termination through its
    // `terminationSignal` (an `AbortSignal`), which it aborts *before* the final
    // close. So an aborted signal on close — unless it was our own `close()`
    // (`TERMINATED_BY_USER`) — means automatic reconnection is exhausted: the
    // unrecoverable state the UI surfaces with a manual reconnect button. A
    // still-live signal means a transient drop the socket will auto-reconnect.
    const handleOpen = (): void => reportStatus('connected');
    const handleClose = (): void => {
      const { terminationSignal } = socket;
      const terminatedByUser =
        (terminationSignal.reason as { code?: string } | undefined)?.code ===
        'TERMINATED_BY_USER';
      if (terminationSignal.aborted && !terminatedByUser) {
        this.#terminated = true;
        terminated = true;
        reportStatus('error');
        return;
      }
      reportStatus('connecting');
    };
    socket.addEventListener('open', handleOpen);
    socket.addEventListener('close', handleClose);

    const removeSocketListeners = (): void => {
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('close', handleClose);
    };

    // Releases this subscription's refcount and tears down the socket once no
    // subscriptions remain. Idempotent via `cancelled`, so it's safe whether it
    // runs from the returned unsubscribe or from a failed subscribe.
    const teardown = (): void => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      removeSocketListeners();
      if (subscription) {
        subscription.unsubscribe().catch(() => undefined);
        subscription = null;
      }
      // Only touch the refcount/current socket if this subscription still
      // belongs to the active transport. If the transport was recreated (network
      // change or terminate), this subscription's socket is already dead and
      // `#activeCount` now tracks only the new transport's subscriptions — so an
      // older unsubscribe must not decrement it and tear down the live socket.
      if (transport === this.#transport) {
        this.#activeCount = Math.max(0, this.#activeCount - 1);
        const entry = this.#payloads.get(params.symbol);
        if (entry) {
          entry.count -= 1;
          if (entry.count <= 0) {
            this.#payloads.delete(params.symbol);
          }
        }
        if (this.#activeCount === 0) {
          this.#closeTransport();
        }
      }
    };

    // Surfaces a subscription failure the same way regardless of when it
    // happens: report `error` (before teardown flips `cancelled`, which gates
    // status updates) then release the refcount so the dead subscription doesn't
    // keep the dedicated socket open. Used for both the initial subscribe
    // rejection (`.catch`) and post-confirmation failures the SDK reports only
    // through `onError` — e.g. the server rejecting the re-subscription after a
    // reconnect, which removes the listener and stops all further events (a
    // frozen order book that would otherwise still read as `connected`).
    // Idempotent via `teardown`'s `cancelled` guard.
    const handleSubscriptionError = (): void => {
      reportStatus('error');
      teardown();
    };

    reportStatus('connecting');

    // Subscribe through the typed `l2Book` client so the params are validated
    // before they reach the wire (`fast: true` requests fast mode — 5 levels at
    // ~0.5s). The listener receives the decoded snapshot directly.
    new SubscriptionClient({ transport })
      .l2Book(
        l2BookParams,
        (data: HyperliquidL2BookEvent) => {
          if (cancelled || data?.coin !== params.symbol || !data?.levels) {
            return;
          }
          params.callback(processAggregatedOrderBook(data, levels));
        },
        // `onError` fires at most once for an *already confirmed* subscription
        // that later fails (rejected re-subscription after reconnect, permanent
        // termination, or a drop while re-subscription is disabled). The SDK
        // removes the listener and emits nothing further, so treat it exactly
        // like an initial failure.
        { onError: handleSubscriptionError },
      )
      .then(async (sub) => {
        // Stale if this subscription was unsubscribed (`cancelled`) or its
        // transport was replaced (network flip / recreate) before the subscribe
        // settled — either way the captured socket is dead, so clean up the SDK
        // subscription instead of storing it or announcing `connected`.
        if (cancelled || transport !== this.#transport) {
          try {
            await sub.unsubscribe();
          } catch {
            // Ignore cleanup errors on an already-cancelled/stale subscription.
          }
          return undefined;
        }
        subscription = sub;
        reportStatus('connected');
        return undefined;
      })
      .catch(handleSubscriptionError);

    return teardown;
  }

  /** Closes the dedicated socket and drops all subscriptions. */
  close(): void {
    this.#closeTransport();
  }

  #ensureTransport(isTestnet: boolean): WebSocketTransport {
    if (
      this.#transport &&
      this.#transportIsTestnet === isTestnet &&
      !this.#terminated
    ) {
      return this.#transport;
    }
    // First use, the network changed, or the previous socket was terminated —
    // (re)create the dedicated transport. Reuse the package's transport config
    // so this socket shares the finite five-attempt reconnection policy; without
    // it the SDK defaults `maxRetries` to Infinity and a sustained outage would
    // never exhaust reconnection to reach the `error`/manual-reconnect state.
    this.#closeTransport();
    const transport = new WebSocketTransport({
      isTestnet,
      ...HYPERLIQUID_TRANSPORT_CONFIG,
      reconnect: HYPERLIQUID_TRANSPORT_CONFIG.reconnect,
    });
    this.#transport = transport;
    this.#transportIsTestnet = isTestnet;
    return transport;
  }

  #closeTransport(): void {
    const transport = this.#transport;
    this.#transport = null;
    this.#activeCount = 0;
    this.#payloads.clear();
    this.#terminated = false;
    if (transport) {
      transport.close();
    }
  }
}
