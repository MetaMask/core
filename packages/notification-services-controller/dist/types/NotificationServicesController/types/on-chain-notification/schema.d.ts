/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 * Script: `npx openapi-typescript <PATH TO NOTIFICATION API SPEC> -o ./schema.d.ts`
 */
export type paths = {
    '/api/v1/notifications': {
        /** List all notifications ordered by most recent */
        post: {
            parameters: {
                query?: {
                    /** @description Page number for pagination */
                    page?: number;
                    /** @description Number of notifications per page for pagination */
                    per_page?: number;
                };
            };
            requestBody?: {
                content: {
                    'application/json': {
                        trigger_ids: string[];
                        chain_ids?: number[];
                        kinds?: string[];
                        unread?: boolean;
                    };
                };
            };
            responses: {
                /** @description Successfully fetched a list of notifications */
                200: {
                    content: {
                        'application/json': components['schemas']['Notification'][];
                    };
                };
            };
        };
    };
    '/api/v1/notifications/mark-as-read': {
        /** Mark notifications as read */
        post: {
            requestBody: {
                content: {
                    'application/json': {
                        ids?: string[];
                    };
                };
            };
            responses: {
                /** @description Successfully marked notifications as read */
                200: {
                    content: never;
                };
            };
        };
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        Notification: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            trigger_id: string;
            /** @example 1 */
            chain_id: number;
            /** @example 17485840 */
            block_number: number;
            block_timestamp: string;
            /**
             * Format: address
             *
             * @example 0x881D40237659C251811CEC9c364ef91dC08D300C
             */
            tx_hash: string;
            /** @example false */
            unread: boolean;
            /** Format: date-time */
            created_at: string;
            /** Format: address */
            address: string;
            data?: components['schemas']['Data_MetamaskSwapCompleted'] | components['schemas']['Data_LidoStakeReadyToBeWithdrawn'] | components['schemas']['Data_LidoStakeCompleted'] | components['schemas']['Data_LidoWithdrawalRequested'] | components['schemas']['Data_LidoWithdrawalCompleted'] | components['schemas']['Data_RocketPoolStakeCompleted'] | components['schemas']['Data_RocketPoolUnstakeCompleted'] | components['schemas']['Data_ETHSent'] | components['schemas']['Data_ETHReceived'] | components['schemas']['Data_ERC20Sent'] | components['schemas']['Data_ERC20Received'] | components['schemas']['Data_ERC721Sent'] | components['schemas']['Data_ERC721Received'] | components['schemas']['Data_ERC1155Sent'] | components['schemas']['Data_ERC1155Received'];
        };
        Data_MetamaskSwapCompleted: {
            /** @enum {string} */
            kind: 'metamask_swap_completed';
            network_fee: components['schemas']['NetworkFee'];
            /** Format: decimal */
            rate: string;
            token_in: components['schemas']['Token'];
            token_out: components['schemas']['Token'];
        };
        Data_LidoStakeCompleted: {
            /** @enum {string} */
            kind: 'lido_stake_completed';
            network_fee: components['schemas']['NetworkFee'];
            stake_in: components['schemas']['Stake'];
            stake_out: components['schemas']['Stake'];
        };
        Data_LidoWithdrawalRequested: {
            /** @enum {string} */
            kind: 'lido_withdrawal_requested';
            network_fee: components['schemas']['NetworkFee'];
            stake_in: components['schemas']['Stake'];
            stake_out: components['schemas']['Stake'];
        };
        Data_LidoStakeReadyToBeWithdrawn: {
            /** @enum {string} */
            kind: 'lido_stake_ready_to_be_withdrawn';
            /** Format: decimal */
            request_id: string;
            staked_eth: components['schemas']['Stake'];
        };
        Data_LidoWithdrawalCompleted: {
            /** @enum {string} */
            kind: 'lido_withdrawal_completed';
            network_fee: components['schemas']['NetworkFee'];
            stake_in: components['schemas']['Stake'];
            stake_out: components['schemas']['Stake'];
        };
        Data_RocketPoolStakeCompleted: {
            /** @enum {string} */
            kind: 'rocketpool_stake_completed';
            network_fee: components['schemas']['NetworkFee'];
            stake_in: components['schemas']['Stake'];
            stake_out: components['schemas']['Stake'];
        };
        Data_RocketPoolUnstakeCompleted: {
            /** @enum {string} */
            kind: 'rocketpool_unstake_completed';
            network_fee: components['schemas']['NetworkFee'];
            stake_in: components['schemas']['Stake'];
            stake_out: components['schemas']['Stake'];
        };
        Data_ETHSent: {
            /** @enum {string} */
            kind: 'eth_sent';
            network_fee: components['schemas']['NetworkFee'];
            /** Format: address */
            from: string;
            /** Format: address */
            to: string;
            amount: {
                /** Format: decimal */
                usd: string;
                /** Format: decimal */
                eth: string;
            };
        };
        Data_ETHReceived: {
            /** @enum {string} */
            kind: 'eth_received';
            network_fee: components['schemas']['NetworkFee'];
            /** Format: address */
            from: string;
            /** Format: address */
            to: string;
            amount: {
                /** Format: decimal */
                usd: string;
                /** Format: decimal */
                eth: string;
            };
        };
        Data_ERC20Sent: {
            /** @enum {string} */
            kind: 'erc20_sent';
            network_fee: components['schemas']['NetworkFee'];
            /** Format: address */
            from: string;
            /** Format: address */
            to: string;
            token: components['schemas']['Token'];
        };
        Data_ERC20Received: {
            /** @enum {string} */
            kind: 'erc20_received';
            network_fee: components['schemas']['NetworkFee'];
            /** Format: address */
            from: string;
            /** Format: address */
            to: string;
            token: components['schemas']['Token'];
        };
        Data_ERC721Sent: {
            /** @enum {string} */
            kind: 'erc721_sent';
            network_fee: components['schemas']['NetworkFee'];
            /** Format: address */
            from: string;
            /** Format: address */
            to: string;
            nft: components['schemas']['NFT'];
        };
        Data_ERC721Received: {
            /** @enum {string} */
            kind: 'erc721_received';
            network_fee: components['schemas']['NetworkFee'];
            /** Format: address */
            from: string;
            /** Format: address */
            to: string;
            nft: components['schemas']['NFT'];
        };
        Data_ERC1155Sent: {
            /** @enum {string} */
            kind: 'erc1155_sent';
            network_fee: components['schemas']['NetworkFee'];
            /** Format: address */
            from: string;
            /** Format: address */
            to: string;
            nft?: components['schemas']['NFT'];
        };
        Data_ERC1155Received: {
            /** @enum {string} */
            kind: 'erc1155_received';
            network_fee: components['schemas']['NetworkFee'];
            /** Format: address */
            from: string;
            /** Format: address */
            to: string;
            nft?: components['schemas']['NFT'];
        };
        NetworkFee: {
            /** Format: decimal */
            gas_price: string;
            /** Format: decimal */
            native_token_price_in_usd: string;
        };
        Token: {
            /** Format: address */
            address: string;
            symbol: string;
            name: string;
            /** Format: decimal */
            amount: string;
            /** Format: int32 */
            decimals: string;
            /** Format: uri */
            image: string;
            /** Format: decimal */
            usd: string;
        };
        NFT: {
            name: string;
            token_id: string;
            /** Format: uri */
            image: string;
            collection: {
                /** Format: address */
                address: string;
                name: string;
                symbol: string;
                /** Format: uri */
                image: string;
            };
        };
        Stake: {
            /** Format: address */
            address: string;
            symbol: string;
            name: string;
            /** Format: decimal */
            amount: string;
            /** Format: int32 */
            decimals: string;
            /** Format: uri */
            image: string;
            /** Format: decimal */
            usd: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type $defs = Record<string, never>;
export type external = Record<string, never>;
export type operations = Record<string, never>;
//# sourceMappingURL=schema.d.ts.map