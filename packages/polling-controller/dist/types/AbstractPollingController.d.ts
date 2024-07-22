import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import type { Constructor, PollingTokenSetId } from './types';
export declare const getKey: (networkClientId: NetworkClientId, options: Json) => PollingTokenSetId;
/**
 * AbstractPollingControllerBaseMixin
 *
 * @param Base - The base class to mix onto.
 * @returns The composed class.
 */
export declare function AbstractPollingControllerBaseMixin<TBase extends Constructor>(Base: TBase): (abstract new (...args: any[]) => {
    readonly "__#102146@#pollingTokenSets": Map<PollingTokenSetId, Set<string>>;
    "__#102146@#callbacks": Map<`${string}:${string}`, Set<(PollingTokenSetId: `${string}:${string}`) => void>>;
    _executePoll(networkClientId: NetworkClientId, options: Json): Promise<void>;
    _startPollingByNetworkClientId(networkClientId: NetworkClientId, options: Json): void;
    _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void;
    startPollingByNetworkClientId(networkClientId: NetworkClientId, options?: Json): string;
    stopAllPolling(): void;
    stopPollingByPollingToken(pollingToken: string): void;
    onPollingCompleteByNetworkClientId(networkClientId: NetworkClientId, callback: (networkClientId: NetworkClientId) => void, options?: Json): void;
}) & TBase;
//# sourceMappingURL=AbstractPollingController.d.ts.map