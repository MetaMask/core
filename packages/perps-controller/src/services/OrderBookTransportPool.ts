import { SubscriptionClient, WebSocketTransport } from '@nktkas/hyperliquid';

import { HYPERLIQUID_TRANSPORT_CONFIG } from '../constants/hyperLiquidConfig.js';

type BookClient = SubscriptionClient<{ transport: WebSocketTransport }>;

/** A socket and the one `l2Book` payload it carries for each coin. */
type Lane = {
  client: BookClient;
  /** Set for a socket this pool owns; the main client's socket is not ours. */
  owned?: { transport: WebSocketTransport; isTestnet: boolean };
  /** Payload per coin, with the readers that share it. */
  claims: Map<string, { payload: string; count: number }>;
};

/** One reader's place on a socket. */
export type OrderBookLease = {
  client: BookClient;
  /** Give the place back; calling it again does nothing. */
  release: () => void;
};

/**
 * Keeps `l2Book` subscriptions of one coin with different precision, or a
 * different cadence, on different sockets.
 *
 * Hyperliquid's `l2Book` frames name the coin only, and the SDK dispatches
 * them by coin, so two payloads for one coin on one socket reach both readers.
 * Each socket therefore carries at most one payload per coin. The main client
 * is used while it is free for the coin, so an app with one book per coin
 * opens no extra socket; a colliding payload gets a socket of its own, shared
 * with other coins and closed with its last reader.
 */
export class OrderBookTransportPool {
  readonly #lanes = new Set<Lane>();

  /**
   * Find or open a socket that can carry a book.
   *
   * @param params - What is subscribed.
   * @param params.mainClient - The client service's current client.
   * @param params.isTestnet - Network of a socket opened for this book.
   * @param params.coin - Coin of the book.
   * @param params.payload - Everything else the subscription sends.
   * @returns The client to subscribe with, and its release.
   */
  acquire(params: {
    mainClient: BookClient;
    isTestnet: boolean;
    coin: string;
    payload: string;
  }): OrderBookLease {
    const { mainClient, isTestnet, coin, payload } = params;
    const usable = [...this.#lanes].filter((lane) =>
      lane.owned
        ? lane.owned.isTestnet === isTestnet &&
          !lane.owned.transport.socket.terminationSignal.aborted
        : lane.client === mainClient,
    );
    const lane =
      usable.find((item) => item.claims.get(coin)?.payload === payload) ??
      (usable.some((item) => item.client === mainClient)
        ? undefined
        : this.#addLane({ client: mainClient, claims: new Map() })) ??
      usable.find((item) => !item.claims.has(coin)) ??
      this.#openLane(isTestnet);

    const claim = lane.claims.get(coin);
    if (claim) {
      claim.count += 1;
    } else {
      lane.claims.set(coin, { payload, count: 1 });
    }
    let released = false;
    return {
      client: lane.client,
      release: (): void => {
        if (!released) {
          released = true;
          this.#release(lane, coin);
        }
      },
    };
  }

  /** Close every socket this pool opened and forget every claim. */
  clear(): void {
    const lanes = [...this.#lanes];
    this.#lanes.clear();
    for (const lane of lanes) {
      lane.claims.clear();
      lane.owned?.transport.close();
    }
  }

  #addLane(lane: Lane): Lane {
    this.#lanes.add(lane);
    return lane;
  }

  #openLane(isTestnet: boolean): Lane {
    const transport = new WebSocketTransport({
      isTestnet,
      ...HYPERLIQUID_TRANSPORT_CONFIG,
      reconnect: HYPERLIQUID_TRANSPORT_CONFIG.reconnect,
    });
    return this.#addLane({
      client: new SubscriptionClient({ transport }),
      owned: { transport, isTestnet },
      claims: new Map(),
    });
  }

  #release(lane: Lane, coin: string): void {
    const claim = lane.claims.get(coin);
    if (claim) {
      claim.count -= 1;
      if (claim.count === 0) {
        lane.claims.delete(coin);
      }
    }
    if (lane.claims.size === 0 && this.#lanes.delete(lane)) {
      lane.owned?.transport.close();
    }
  }
}
