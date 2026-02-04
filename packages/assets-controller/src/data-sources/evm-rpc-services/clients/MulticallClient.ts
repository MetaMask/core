import type { Hex } from '@metamask/utils';

import type {
  Address,
  BalanceOfRequest,
  BalanceOfResponse,
  ChainId,
  GetProviderFunction,
  Provider,
} from '../types';
import { reduceInBatchesSerially } from '../utils';

// =============================================================================
// CONSTANTS / SELECTORS
// =============================================================================

// ERC-20 balanceOf(address)
const SELECTOR_BALANCE_OF = '0x70a08231' as const;

// Multicall3 getEthBalance(address)
const SELECTOR_GET_ETH_BALANCE = '0x4d2301cc' as const;

// Multicall3 aggregate3((address,bool,bytes)[])
const SELECTOR_AGGREGATE3 = '0x82ad56cb' as const;

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Zero address constant for native token.
 */
const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;

/**
 * Multicall3 contract addresses by chain ID.
 * Source: https://github.com/mds1/multicall/blob/main/deployments.json
 *
 * TODO: try to find service to use here instead of hardcoding the addresses
 */
const MULTICALL3_ADDRESS_BY_CHAIN: Record<Hex, Hex> = {
  '0x1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x4': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x5': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xaa36a7': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x4268': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x5e9': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1b6e6': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x18fc4a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x45': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1a4': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xaa37dc': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa4b1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa4ba': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x66eed': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x66eee': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x66eeb': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x15f2249': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x89': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x13881': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x13882': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x44d': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x5a2': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x98a': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x64': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x27d8': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa86a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa869': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xfa2': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xfa': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xfaf0': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x38': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x61': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x15eb': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xcc': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x504': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x505': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x507': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2a15c308d': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x2a15c3083': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x63564c40': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x19': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x152': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x5535072': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x6c1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x7a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xe': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x13': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x10': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x72': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x120': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x4e454152': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x250': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x5c2359': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xec0': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x42': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x80': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x440': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x257': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xe9fe': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xd3a0': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x84444': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1e': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2329': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2328': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x6c': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x12': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa516': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x5afe': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa4ec': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xaef3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x116ea': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x116e9': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2019': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3e9': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x7d1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x141': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x6a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x28': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x4d2': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1e14': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1e15': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1251': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x7f08': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x8ae': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x138b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1389': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1388': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1f92': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x14a33': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x14a34': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2105': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x936': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xff': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x46a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x46b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x8a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x14f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xd2af': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xe9ac0ce': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xe705': '0xca11bde05977b3631167028862be2a173976ca11',
  '0xe704': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xe708': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2b6f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x39': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x23a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1644': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xdea8': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3af': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x171': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3e7': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x76adf1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3b9ac9ff': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2c': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x2e': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x15b3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x82751': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x8274f': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x82750': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x96f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3cc5': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x4571': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xe99': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x7d0': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1297': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1d5e': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3a14269b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x561bf78b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x235ddd0': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3cd156dc': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x5d456c62': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x79f99296': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x585eb4b1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x507aaa2a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1fc3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x32d': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x8a73': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x8a72': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x8a71': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xe9ac0d6': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x1069': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x7e5': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x53': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x52': '0xca11bde05977b3631167028862be2a173976ca11',
  '0xe298': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1a8': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x94': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2c6': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2803': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2802': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa9': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x28c5f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x28c60': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x13a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x4cb2f': '0xdbfa261cd7d17bb40479a0493ad6c0fee435859e',
  '0x7f93': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xb660': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xb02113d3f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xdad': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xdae': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x15b38': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x15b32': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x45c': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x45b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3d': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x41a6ace': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa729': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1f47b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1b59': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x1b58': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xc3': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x16fd8': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xc7': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x405': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x334': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1ce': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x1cf': '0xca11bde05977b3631167028862be2a173976ca11',
  '0xa70e': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x868b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa0c71fd': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x13e31': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa1337': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1f2b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xf63': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x144': '0xF9cda624FBC7e059355ce98a31693d299FACd963',
  '0x118': '0xF9cda624FBC7e059355ce98a31693d299FACd963',
  '0x12c': '0xF9cda624FBC7e059355ce98a31693d299FACd963',
  '0x18995f': '0xF9cda624FBC7e059355ce98a31693d299FACd963',
  '0x2b74': '0xF9cda624FBC7e059355ce98a31693d299FACd963',
  '0xfc': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x9da': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x137': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x13ed': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x24b1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xba9302': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x7c8': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x138d5': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x6d': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x343b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x34a1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3109': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x91b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa96': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x22c3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2be3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xbf03': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1b254': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa7b14': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2276': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1b9e': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x6a63bb8': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x15af3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x15af1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xae3f3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x531': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x28c61': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x28c58': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x1d88': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x5b9b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x4c7e1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa53b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1a2b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x406': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x2cef': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x18b2': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x182a9': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xc4': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xfdd': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xfde': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x99c0a0f': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x22cf': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x310c5': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x46f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x659': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x139c968f9': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xed88': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xd036': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1f3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x31bf8c3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x1cbc67bfdc': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x98967f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x4f588': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x16db': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x3a': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x59': '0xca11bde05977b3631167028862be2a173976ca11',
  '0x1e0': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2eb': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x221': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x6f0': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa867': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2611': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa6': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x15f900': '0x6B5eFbC0C82eBb26CA13a4F11836f36Fc6fdBC5D',
  '0x74c': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x407b': '0x90a2377F233E3461BACa6080d4837837d8762927',
  '0xa3c3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xab5': '0xF9cda624FBC7e059355ce98a31693d299FACd963',
  '0x138de': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x18c6': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x8173': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2ba': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x279f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xb67d2': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xe8': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x18232': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x8f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x32': '0x0B1795ccA8E4eC4df02346a082df54D437F8D9aF',
  '0x18c7': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x10e6': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x10b3e': '0x99423C88EB5723A590b4C644426069042f137B9e',
};

// =============================================================================
// HEX / ABI ENCODING PRIMITIVES
// =============================================================================

function assertHex(value: string): asserts value is Hex {
  if (!value.startsWith('0x')) {
    throw new Error(`Expected 0x-prefixed hex, got: ${value}`);
  }
}

function strip0x(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function padToEven(value: string): string {
  return value.length % 2 === 0 ? value : `0${value}`;
}

function leftPad32(hexNo0x: string): string {
  return hexNo0x.padStart(64, '0');
}

function rightPad32Bytes(hexNo0x: string): string {
  const byteLen = Math.ceil(hexNo0x.length / 2);
  const paddedByteLen = Math.ceil(byteLen / 32) * 32;
  const paddedHexLen = paddedByteLen * 2;
  return hexNo0x.padEnd(paddedHexLen, '0');
}

function encodeUint256(value: bigint): string {
  if (value < 0n) {
    throw new Error('uint256 cannot be negative');
  }
  return leftPad32(value.toString(16));
}

function encodeBool(value: boolean): string {
  return leftPad32(value ? '1' : '0');
}

function encodeAddress(address: Address): string {
  const a = strip0x(address).toLowerCase();
  if (a.length !== 40) {
    throw new Error(`Invalid address length: ${address}`);
  }
  return leftPad32(a);
}

function encodeBytesDynamic(data: Hex): { head: string; tail: string } {
  const hexNo0x = strip0x(data);
  const hexEven = padToEven(hexNo0x);
  const lenBytes = BigInt(hexEven.length / 2);
  const lenWord = encodeUint256(lenBytes);
  const dataPadded = rightPad32Bytes(hexEven);
  return {
    head: '', // offset is handled by caller
    tail: `${lenWord}${dataPadded}`,
  };
}

function hexFromParts(parts: string[], with0x = true): Hex {
  const joined = parts.join('');
  const out = (with0x ? `0x${joined}` : joined) as Hex;
  assertHex(out);
  return out;
}

// =============================================================================
// ENCODING FOR OUR 3 FUNCTIONS
// =============================================================================

/**
 * Encode a balanceOf call for an ERC-20 token.
 * balanceOf(address account) -> bytes
 *
 * @param accountAddress - The account address.
 * @returns The encoded call data.
 */
function encodeBalanceOf(accountAddress: Address): Hex {
  return `0x${strip0x(SELECTOR_BALANCE_OF)}${encodeAddress(accountAddress)}`;
}

/**
 * Encode a getEthBalance call for native token via Multicall3.
 * getEthBalance(address addr) -> bytes
 *
 * @param accountAddress - The account address.
 * @returns The encoded call data.
 */
function encodeGetEthBalance(accountAddress: Address): Hex {
  return `0x${strip0x(SELECTOR_GET_ETH_BALANCE)}${encodeAddress(accountAddress)}`;
}

/**
 * Encode a Multicall3 aggregate3 call.
 * aggregate3((address target,bool allowFailure,bytes callData)[] calls) -> bytes
 *
 * Encoding:
 *  - selector
 *  - head: offset to calls data (0x20)
 *  - tail: calls array encoding
 *
 * ABI encoding for dynamic array of tuples with dynamic bytes:
 *  - Array length
 *  - Offsets to each tuple (relative to start of offsets area)
 *  - Tuple data (each tuple: target, allowFailure, offset to bytes, bytes data)
 *
 * @param calls - Array of calls with target, allowFailure, and callData.
 * @returns The encoded aggregate3 call data.
 */
export function encodeAggregate3(
  calls: readonly { target: Address; allowFailure: boolean; callData: Hex }[],
): Hex {
  // function has one argument, so head is one 32-byte offset to the start of tail (= 0x20)
  const selector = strip0x(SELECTOR_AGGREGATE3);
  const head = encodeUint256(32n); // offset to tail

  // Tail = dynamic array of tuples
  const arrayLen = encodeUint256(BigInt(calls.length));

  // Build each tuple's encoded data
  // Tuple structure: (address target, bool allowFailure, bytes callData)
  // - target: 32 bytes
  // - allowFailure: 32 bytes
  // - offset to callData bytes: 32 bytes (always 0x60 = 96, relative to tuple start)
  // - callData: length word + padded data
  const tupleDataList: string[] = [];

  for (const call of calls) {
    const target = encodeAddress(call.target);
    const allowFailure = encodeBool(call.allowFailure);
    const callDataOffset = encodeUint256(96n); // 0x60 - offset to bytes, relative to tuple start

    const callDataEnc = encodeBytesDynamic(call.callData);
    const tupleData = `${target}${allowFailure}${callDataOffset}${callDataEnc.tail}`;
    tupleDataList.push(tupleData);
  }

  // Calculate tuple sizes (in bytes) and offsets
  // Offsets are relative to the start of the offsets area (right after the length word)
  // The offsets area itself takes N * 32 bytes (one word per tuple offset)
  const offsetsAreaSize = calls.length * 32;
  const tupleOffsets: string[] = [];
  const tupleSizes: number[] = tupleDataList.map((data) => data.length / 2);

  let currentOffset = offsetsAreaSize; // First tuple starts right after all offset words
  for (let i = 0; i < calls.length; i++) {
    tupleOffsets.push(encodeUint256(BigInt(currentOffset)));
    currentOffset += tupleSizes[i];
  }

  // Assemble: length + offsets + tuple data
  const tail = `${arrayLen}${tupleOffsets.join('')}${tupleDataList.join('')}`;

  return hexFromParts([selector, head, tail]);
}

// =============================================================================
// DECODING
// =============================================================================

function readWord(hexNo0x: string, wordIndex: number): string {
  const start = wordIndex * 64;
  return hexNo0x.slice(start, start + 64);
}

function readWordAtByte(hexNo0x: string, byteOffset: number): string {
  const start = byteOffset * 2;
  return hexNo0x.slice(start, start + 64);
}

function wordToBigInt(wordHex: string): bigint {
  return BigInt(`0x${wordHex}`);
}

function wordToBool(wordHex: string): boolean {
  return wordToBigInt(wordHex) !== 0n;
}

function wordToNumber(wordHex: string): number {
  const val = wordToBigInt(wordHex);
  if (val > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Value too large');
  }
  return Number(val);
}

function sliceHexBytes(
  hexNo0x: string,
  byteOffset: number,
  byteLength: number,
): string {
  const start = byteOffset * 2;
  const end = start + byteLength * 2;
  return hexNo0x.slice(start, end);
}

/**
 * Decode the response from aggregate3.
 * Decode aggregate3 return value: (bool success, bytes returnData)[]
 *
 * ABI encoding structure for dynamic array of tuples with dynamic bytes:
 *  - Word 0: offset to array data (typically 0x20 = 32)
 *  - At array offset:
 *    - Word: array length
 *    - Words: offsets to each tuple (relative to start of offsets area)
 *  - Each tuple:
 *    - Word: bool success
 *    - Word: offset to bytes (relative to tuple start)
 *    - At bytes offset: length word + padded data
 *
 * @param data - The raw response data.
 * @param callCount - Number of calls made (used for validation).
 * @returns Array of success and return data.
 */
export function decodeAggregate3Response(
  data: Hex,
  callCount: number,
): { success: boolean; returnData: Hex }[] {
  const hexNo0x = strip0x(data);
  if (hexNo0x.length < 64) {
    throw new Error('Invalid return data');
  }

  // Word 0: offset to array (in bytes)
  const arrayOffsetBytes = wordToNumber(readWord(hexNo0x, 0));

  // At array offset: first word is length
  const length = wordToNumber(readWordAtByte(hexNo0x, arrayOffsetBytes));
  if (length !== callCount) {
    throw new Error(`Expected ${callCount} results, got ${length}`);
  }

  const results: { success: boolean; returnData: Hex }[] = [];

  // After length: `length` words of offsets to each tuple
  // These offsets are relative to the start of the offsets area (arrayOffsetBytes + 32)
  const offsetsAreaStart = arrayOffsetBytes + 32;

  for (let i = 0; i < length; i++) {
    // Read tuple offset (relative to offsetsAreaStart)
    const tupleOffsetBytes = wordToNumber(
      readWordAtByte(hexNo0x, offsetsAreaStart + i * 32),
    );
    const tupleAbsStart = offsetsAreaStart + tupleOffsetBytes;

    // Tuple structure: (bool success, bytes returnData)
    // Word 0: success (bool as uint256)
    // Word 1: offset to returnData bytes (relative to tuple start)
    const successWord = readWordAtByte(hexNo0x, tupleAbsStart);
    const success = wordToBool(successWord);

    const bytesOffsetBytes = wordToNumber(
      readWordAtByte(hexNo0x, tupleAbsStart + 32),
    );
    const bytesAbsStart = tupleAbsStart + bytesOffsetBytes;

    // At bytes location: length word + data
    const bytesLength = wordToNumber(readWordAtByte(hexNo0x, bytesAbsStart));
    const bytesData = sliceHexBytes(hexNo0x, bytesAbsStart + 32, bytesLength);

    results.push({
      success,
      returnData: `0x${bytesData}`,
    });
  }

  return results;
}

/**
 * Decode a uint256 balance from return data.
 *
 * @param data - The hex return data.
 * @returns The decoded balance as a string.
 */
function decodeUint256(data: Hex): string {
  const hexNo0x = strip0x(data);
  if (hexNo0x.length < 64) {
    // Some failures return empty bytes; treat as 0
    return '0';
  }
  const word = hexNo0x.slice(0, 64);
  return BigInt(`0x${word}`).toString();
}

// =============================================================================
// MULTICALL CLIENT
// =============================================================================

export type MulticallClientConfig = {
  maxCallsPerBatch?: number;
  timeoutMs?: number;
};

/**
 * Client for batching RPC calls using Multicall3.
 * Falls back to individual calls on chains without Multicall3 support.
 */
export class MulticallClient {
  readonly #getProvider: GetProviderFunction;

  readonly #config: Required<MulticallClientConfig>;

  constructor(
    getProvider: GetProviderFunction,
    config?: MulticallClientConfig,
  ) {
    this.#getProvider = getProvider;
    // Use default values for invalid (non-positive) batch sizes to prevent
    // infinite loops or errors in divideIntoBatches
    const maxCallsPerBatch =
      config?.maxCallsPerBatch !== undefined && config.maxCallsPerBatch > 0
        ? config.maxCallsPerBatch
        : 300;
    const timeoutMs =
      config?.timeoutMs !== undefined && config.timeoutMs > 0
        ? config.timeoutMs
        : 30000;
    this.#config = {
      maxCallsPerBatch,
      timeoutMs,
    };
  }

  /**
   * Fetch ERC-20 and native token balances using Multicall3.
   * Falls back to individual RPC calls on unsupported chains.
   *
   * @param chainId - The chain ID.
   * @param requests - Array of balance requests.
   * @returns Array of balance responses.
   */
  async batchBalanceOf(
    chainId: ChainId,
    requests: BalanceOfRequest[],
  ): Promise<BalanceOfResponse[]> {
    if (requests.length === 0) {
      return [];
    }

    const multicallAddress = MULTICALL3_ADDRESS_BY_CHAIN[chainId];
    const provider = this.#getProvider(chainId);

    // If Multicall3 is not supported, fall back to individual calls
    if (!multicallAddress) {
      return this.#fallbackBatchBalanceOf(provider, requests);
    }

    // Use Multicall3
    return this.#multicallBatchBalanceOf(provider, multicallAddress, requests);
  }

  /**
   * Fetch balances using Multicall3 aggregate3.
   *
   * @param provider - The RPC provider.
   * @param multicallAddress - The Multicall3 contract address.
   * @param requests - Array of balance requests.
   * @returns Array of balance responses.
   */
  async #multicallBatchBalanceOf(
    provider: Provider,
    multicallAddress: Hex,
    requests: BalanceOfRequest[],
  ): Promise<BalanceOfResponse[]> {
    const batchSize = this.#config.maxCallsPerBatch;

    const responses = await reduceInBatchesSerially<
      BalanceOfRequest,
      BalanceOfResponse[]
    >({
      values: requests,
      batchSize,
      initialResult: [],
      eachBatch: async (workingResult, batch) => {
        try {
          // Build aggregate3 calls
          const calls = batch.map((req) => {
            const isNative = req.tokenAddress === ZERO_ADDRESS;
            const target = isNative ? multicallAddress : req.tokenAddress;
            return {
              target,
              allowFailure: true,
              callData: isNative
                ? encodeGetEthBalance(req.accountAddress)
                : encodeBalanceOf(req.accountAddress),
            };
          });

          // Encode and send aggregate3 call
          const callData = encodeAggregate3(calls);
          const result = await provider.call({
            to: multicallAddress,
            data: callData,
          });

          // Decode response
          const decoded = decodeAggregate3Response(result as Hex, batch.length);

          // Map results back to responses
          for (let i = 0; i < batch.length; i++) {
            const { tokenAddress, accountAddress } = batch[i];
            const { success, returnData } = decoded[i];

            if (success && returnData && returnData.length > 2) {
              workingResult.push({
                tokenAddress,
                accountAddress,
                success: true,
                balance: decodeUint256(returnData),
              });
            } else {
              workingResult.push({
                tokenAddress,
                accountAddress,
                success: false,
              });
            }
          }
        } catch {
          // On aggregate3 error, fall back to individual calls for this batch.
          // #fetchSingleBalance never rejects - it catches all errors internally
          // and returns a failed response, so we use Promise.all here.
          const fallbackResults = await Promise.all(
            batch.map((req) => this.#fetchSingleBalance(provider, req)),
          );

          for (const result of fallbackResults) {
            workingResult.push(result);
          }
        }

        return workingResult;
      },
    });

    return responses;
  }

  /**
   * Fallback: fetch balances using individual RPC calls.
   *
   * @param provider - The RPC provider.
   * @param requests - Array of balance requests.
   * @returns Array of balance responses.
   */
  async #fallbackBatchBalanceOf(
    provider: Provider,
    requests: BalanceOfRequest[],
  ): Promise<BalanceOfResponse[]> {
    // Use smaller batch size for parallel individual calls to avoid overwhelming RPC
    const batchSize = Math.min(this.#config.maxCallsPerBatch, 50);

    const responses = await reduceInBatchesSerially<
      BalanceOfRequest,
      BalanceOfResponse[]
    >({
      values: requests,
      batchSize,
      initialResult: [],
      eachBatch: async (workingResult, batch) => {
        // #fetchSingleBalance never rejects - it catches all errors internally
        // and returns a failed response, so we use Promise.all here.
        const batchResults = await Promise.all(
          batch.map((req) => this.#fetchSingleBalance(provider, req)),
        );

        for (const result of batchResults) {
          workingResult.push(result);
        }

        return workingResult;
      },
    });

    return responses;
  }

  /**
   * Fetch a single token balance (fallback method).
   *
   * @param provider - The RPC provider.
   * @param request - The balance request.
   * @returns The balance response.
   */
  async #fetchSingleBalance(
    provider: Provider,
    request: BalanceOfRequest,
  ): Promise<BalanceOfResponse> {
    // Destructure inside try block to ensure any errors are caught
    // and don't cause promise rejections that bypass error handling
    try {
      const { tokenAddress, accountAddress } = request;

      // Native token (zero address)
      if (tokenAddress === ZERO_ADDRESS) {
        const balance = await provider.getBalance(accountAddress);
        return {
          tokenAddress,
          accountAddress,
          success: true,
          balance: balance.toString(),
        };
      }

      // ERC-20 token
      const callData = encodeBalanceOf(accountAddress);
      const result = await provider.call({
        to: tokenAddress,
        data: callData,
      });

      const balance = decodeUint256(result as Hex);
      return {
        tokenAddress,
        accountAddress,
        success: true,
        balance,
      };
    } catch {
      return {
        tokenAddress: request.tokenAddress,
        accountAddress: request.accountAddress,
        success: false,
      };
    }
  }
}
