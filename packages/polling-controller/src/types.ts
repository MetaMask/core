import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';

export type PollingTokenSetId = `${NetworkClientId}:${string}`;

export type IPollingController = {
  startPollingByNetworkClientId(
    networkClientId: NetworkClientId,
    options: Json,
  ): string;

  stopAllPolling(): void;

  stopPollingByPollingToken(pollingToken: string): void;

  onPollingCompleteByNetworkClientId(
    networkClientId: NetworkClientId,
    callback: (networkClientId: NetworkClientId) => void,
    options: Json,
  ): void;

  _executePoll(networkClientId: NetworkClientId, options: Json): Promise<void>;
  _startPollingByNetworkClientId(
    networkClientId: NetworkClientId,
    options: Json,
  ): void;
  _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void;
};

/**
 * TypeScript enforces this type for mixin constructors.
 *
 * Removing the `any` type results in the following error:
 * 'A mixin class must have a constructor with a single rest parameter of type 'any[]'.ts(2545)'
 *
 * A potential future refactor that removes the mixin pattern may be able to fix this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor = new (...args: any[]) => object;
