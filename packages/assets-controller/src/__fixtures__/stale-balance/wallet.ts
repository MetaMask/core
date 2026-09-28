/**
 * Constants for the stale-balance scenario suite: the same real BNB Chain
 * wallet as the `bsc-spam-token` fixtures, on BNB Chain, Ethereum mainnet,
 * and Hoodi, plus a Solana keyring-snap account.
 */

// ============================================================================
// BNB CHAIN (Ethereum) — the same real wallet as the bsc-spam-token suite
// ============================================================================

/** BNB Smart Chain. */
export const BSC_CHAIN_ID = 'eip155:56' as const;

/** Example wallet, as it appears in the Accounts API request. */
export const STALE_WALLET_ADDRESS =
  '0x9decDe522Cc1285efe18AfdE31C79e89dee2e91E';

/** `InternalAccount.id` (a UUID), not the address — see `AccountId`. */
export const BSC_ACCOUNT_ID = '5f6a7b8c-9d0e-4f1a-b2c3-d4e5f6a7b8c9';

/** BNB, the native asset of BNB Chain. */
export const BNB_ASSET_ID = `${BSC_CHAIN_ID}/slip44:714` as const;

/**
 * Binance-Peg USDT, the token whose single `balanceOf` fails in the
 * "one RPC balance read fails" scenarios.
 */
export const USDT_ASSET_ID_CHECKSUM =
  `${BSC_CHAIN_ID}/erc20:0x55d398326f99059fF775485246999027B3197955` as const;

/** GT Protocol, a second BNB Chain token used to prove fresh reads land. */
export const GTAI_ASSET_ID_CHECKSUM =
  `${BSC_CHAIN_ID}/erc20:0x003d87d02A2A01E9E8a20f507C83E15DD83A33d1` as const;

/** The lower-cased Accounts API form of the USDT asset ID. */
export const USDT_ASSET_ID_LOWERCASE =
  `${BSC_CHAIN_ID}/erc20:0x55d398326f99059ff775485246999027b3197955` as const;

/** The USDT contract on BNB Chain, lower-cased for provider-state keys. */
export const USDT_CONTRACT =
  '0x55d398326f99059ff775485246999027b3197955' as const;

// ============================================================================
// ETHEREUM MAINNET + HOODI (staked ETH scenarios)
// ============================================================================

/** Ethereum mainnet. */
export const MAINNET_CHAIN_ID = 'eip155:1' as const;

/** ETH, the native asset of Ethereum mainnet. */
export const ETH_ASSET_ID = `${MAINNET_CHAIN_ID}/slip44:60` as const;

/**
 * `InternalAccount.id` (a UUID) of the mainnet account (same address as the
 * BNB Chain wallet — the same EOA is usable on every EVM chain).
 */
export const MAINNET_ACCOUNT_ID = '0a1b2c3d-4e5f-4a6b-8c9d-e0f1a2b3c4d5';

/** Hoodi, the testnet that (like mainnet) has a known staking contract. */
export const HOODI_CHAIN_ID = 'eip155:560048' as const;

/** Staking contract on Ethereum mainnet (see `staking-contracts.ts`). */
export const MAINNET_STAKING_CONTRACT =
  '0x4fef9d741011476750a243ac70b9789a63dd47df' as const;

/** Staking contract on Hoodi (see `staking-contracts.ts`). */
export const HOODI_STAKING_CONTRACT =
  '0xe96ac18cfe5a7af8fe1fe7bc37ff110d88bc67ff' as const;

/** Staked ETH "vault share" asset ID on mainnet, as keyed in state. */
export const MAINNET_STAKED_ETH_ASSET_ID =
  `${MAINNET_CHAIN_ID}/erc20:0x4FEF9D741011476750A243aC70b9789a63dd47Df` as const;

/** Staked ETH "vault share" asset ID on Hoodi, as keyed in state. */
export const HOODI_STAKED_ETH_ASSET_ID =
  `${HOODI_CHAIN_ID}/erc20:0xE96aC18cFE5A7AF8FE1FE7Bc37FF110d88bc67fF` as const;

/**
 * Native asset ID for Hoodi ETH. The controller's native-asset map has no
 * Hoodi entry (the seed list covers price-API chains, which exclude this
 * testnet), so the product resolves Hoodi's native to the zero-address
 * ERC-20 encoding it uses for unregistered EVM chains. The enablement mock
 * and every expectation key the native the same way, mirroring the
 * identifier the pipeline actually writes.
 */
export const HOODI_NATIVE_ASSET_ID =
  `${HOODI_CHAIN_ID}/erc20:0x0000000000000000000000000000000000000000` as const;

// ============================================================================
// SOLANA (keyring snap account)
// ============================================================================

/** Solana mainnet. */
export const SOLANA_CHAIN_ID =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as const;

/** The keyring snap that owns the Solana account. */
export const SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as const;

/** Solana account address (base58), as reported by the snap. */
export const SOLANA_WALLET_ADDRESS =
  'FhRuTg4d2vbVbY1AhPWFGaJgMxNWUxUJUcNhjT5rFQZg' as const;

/** `InternalAccount.id` (a UUID) of the Solana snap account. */
export const SOLANA_ACCOUNT_ID =
  'a7b8c9d0-e1f2-4a3b-8c5d-6e7f8a9b0c1d' as const;

/** SOL, the native asset of Solana. */
export const SOL_ASSET_ID = `${SOLANA_CHAIN_ID}/slip44:501` as const;

/**
 * USDC on Solana (the real Circle mint), imported by the user as a custom
 * asset so it is always visible even when the snap omits it.
 */
export const SOLANA_USDC_ASSET_ID =
  `${SOLANA_CHAIN_ID}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as const;

/** JUP (the real Jupiter mint), a token the snap lists and reports itself. */
export const SOLANA_JUP_ASSET_ID =
  `${SOLANA_CHAIN_ID}/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` as const;

// ============================================================================
// RPC MOCKS
// ============================================================================

export const BSC_CHAIN_ID_HEX = '0x38' as const;
export const BSC_NETWORK_CLIENT_ID = 'bsc' as const;
export const BSC_RPC_URL = 'https://bsc-rpc.test' as const;

export const MAINNET_CHAIN_ID_HEX = '0x1' as const;
export const MAINNET_NETWORK_CLIENT_ID = 'mainnet' as const;
export const MAINNET_RPC_URL = 'https://mainnet-rpc.test' as const;

export const HOODI_CHAIN_ID_HEX = '0x88bb0' as const;
export const HOODI_NETWORK_CLIENT_ID = 'hoodi' as const;
export const HOODI_RPC_URL = 'https://hoodi-rpc.test' as const;

/** Multicall3 contract (same deployment on every chain; see MulticallClient). */
export const MULTICALL3_ADDRESS =
  '0xcA11bde05977b3631167028862bE2a173976CA11' as const;
