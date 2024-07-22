import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type { NetworkClientId, NetworkClient } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import type { PollingTokenSetId } from './types';
declare class Empty {
}
export declare const BlockTrackerPollingControllerOnly: (abstract new (...args: any[]) => {
    "__#102147@#activeListeners": Record<string, (options: Json) => Promise<void>>;
    _getNetworkClientById(networkClientId: NetworkClientId): NetworkClient | undefined;
    _startPollingByNetworkClientId(networkClientId: NetworkClientId, options: Json): void;
    _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void;
    readonly "__#102146@#pollingTokenSets": Map<`${string}:${string}`, Set<string>>;
    "__#102146@#callbacks": Map<`${string}:${string}`, Set<(PollingTokenSetId: `${string}:${string}`) => void>>;
    _executePoll(networkClientId: string, options: Json): Promise<void>;
    startPollingByNetworkClientId(networkClientId: string, options?: Json): string;
    stopAllPolling(): void;
    stopPollingByPollingToken(pollingToken: string): void;
    onPollingCompleteByNetworkClientId(networkClientId: string, callback: (networkClientId: string) => void, options?: Json): void;
}) & typeof Empty;
export declare const BlockTrackerPollingController: (abstract new (...args: any[]) => {
    "__#102147@#activeListeners": Record<string, (options: Json) => Promise<void>>;
    _getNetworkClientById(networkClientId: NetworkClientId): NetworkClient | undefined;
    _startPollingByNetworkClientId(networkClientId: NetworkClientId, options: Json): void;
    _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void;
    readonly "__#102146@#pollingTokenSets": Map<`${string}:${string}`, Set<string>>;
    "__#102146@#callbacks": Map<`${string}:${string}`, Set<(PollingTokenSetId: `${string}:${string}`) => void>>;
    _executePoll(networkClientId: string, options: Json): Promise<void>;
    startPollingByNetworkClientId(networkClientId: string, options?: Json): string;
    stopAllPolling(): void;
    stopPollingByPollingToken(pollingToken: string): void;
    onPollingCompleteByNetworkClientId(networkClientId: string, callback: (networkClientId: string) => void, options?: Json): void;
}) & typeof BaseController;
export declare const BlockTrackerPollingControllerV1: (abstract new (...args: any[]) => {
    "__#102147@#activeListeners": Record<string, (options: Json) => Promise<void>>;
    _getNetworkClientById(networkClientId: NetworkClientId): NetworkClient | undefined;
    _startPollingByNetworkClientId(networkClientId: NetworkClientId, options: Json): void;
    _stopPollingByPollingTokenSetId(key: PollingTokenSetId): void;
    readonly "__#102146@#pollingTokenSets": Map<`${string}:${string}`, Set<string>>;
    "__#102146@#callbacks": Map<`${string}:${string}`, Set<(PollingTokenSetId: `${string}:${string}`) => void>>;
    _executePoll(networkClientId: string, options: Json): Promise<void>;
    startPollingByNetworkClientId(networkClientId: string, options?: Json): string;
    stopAllPolling(): void;
    stopPollingByPollingToken(pollingToken: string): void;
    onPollingCompleteByNetworkClientId(networkClientId: string, callback: (networkClientId: string) => void, options?: Json): void;
}) & typeof BaseControllerV1;
export {};
//# sourceMappingURL=BlockTrackerPollingController.d.ts.map