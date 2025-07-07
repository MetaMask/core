import { Contract } from '@ethersproject/contracts';
import type { Web3Provider } from '@ethersproject/providers';
import type { Hex } from '@metamask/utils';

import { reduceInBatchesSerially } from './assetsUtil';

// https://github.com/mds1/multicall/blob/main/deployments.json
const MULTICALL_CONTRACT_BY_CHAINID = {
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
} as Record<Hex, Hex>;

const multicallAbi = [
  {
    name: 'tryAggregate',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'requireSuccess', type: 'bool' },
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
];

type Call = {
  contract: Contract;
  functionSignature: string;
  arguments: unknown[];
};

export type MulticallResult = { success: boolean; value: unknown };

const multicall = async (
  calls: Call[],
  multicallAddress: Hex,
  provider: Web3Provider,
  maxCallsPerMulticall: number,
): Promise<MulticallResult[]> => {
  const multicallContract = new Contract(
    multicallAddress,
    multicallAbi,
    provider,
  );

  return await reduceInBatchesSerially<Call, MulticallResult[]>({
    values: calls,
    batchSize: maxCallsPerMulticall,
    initialResult: [],
    eachBatch: async (workingResult, batch) => {
      const calldata = batch.map((call) => ({
        target: call.contract.address,
        callData: call.contract.interface.encodeFunctionData(
          call.contract.interface.functions[call.functionSignature],
          call.arguments,
        ),
      }));

      const results = await multicallContract.callStatic.tryAggregate(
        false,
        calldata,
      );

      return [
        ...workingResult,
        ...results.map(
          (r: { success: boolean; returnData: string }, i: number) => ({
            success: r.success,
            value: r.success
              ? batch[i].contract.interface.decodeFunctionResult(
                  batch[i].functionSignature,
                  r.returnData,
                )[0]
              : undefined,
          }),
        ),
      ];
    },
  });
};

const fallback = async (
  calls: Call[],
  maxCallsParallel: number,
): Promise<MulticallResult[]> => {
  return await reduceInBatchesSerially<Call, MulticallResult[]>({
    values: calls,
    batchSize: maxCallsParallel,
    initialResult: [],
    eachBatch: async (workingResult, batch) => {
      const results = await Promise.allSettled(
        batch.map((call) =>
          call.contract[call.functionSignature](...call.arguments),
        ),
      );
      return [
        ...workingResult,
        ...results.map((p) => ({
          success: p.status === 'fulfilled',
          value: p.status === 'fulfilled' ? p.value : undefined,
        })),
      ];
    },
  });
};

/**
 * Executes an array of contract calls. If the chain supports multicalls,
 * the calls will be executed in single RPC requests (up to maxCallsPerMulticall).
 * Otherwise the calls will be executed separately in parallel (up to maxCallsParallel).
 * @param calls - An array of contract calls to execute.
 * @param chainId - The hexadecimal chain id.
 * @param provider - An ethers rpc provider.
 * @param maxCallsPerMulticall - If multicall is supported, the maximum number of calls to exeute in each multicall.
 * @param maxCallsParallel - If multicall is not supported, the maximum number of calls to execute in parallel.
 * @returns An array of results, with a success boolean and value for each call.
 */
export const multicallOrFallback = async (
  calls: Call[],
  chainId: Hex,
  provider: Web3Provider,
  maxCallsPerMulticall = 300,
  maxCallsParallel = 20,
): Promise<MulticallResult[]> => {
  if (calls.length === 0) {
    return [];
  }

  const multicallAddress = MULTICALL_CONTRACT_BY_CHAINID[chainId];
  if (multicallAddress) {
    try {
      return await multicall(
        calls,
        multicallAddress,
        provider,
        maxCallsPerMulticall,
      );
    } catch (error: unknown) {
      // Fallback only on revert
      // https://docs.ethers.org/v5/troubleshooting/errors/#help-CALL_EXCEPTION
      if (
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 'CALL_EXCEPTION'
      ) {
        throw error;
      }
    }
  }

  return await fallback(calls, maxCallsParallel);
};
