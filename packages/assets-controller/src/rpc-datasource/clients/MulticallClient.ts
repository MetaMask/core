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
// CONSTANTS
// =============================================================================

/**
 * Zero address constant for native token.
 */
const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;

/**
 * ERC-20 balanceOf function selector: keccak256("balanceOf(address)").slice(0, 10)
 */
const BALANCE_OF_SELECTOR = '0x70a08231';

/**
 * Multicall3 aggregate3 function selector: keccak256("aggregate3((address,bool,bytes)[])").slice(0, 10)
 */
const AGGREGATE3_SELECTOR = '0x82ad56cb';

/**
 * Multicall3 getEthBalance function selector: keccak256("getEthBalance(address)").slice(0, 10)
 */
const GET_ETH_BALANCE_SELECTOR = '0x4d2301cc';

/**
 * Multicall3 contract addresses by chain ID.
 * Source: https://github.com/mds1/multicall/blob/main/deployments.json
 * Also from: packages/assets-controllers/src/multicall.ts
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
// ENCODING/DECODING UTILITIES
// =============================================================================

/**
 * Pad an address to 32 bytes (64 hex chars).
 *
 * @param address - The address to pad.
 * @returns The padded address.
 */
function padAddress(address: Address): string {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

/**
 * Encode a balanceOf call for an ERC-20 token.
 *
 * @param accountAddress - The account address.
 * @returns The encoded call data.
 */
function encodeBalanceOf(accountAddress: Address): Hex {
  return `${BALANCE_OF_SELECTOR}${padAddress(accountAddress)}` as Hex;
}

/**
 * Encode a getEthBalance call for native token.
 *
 * @param accountAddress - The account address.
 * @returns The encoded call data.
 */
function encodeGetEthBalance(accountAddress: Address): Hex {
  return `${GET_ETH_BALANCE_SELECTOR}${padAddress(accountAddress)}` as Hex;
}

/**
 * Encode an aggregate3 call.
 * aggregate3 signature: aggregate3((address target, bool allowFailure, bytes callData)[])
 *
 * @param calls - Array of calls with target, allowFailure, and callData.
 * @returns The encoded aggregate3 call data.
 */
function encodeAggregate3(
  calls: { target: Address; allowFailure: boolean; callData: Hex }[],
): Hex {
  // Offset to calls array (always 32 bytes = 0x20)
  const offsetHexStr =
    '0000000000000000000000000000000000000000000000000000000000000020';

  // Number of calls
  const callCountHexStr = calls.length.toString(16).padStart(64, '0');

  // Calculate offsets for each call's dynamic data
  // Each call struct has: target (32 bytes) + allowFailure (32 bytes) + offset to callData (32 bytes) = 96 bytes
  const headerSize = calls.length * 96; // 96 bytes per call header

  // Build call headers and data
  let callDataOffset = headerSize;
  const headers: string[] = [];
  const callDatas: string[] = [];

  for (const call of calls) {
    // target (address, left-padded to 32 bytes)
    headers.push(padAddress(call.target));

    // allowFailure (bool, 32 bytes)
    const allowFailureStr = call.allowFailure
      ? `${'0'.repeat(63)}1`
      : '0'.repeat(64);
    headers.push(allowFailureStr);

    // offset to callData (relative to start of this call struct array)
    headers.push(callDataOffset.toString(16).padStart(64, '0'));

    // Prepare callData (length + data, padded to 32 bytes)
    const dataWithoutPrefix = call.callData.slice(2);
    const dataLength = dataWithoutPrefix.length / 2;
    const lengthHexStr = dataLength.toString(16).padStart(64, '0');
    const paddedData = dataWithoutPrefix.padEnd(
      Math.ceil(dataWithoutPrefix.length / 64) * 64,
      '0',
    );

    callDatas.push(`${lengthHexStr}${paddedData}`);
    callDataOffset += 32 + paddedData.length / 2; // length (32 bytes) + padded data
  }

  return `${AGGREGATE3_SELECTOR}${offsetHexStr}${callCountHexStr}${headers.join('')}${callDatas.join('')}` as Hex;
}

/**
 * Decode the response from aggregate3.
 * Returns array of (success, returnData) tuples.
 *
 * @param data - The raw response data.
 * @param callCount - Number of calls made.
 * @returns Array of success and return data.
 */
function decodeAggregate3Response(
  data: Hex,
  callCount: number,
): { success: boolean; returnData: Hex }[] {
  const rawHex = data.startsWith('0x') ? data.slice(2) : data;

  // Skip the offset to the array (first 32 bytes = 64 hex chars)
  let pos = 64;

  // Read array length (should match callCount)
  const arrayLength = parseInt(rawHex.slice(pos, pos + 64), 16);
  pos += 64;

  if (arrayLength !== callCount) {
    throw new Error(`Expected ${callCount} results, got ${arrayLength}`);
  }

  // Read offsets for each result tuple
  const offsets: number[] = [];
  for (let i = 0; i < callCount; i++) {
    const offset = parseInt(rawHex.slice(pos, pos + 64), 16);
    offsets.push(offset);
    pos += 64;
  }

  // The base position for offset calculations (after array length, at start of offsets)
  const basePos = 64; // After the initial offset to array

  const results: { success: boolean; returnData: Hex }[] = [];

  for (let i = 0; i < callCount; i++) {
    // Calculate absolute position: base + offset to array + offset to this tuple
    const tuplePos = (basePos + 64 + offsets[i]) * 2; // *2 because hex chars

    // Read success (bool, 32 bytes)
    const successHexStr = rawHex.slice(tuplePos, tuplePos + 64);
    const success = parseInt(successHexStr, 16) !== 0;

    // Read offset to returnData (32 bytes)
    const returnDataOffset = parseInt(
      rawHex.slice(tuplePos + 64, tuplePos + 128),
      16,
    );

    // Calculate position of returnData
    const returnDataPos = tuplePos + returnDataOffset * 2;

    // Read returnData length (32 bytes)
    const returnDataLength = parseInt(
      rawHex.slice(returnDataPos, returnDataPos + 64),
      16,
    );

    // Read returnData
    const returnData: Hex = `0x${rawHex.slice(
      returnDataPos + 64,
      returnDataPos + 64 + returnDataLength * 2,
    )}`;

    results.push({ success, returnData });
  }

  return results;
}

/**
 * Decode a uint256 from hex data.
 *
 * @param data - The hex data.
 * @returns The decoded value as a string.
 */
function decodeUint256(data: Hex): string {
  const hexData = data.startsWith('0x') ? data.slice(2) : data;
  if (hexData.length === 0) {
    return '0';
  }
  // Take first 64 chars (32 bytes) for uint256
  const normalizedHex = hexData.length > 64 ? hexData.slice(0, 64) : hexData;
  return BigInt(`0x${normalizedHex}`).toString();
}

// =============================================================================
// TYPES
// =============================================================================

export type MulticallClientConfig = {
  maxCallsPerBatch?: number;
  timeoutMs?: number;
};

// =============================================================================
// MULTICALL CLIENT
// =============================================================================

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
    this.#config = {
      maxCallsPerBatch: config?.maxCallsPerBatch ?? 300,
      timeoutMs: config?.timeoutMs ?? 30000,
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
          // On error, mark all requests in batch as failed
          for (const req of batch) {
            workingResult.push({
              tokenAddress: req.tokenAddress,
              accountAddress: req.accountAddress,
              success: false,
            });
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
    const batchSize = this.#config.maxCallsPerBatch;

    const responses = await reduceInBatchesSerially<
      BalanceOfRequest,
      BalanceOfResponse[]
    >({
      values: requests,
      batchSize,
      initialResult: [],
      eachBatch: async (workingResult, batch) => {
        const batchResults = await Promise.allSettled(
          batch.map((req) => this.#fetchSingleBalance(provider, req)),
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            workingResult.push(result.value);
          }
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
    const { tokenAddress, accountAddress } = request;

    try {
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
        tokenAddress,
        accountAddress,
        success: false,
      };
    }
  }
}
