import { fetchWithErrorHandling } from '@metamask/controller-utils';

import type { Caip19AssetId, ChainId } from '../types.js';
import { normalizeAssetId } from './normalizeAssetId.js';

const CHAINID_NETWORK_URL = 'https://chainid.network/chains.json';

type ChainIdNetworkEntry = {
  chainId: number;
  slip44?: number;
};

/**
 * Seed native CAIP-19 asset IDs, keyed by CAIP-2 chain ID.
 *
 * Covers Price API v3/spot-prices EVM natives plus the Bitcoin, Solana,
 * Stellar and Tron natives this controller ingests. chainid.network only
 * fills extra `eip155` gaps, so without the non-EVM rows an account holding
 * nothing on those networks gets an empty list instead of BTC/SOL/XLM/TRX
 * at 0.
 *
 * Price API v3/spot-prices chains only for EVM — verify support before adding:
 * https://github.com/consensys-vertical-apps/va-mmcx-price-api/blob/main/src/constants/slip44.ts
 * Include chain name + native symbol. Keep sorted by chain ID.
 */
export const NATIVE_ASSETS: Readonly<Record<ChainId, Caip19AssetId>> = {
  'eip155:1': 'eip155:1/slip44:60', // Ethereum Mainnet - Native symbol: ETH
  'eip155:10': 'eip155:10/slip44:60', // OP Mainnet - Native symbol: ETH
  'eip155:25': 'eip155:25/slip44:394', // Cronos Mainnet - Native symbol: CRO
  'eip155:30': 'eip155:30/slip44:137', // Rootstock Mainnet - Native symbol: RBTC
  'eip155:42': 'eip155:42/erc20:0x0000000000000000000000000000000000000000', // Lukso - native symbol: LYX
  'eip155:50': 'eip155:50/erc20:0x0000000000000000000000000000000000000000', // xdc-network - native symbol: XDC
  'eip155:56': 'eip155:56/slip44:714', // BNB Smart Chain Mainnet - Native symbol: BNB
  'eip155:57': 'eip155:57/slip44:57', // Syscoin Mainnet - Native symbol: SYS
  'eip155:82': 'eip155:82/slip44:18000', // Meter Mainnet - Native symbol: MTR
  'eip155:88': 'eip155:88/slip44:889', // TomoChain - Native symbol: TOMO
  'eip155:100': 'eip155:100/erc20:0x0000000000000000000000000000000000000000', // Gnosis (formerly xDAI Chain) - Native symbol: xDAI
  'eip155:106': 'eip155:106/slip44:5655640', // Velas EVM Mainnet - Native symbol: VLX
  'eip155:122': 'eip155:122/erc20:0x0000000000000000000000000000000000000000', // Fuse Mainnet - Native symbol: FUSE
  'eip155:128': 'eip155:128/slip44:1010', // Huobi ECO Chain Mainnet - Native symbol: HT
  'eip155:137': 'eip155:137/slip44:966', // Polygon Mainnet - Native symbol: POL
  'eip155:143': 'eip155:143/slip44:268435779', // Monad Mainnet - Native symbol: MON
  'eip155:146': 'eip155:146/slip44:10007', // Sonic Mainnet - Native symbol: S
  'eip155:196': 'eip155:196/erc20:0x0000000000000000000000000000000000000000', // X Layer Mainnet - Native symbol: OKB
  'eip155:232': 'eip155:232/erc20:0x0000000000000000000000000000000000000000', // Lens Mainnet - Native symbol: GHO
  'eip155:250': 'eip155:250/slip44:1007', // Fantom Opera - Native symbol: FTM
  'eip155:252': 'eip155:252/erc20:0x0000000000000000000000000000000000000000', // Fraxtal - native symbol: FRAX
  'eip155:288': 'eip155:288/slip44:60', // Boba Network (Ethereum L2) - Native symbol: ETH
  'eip155:321': 'eip155:321/slip44:641', // KCC Mainnet - Native symbol: KCS
  'eip155:324': 'eip155:324/slip44:60', // zkSync Era Mainnet (Ethereum L2) - Native symbol: ETH
  'eip155:336': 'eip155:336/slip44:809', // Shiden - Native symbol: SDN
  'eip155:361': 'eip155:361/slip44:589', // Theta Mainnet - Native symbol: TFUEL
  'eip155:747': 'eip155:747/slip44:539', // Flow evm - Native symbol: Flow
  'eip155:988': 'eip155:988/erc20:0x0000000000000000000000000000000000000000', // Stable - Native symbol: USDT0
  'eip155:999': 'eip155:999/slip44:2457', // HyperEVM - Native symbol: HYPE
  'eip155:1088': 'eip155:1088/erc20:0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000', // Metis Andromeda Mainnet (Ethereum L2) - Native symbol: METIS
  'eip155:1101': 'eip155:1101/slip44:60', // Polygon zkEVM mainnet - Native symbol: ETH
  'eip155:1284': 'eip155:1284/slip44:1284', // Moonbeam - Native symbol: GLMR
  'eip155:1285': 'eip155:1285/slip44:1285', // Moonriver - Native symbol: MOVR
  'eip155:1329': 'eip155:1329/slip44:19000118', // Sei Mainnet - Native symbol: SEI
  'eip155:1776': 'eip155:1776/slip44:22000119', // Injective Mainnet - Native symbol: INJ
  'eip155:1868': 'eip155:1868/erc20:0x0000000000000000000000000000000000000000', // Soneium - Native symbol: ETH
  'eip155:2525': 'eip155:2525/erc20:0x0000000000000000000000000000000000000000', // inEVM Mainnet - Native symbol: INV
  'eip155:2741': 'eip155:2741/erc20:0x0000000000000000000000000000000000000000', // Abstract - Native symbol: ETH
  'eip155:4217': 'eip155:4217/slip44:60', // Tempo Mainnet - No native asset
  'eip155:4326': 'eip155:4326/erc20:0x0000000000000000000000000000000000000000', // MegaETH Mainnet - Native symbol: ETH
  'eip155:5000': 'eip155:5000/erc20:0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000', // Mantle - Native symbol: MNT
  'eip155:5031': 'eip155:5031/slip44:5031', // Somnia Mainnet - Native symbol: SOMI
  'eip155:5042': 'eip155:5042/slip44:5042', // Arc - Native symbol: USDC
  'eip155:7000': 'eip155:7000/slip44:7000', // ZetaChain - Native symbol: ZETA
  'eip155:8453': 'eip155:8453/slip44:60', // Base - Native symbol: ETH
  'eip155:4663': 'eip155:4663/slip44:60', // Robinhood Chain - Native symbol: ETH
  'eip155:9745': 'eip155:9745/erc20:0x0000000000000000000000000000000000000000', // Plasma mainnet - native symbol: XPL
  'eip155:10000': 'eip155:10000/slip44:145', // Smart Bitcoin Cash - Native symbol: BCH
  'eip155:33139':
    'eip155:33139/erc20:0x0000000000000000000000000000000000000000', // Apechain Mainnet - Native symbol: APE
  'eip155:41923':
    'eip155:41923/erc20:0x0000000000000000000000000000000000000000', // EDU Chain - Native symbol: EDU
  'eip155:42161': 'eip155:42161/slip44:60', // Arbitrum One - Native symbol: ETH
  'eip155:42220': 'eip155:42220/slip44:52752', // Celo Mainnet - Native symbol: CELO
  'eip155:42262': 'eip155:42262/slip44:474', // Oasis Emerald - Native symbol: ROSE
  'eip155:42431': 'eip155:42431/slip44:60', // Tempo Testnet Moderato - No native asset
  'eip155:42793':
    'eip155:42793/erc20:0x0000000000000000000000000000000000000000', // Etherlink - Native symbol: XTZ (Tezos L2)
  'eip155:43111':
    'eip155:43111/erc20:0x0000000000000000000000000000000000000000', // Hemi - Native symbol: ETH
  'eip155:43114': 'eip155:43114/slip44:9005', // Avalanche C-Chain - Native symbol: AVAX
  'eip155:57073': 'eip155:57073/slip44:60', // Ink Mainnet - Native symbol: ETH
  'eip155:59144': 'eip155:59144/slip44:60', // Linea Mainnet - Native symbol: ETH
  'eip155:60808':
    'eip155:60808/erc20:0x0000000000000000000000000000000000000000', // BOB - Native symbol: ETH
  'eip155:68414':
    'eip155:68414/erc20:0x0000000000000000000000000000000000000000', // MapleStory Universe - no slip44
  'eip155:73115':
    'eip155:73115/erc20:0x0000000000000000000000000000000000000000', // ICB Network - Native symbol: ICBX
  'eip155:80094':
    'eip155:80094/erc20:0x0000000000000000000000000000000000000000', // Berachain - Native symbol: Bera
  'eip155:81457': 'eip155:81457/slip44:60', // Blast Mainnet - Native symbol: ETH
  'eip155:88888':
    'eip155:88888/erc20:0x0000000000000000000000000000000000000000', // Chiliz Chain - Native symbol: CHZ
  'eip155:97741':
    'eip155:97741/erc20:0x0000000000000000000000000000000000000000', // Pepe Unchained Mainnet - Native symbol: PEPU
  'eip155:98866':
    'eip155:98866/erc20:0x0000000000000000000000000000000000000000', // Plume Mainnet - Native symbol: Plume
  'eip155:167000': 'eip155:167000/slip44:60', // Taiko Mainnet - Native symbol: ETH
  'eip155:333999': 'eip155:333999/slip44:1997', // Polis Mainnet - Native symbol: POLIS
  'eip155:534352': 'eip155:534352/slip44:60', // Scroll Mainnet - Native symbol: ETH
  'eip155:747474':
    'eip155:747474/erc20:0x0000000000000000000000000000000000000000', // katana - Native symbol: ETH
  'eip155:984122':
    'eip155:984122/erc20:0x0000000000000000000000000000000000000000', // Forma - Native symbol: TIA (Celestia)
  'eip155:1440000':
    'eip155:1440000/erc20:0x0000000000000000000000000000000000000000', // xrpl-evm - native symbol: XRP
  'eip155:1313161554': 'eip155:1313161554/slip44:60', // Aurora Mainnet (Ethereum L2 on NEAR) - Native symbol: ETH
  'eip155:1666600000': 'eip155:1666600000/slip44:1023', // Harmony Mainnet Shard 0 - Native symbol: ONE
  'eip155:16661': 'eip155:16661/slip44:1111116661', // 0G Chain - Native symbol: 0G
  'bip122:000000000019d6689c085ae165831e93':
    'bip122:000000000019d6689c085ae165831e93/slip44:0', // Bitcoin Mainnet - Native symbol: BTC
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp':
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501', // Solana Mainnet - Native symbol: SOL
  'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z':
    'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z/slip44:501', // Solana Testnet - Native symbol: SOL
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1':
    'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501', // Solana Devnet - Native symbol: SOL
  'stellar:pubnet': 'stellar:pubnet/slip44:148', // Stellar Pubnet - Native symbol: XLM
  'stellar:testnet': 'stellar:testnet/slip44:148', // Stellar Testnet - Native symbol: XLM
  'tron:728126428': 'tron:728126428/slip44:195', // Tron Mainnet - Native symbol: TRX
  'tron:3448148188': 'tron:3448148188/slip44:195', // Tron Nile - Native symbol: TRX
  'tron:2494104990': 'tron:2494104990/slip44:195', // Tron Shasta - Native symbol: TRX
};

const NATIVE_ASSET_IDS = new Set(
  Object.values(NATIVE_ASSETS).map((assetId) =>
    normalizeAssetId(assetId).toLowerCase(),
  ),
);

/**
 * Whether `assetId` is the native asset for a chain in {@link NATIVE_ASSETS}.
 * ERC-20 addresses are compared in checksummed form.
 *
 * @param assetId - CAIP-19 asset ID to check.
 * @returns True when the ID matches a seeded native asset.
 */
export function isNativeAssetId(assetId: Caip19AssetId): boolean {
  try {
    return NATIVE_ASSET_IDS.has(normalizeAssetId(assetId).toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Builds a native asset map from {@link NATIVE_ASSETS}, normalizing each
 * CAIP-19 ID (ERC-20 addresses become EIP-55 checksummed).
 *
 * @returns A record mapping CAIP-2 chain IDs to their CAIP-19 native asset IDs.
 */
export function buildNativeAssetsFromConstant(): Record<
  ChainId,
  Caip19AssetId
> {
  const nativeAssetsMap: Record<ChainId, Caip19AssetId> = {};
  for (const [chainId, nativeAssetId] of Object.entries(NATIVE_ASSETS)) {
    nativeAssetsMap[chainId as ChainId] = normalizeAssetId(nativeAssetId);
  }
  return nativeAssetsMap;
}

/**
 * Fetches chain data from chainid.network and merges it with the seed
 * native asset map built from {@link buildNativeAssetsFromConstant}.
 *
 * Remote entries only fill gaps — chains already present in the seed map
 * are never overwritten. Invalid entries (missing/negative chainId or slip44)
 * are silently skipped.
 *
 * @returns The merged native asset map.
 */
export async function buildNativeAssetsFromApi(): Promise<
  Record<ChainId, Caip19AssetId>
> {
  const nativeAssetsMap = buildNativeAssetsFromConstant();

  try {
    const chains: ChainIdNetworkEntry[] | undefined =
      await fetchWithErrorHandling({
        url: CHAINID_NETWORK_URL,
        timeout: 10_000,
      });

    if (chains && Array.isArray(chains)) {
      for (const chain of chains) {
        if (
          !chain.chainId ||
          !chain.slip44 ||
          !Number.isInteger(chain.chainId) ||
          chain.chainId < 1 ||
          !Number.isInteger(chain.slip44) ||
          chain.slip44 < 1
        ) {
          continue;
        }

        const caipChainId = `eip155:${chain.chainId}` as ChainId;
        if (!nativeAssetsMap[caipChainId]) {
          nativeAssetsMap[caipChainId] =
            `eip155:${chain.chainId}/slip44:${chain.slip44}`;
        }
      }
    }
  } catch {
    // Non-fatal: caller should fall back to the seed map.
  }

  return nativeAssetsMap;
}
