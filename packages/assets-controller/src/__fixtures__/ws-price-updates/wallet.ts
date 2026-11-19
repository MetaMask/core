/** Ethereum Mainnet. */
export const MAINNET_CHAIN_ID = 'eip155:1' as const;

/** The wallet address, lower case as the websocket reports it. */
export const WS_WALLET_ADDRESS = '0x742d35cc6634c0532925a3b844bc454e4438f44e';

/** `InternalAccount.id` (a UUID), not the address. */
export const WS_ACCOUNT_ID = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';

/** Native ETH. */
export const ETH_ASSET_ID = `${MAINNET_CHAIN_ID}/slip44:60` as const;

/** USDC, lower case as the websocket reports it. */
export const USDC_ADDRESS_LOWERCASE =
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

/** Checksummed USDC, as state keys assets. */
export const USDC_ADDRESS_CHECKSUM =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

export const USDC_ASSET_ID_LOWERCASE =
  `${MAINNET_CHAIN_ID}/erc20:${USDC_ADDRESS_LOWERCASE}` as const;

export const USDC_ASSET_ID_CHECKSUM =
  `${MAINNET_CHAIN_ID}/erc20:${USDC_ADDRESS_CHECKSUM}` as const;

/** The ETH spot price the Price API reports. */
export const ETH_SPOT_PRICE = 2688.8502994319642;

/** The USDC spot price the Price API reports. */
export const USDC_SPOT_PRICE = 0.999966;

// RPC mocks
export const MAINNET_CHAIN_ID_HEX = '0x1' as const;
export const MAINNET_NETWORK_CLIENT_ID = 'mainnet' as const;
export const MAINNET_RPC_URL = 'https://mainnet-rpc.test';
