import { toHex } from '@metamask/controller-utils';
import type { NetworkController } from '@metamask/network-controller';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import type { CaipChainId, Hex } from '@metamask/utils';
import { parseCaipChainId } from '@metamask/utils';
import type EventEmitter from 'events';

import type { ExternalScopeString } from '../scope';

export type SubscriptionManager = {
  events: EventEmitter;
  destroy?: () => void;
};

type SubscriptionNotificationEvent = {
  jsonrpc: '2.0';
  method: 'eth_subscription';
  params: {
    subscription: Hex;
    result: unknown;
  };
};

type SubscriptionKey = {
  scope: ExternalScopeString;
  origin: string;
  tabId?: number;
};
type SubscriptionEntry = SubscriptionKey & {
  subscriptionManager: SubscriptionManager;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const createSubscriptionManager = require('@metamask/eth-json-rpc-filters/subscriptionManager');

type MultichainSubscriptionManagerOptions = {
  findNetworkClientIdByChainId: NetworkController['findNetworkClientIdByChainId'];
  getNetworkClientById: NetworkController['getNetworkClientById'];
};

export default class MultichainSubscriptionManager extends SafeEventEmitter {
  #findNetworkClientIdByChainId: NetworkController['findNetworkClientIdByChainId'];

  #getNetworkClientById: NetworkController['getNetworkClientById'];

  #subscriptions: SubscriptionEntry[] = [];

  constructor(options: MultichainSubscriptionManagerOptions) {
    super();
    this.#findNetworkClientIdByChainId = options.findNetworkClientIdByChainId;
    this.#getNetworkClientById = options.getNetworkClientById;
  }

  onNotification(
    { scope, origin, tabId }: SubscriptionKey,
    { method, params }: SubscriptionNotificationEvent,
  ) {
    this.emit('notification', origin, tabId, {
      method: 'wallet_notify',
      params: {
        scope,
        notification: { method, params },
      },
    });
  }

  #getSubscriptionEntry({
    scope,
    origin,
    tabId,
  }: SubscriptionKey): SubscriptionEntry | undefined {
    return this.#subscriptions.find((subscriptionEntry) => {
      return (
        subscriptionEntry.scope === scope &&
        subscriptionEntry.origin === origin &&
        subscriptionEntry.tabId === tabId
      );
    });
  }

  #removeSubscriptionEntry({ scope, origin, tabId }: SubscriptionKey) {
    this.#subscriptions = this.#subscriptions.filter((subscriptionEntry) => {
      return (
        subscriptionEntry.scope !== scope ||
        subscriptionEntry.origin !== origin ||
        subscriptionEntry.tabId !== tabId
      );
    });
  }

  subscribe(subscriptionKey: SubscriptionKey) {
    const subscriptionEntry = this.#getSubscriptionEntry(subscriptionKey);
    if (subscriptionEntry) {
      return subscriptionEntry.subscriptionManager;
    }

    const networkClientId = this.#findNetworkClientIdByChainId(
      toHex(parseCaipChainId(subscriptionKey.scope as CaipChainId).reference),
    );
    const networkClient = this.#getNetworkClientById(networkClientId);
    const subscriptionManager = createSubscriptionManager({
      blockTracker: networkClient.blockTracker,
      provider: networkClient.provider,
    });

    subscriptionManager.events.on(
      'notification',
      (message: SubscriptionNotificationEvent) => {
        this.onNotification(subscriptionKey, message);
      },
    );

    this.#subscriptions.push({
      ...subscriptionKey,
      subscriptionManager,
    });

    return subscriptionManager;
  }

  #unsubscribe(subscriptionKey: SubscriptionKey) {
    const existingSubscriptionEntry =
      this.#getSubscriptionEntry(subscriptionKey);
    if (!existingSubscriptionEntry) {
      return;
    }

    existingSubscriptionEntry.subscriptionManager.destroy?.();

    this.#removeSubscriptionEntry(subscriptionKey);
  }

  unsubscribeByScope(scope: ExternalScopeString) {
    this.#subscriptions.forEach((subscriptionEntry) => {
      if (subscriptionEntry.scope === scope) {
        this.#unsubscribe(subscriptionEntry);
      }
    });
  }

  unsubscribeByScopeAndOrigin(scope: ExternalScopeString, origin: string) {
    this.#subscriptions.forEach((subscriptionEntry) => {
      if (
        subscriptionEntry.scope === scope &&
        subscriptionEntry.origin === origin
      ) {
        this.#unsubscribe(subscriptionEntry);
      }
    });
  }

  unsubscribeByOriginAndTabId(origin: string, tabId?: number) {
    this.#subscriptions.forEach((subscriptionEntry) => {
      if (
        subscriptionEntry.origin === origin &&
        subscriptionEntry.tabId === tabId
      ) {
        this.#unsubscribe(subscriptionEntry);
      }
    });
  }
}
