import type { Compute } from '../types/type-utils';
export declare enum TRIGGER_TYPES {
    FEATURES_ANNOUNCEMENT = "features_announcement",
    METAMASK_SWAP_COMPLETED = "metamask_swap_completed",
    ERC20_SENT = "erc20_sent",
    ERC20_RECEIVED = "erc20_received",
    ETH_SENT = "eth_sent",
    ETH_RECEIVED = "eth_received",
    ROCKETPOOL_STAKE_COMPLETED = "rocketpool_stake_completed",
    ROCKETPOOL_UNSTAKE_COMPLETED = "rocketpool_unstake_completed",
    LIDO_STAKE_COMPLETED = "lido_stake_completed",
    LIDO_WITHDRAWAL_REQUESTED = "lido_withdrawal_requested",
    LIDO_WITHDRAWAL_COMPLETED = "lido_withdrawal_completed",
    LIDO_STAKE_READY_TO_BE_WITHDRAWN = "lido_stake_ready_to_be_withdrawn",
    ERC721_SENT = "erc721_sent",
    ERC721_RECEIVED = "erc721_received",
    ERC1155_SENT = "erc1155_sent",
    ERC1155_RECEIVED = "erc1155_received"
}
export declare const TRIGGER_TYPES_WALLET_SET: Set<string>;
export declare enum TRIGGER_TYPES_GROUPS {
    RECEIVED = "received",
    SENT = "sent",
    DEFI = "defi"
}
export declare const NOTIFICATION_CHAINS_ID: {
    readonly ETHEREUM: "1";
    readonly OPTIMISM: "10";
    readonly BSC: "56";
    readonly POLYGON: "137";
    readonly ARBITRUM: "42161";
    readonly AVALANCHE: "43114";
    readonly LINEA: "59144";
};
type ToPrimitiveKeys<TObj> = Compute<{
    [K in keyof TObj]: TObj[K] extends string ? string : TObj[K];
}>;
export declare const NOTIFICATION_CHAINS: ToPrimitiveKeys<typeof NOTIFICATION_CHAINS_ID>;
export declare const CHAIN_SYMBOLS: {
    [x: string]: string;
};
export declare const SUPPORTED_CHAINS: string[];
export type Trigger = {
    supported_chains: (typeof SUPPORTED_CHAINS)[number][];
};
export declare const TRIGGERS: Partial<Record<TRIGGER_TYPES, Trigger>>;
export {};
//# sourceMappingURL=notification-schema.d.ts.map