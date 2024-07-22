/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { BaseController, BaseControllerV1 } from '@metamask/base-controller';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
import type { PollingTokenSetId } from './types';
declare class Empty {
}
export declare const StaticIntervalPollingControllerOnly: (abstract new (...args: any[]) => {
    readonly "__#102148@#intervalIds": Record<PollingTokenSetId, NodeJS.Timeout>;
    "__#102148@#intervalLength": number | undefined;
    setIntervalLength(intervalLength: number): void;
    getIntervalLength(): number | undefined;
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
export declare const StaticIntervalPollingController: (abstract new (...args: any[]) => {
    readonly "__#102148@#intervalIds": Record<PollingTokenSetId, NodeJS.Timeout>;
    "__#102148@#intervalLength": number | undefined;
    setIntervalLength(intervalLength: number): void;
    getIntervalLength(): number | undefined;
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
export declare const StaticIntervalPollingControllerV1: (abstract new (...args: any[]) => {
    readonly "__#102148@#intervalIds": Record<PollingTokenSetId, NodeJS.Timeout>;
    "__#102148@#intervalLength": number | undefined;
    setIntervalLength(intervalLength: number): void;
    getIntervalLength(): number | undefined;
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
//# sourceMappingURL=StaticIntervalPollingController.d.ts.map