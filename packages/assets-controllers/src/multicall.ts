import { Contract } from '@ethersproject/contracts';
import type { Web3Provider } from '@ethersproject/providers';
import type { Hex } from '@metamask/utils';
import BN from 'bn.js';

import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from './AssetsContractController';
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
  // Rootstock, bytecode OK and referenced as "RSK" in https://www.multicall3.com/deployments
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
  // HyperEVM (999)
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
  '0x15b32': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x45c': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x45b': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3d': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x41a6ace': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Etherlink mainnet, bytecode OK and referenced in https://www.multicall3.com/deployments
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
  // BOB, bytecode OK and referenced in https://www.multicall3.com/deployments
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
  // Injective, contract found but not in multicall3 repo
  '0x6f0': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Hemi, contract found but not in multicall3 repo
  '0xa867': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Plasma, contract found but not in multicall3 repo
  '0x2611': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Nonmia, contract found but not in multicall3 repo
  '0xa6': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // XRPL, contract found but not in multicall3 repo
  '0x15f900': '0x6B5eFbC0C82eBb26CA13a4F11836f36Fc6fdBC5D',
  // Soneium, contract found but not in multicall3 repo
  '0x74c': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Genesys, contract found but not in multicall3 repo
  '0x407b': '0x90a2377F233E3461BACa6080d4837837d8762927',
  // EDU (Animoca)
  '0xa3c3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Abstract
  '0xab5': '0xF9cda624FBC7e059355ce98a31693d299FACd963',
  // Berachain, contract found but not in multicall3 repo
  '0x138de': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // MegaETH TESTNET
  '0x18c6': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Apechain
  '0x8173': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Matchain, contract found but not in multicall3 repo
  '0x2ba': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Monad TESTNET
  '0x279f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Katana
  '0xb67d2': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Lens, contract found but not in multicall3 repo
  '0xe8': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Plume
  '0x18232': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // Monad Mainnet
  '0x8f': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // XDC, contract found but not in multicall3 repo
  '0x32': '0x0B1795ccA8E4eC4df02346a082df54D437F8D9aF',
  // MegaETH TESTNET v2 (timothy chain ID 6343)
  '0x18c7': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // MegaETH mainnet, contract found matching multicall3 bytecode
  '0x10e6': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // MSU (contract they deployed by their team for us)
  '0x10b3e': '0x99423C88EB5723A590b4C644426069042f137B9e',
  // INK Mainnet
  '0xdef1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  // CHZ.
  '0x15b38': '0x0E6a1Df694c4be9BFFC4D76f2B936bB1A1df7fAC',
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

// Multicall3 ABI for aggregate3 function
const multicall3Abi = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
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

export type Call = {
  contract: Contract;
  functionSignature: string;
  arguments: unknown[];
};

export type MulticallResult = { success: boolean; value: unknown };

export type Aggregate3Call = {
  target: string;
  allowFailure: boolean;
  callData: string;
};

export type Aggregate3Result = {
  success: boolean;
  returnData: string;
};

// Constants for encoded strings and addresses
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BALANCE_OF_FUNCTION = 'balanceOf(address)';
const GET_ETH_BALANCE_FUNCTION = 'getEthBalance';
const GET_SHARES_FUNCTION = 'getShares';
const CONVERT_TO_ASSETS_FUNCTION = 'convertToAssets';

// ERC20 balanceOf ABI
const ERC20_BALANCE_OF_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

// Multicall3 getEthBalance ABI
const MULTICALL3_GET_ETH_BALANCE_ABI = [
  {
    name: 'getEthBalance',
    type: 'function',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
  },
];

// Staking contract ABI with both getShares and convertToAssets
const STAKING_CONTRACT_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'getShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

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
 *
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

/**
 * Execute multiple contract calls using Multicall3's aggregate3 function.
 * This allows for more efficient batch calls with individual failure handling.
 *
 * @param calls - Array of calls to execute via aggregate3
 * @param chainId - The hexadecimal chain id
 * @param provider - An ethers rpc provider
 * @returns Promise resolving to array of results from aggregate3
 */
export const aggregate3 = async (
  calls: Aggregate3Call[],
  chainId: Hex,
  provider: Web3Provider,
): Promise<Aggregate3Result[]> => {
  if (calls.length === 0) {
    return [];
  }

  const multicall3Address = MULTICALL_CONTRACT_BY_CHAINID[chainId];
  const multicall3Contract = new Contract(
    multicall3Address,
    multicall3Abi,
    provider,
  );

  return await multicall3Contract.callStatic.aggregate3(calls);
};

/**
 * Processes and decodes balance results from aggregate3 calls
 *
 * @param results - Array of results from aggregate3 calls
 * @param callMapping - Array mapping call indices to token and user addresses
 * @param chainId - The hexadecimal chain id
 * @param provider - An ethers rpc provider
 * @param includeStaked - Whether to include staked balances
 * @returns Map of token address to map of user address to balance
 */
const processBalanceResults = (
  results: Aggregate3Result[],
  callMapping: {
    tokenAddress: string;
    userAddress: string;
    callType: 'erc20' | 'native' | 'staking';
  }[],
  chainId: Hex,
  provider: Web3Provider,
  includeStaked: boolean,
): {
  tokenBalances: Record<string, Record<string, BN>>;
  stakedBalances?: Record<string, BN>;
} => {
  const balanceMap: Record<string, Record<string, BN>> = {};
  const stakedBalanceMap: Record<string, BN> = {};

  // Create contract instances for decoding
  const erc20Contract = new Contract(
    ZERO_ADDRESS,
    ERC20_BALANCE_OF_ABI,
    provider,
  );

  const multicall3Address = MULTICALL_CONTRACT_BY_CHAINID[chainId];
  const multicall3Contract = new Contract(
    multicall3Address,
    MULTICALL3_GET_ETH_BALANCE_ABI,
    provider,
  );

  // Staking contracts are now handled separately in two-step process

  results.forEach((result, index) => {
    if (result.success) {
      const { tokenAddress, userAddress, callType } = callMapping[index];
      if (callType === 'native') {
        // For native token, decode the getEthBalance result
        const balanceRaw = multicall3Contract.interface.decodeFunctionResult(
          GET_ETH_BALANCE_FUNCTION,
          result.returnData,
        )[0];

        if (!balanceMap[tokenAddress]) {
          balanceMap[tokenAddress] = {};
        }
        balanceMap[tokenAddress][userAddress] = new BN(balanceRaw.toString());
      } else if (callType === 'staking') {
        // Staking is now handled separately in two-step process
        // This case should not occur anymore
        console.warn(
          'Staking callType found in main processing - this should not happen',
        );
      } else {
        // For ERC20 tokens, decode the balanceOf result
        const balanceRaw = erc20Contract.interface.decodeFunctionResult(
          BALANCE_OF_FUNCTION,
          result.returnData,
        )[0];

        if (!balanceMap[tokenAddress]) {
          balanceMap[tokenAddress] = {};
        }
        balanceMap[tokenAddress][userAddress] = new BN(balanceRaw.toString());
      }
    }
  });

  const result: {
    tokenBalances: Record<string, Record<string, BN>>;
    stakedBalances?: Record<string, BN>;
  } = { tokenBalances: balanceMap };

  if (includeStaked && Object.keys(stakedBalanceMap).length > 0) {
    result.stakedBalances = stakedBalanceMap;
  }

  return result;
};

/**
 * Fallback function to get native token balances using individual eth_getBalance calls
 * when Multicall3 is not supported on the chain.
 *
 * @param userAddresses - Array of user addresses to check balances for
 * @param provider - An ethers rpc provider
 * @param maxCallsParallel - Maximum number of parallel calls (default: 20)
 * @returns Promise resolving to map of user address to balance
 */
const getNativeBalancesFallback = async (
  userAddresses: string[],
  provider: Web3Provider,
  maxCallsParallel = 20,
): Promise<Record<string, BN>> => {
  const balanceMap: Record<string, BN> = {};

  await reduceInBatchesSerially<string, void>({
    values: userAddresses,
    batchSize: maxCallsParallel,
    initialResult: undefined,
    eachBatch: async (_, batch) => {
      const results = await Promise.allSettled(
        batch.map(async (userAddress) => {
          const balance = await provider.getBalance(userAddress);
          return {
            success: true,
            balance: new BN(balance.toString()),
            userAddress,
          };
        }),
      );

      results.forEach((result) => {
        if (
          result.status === 'fulfilled' &&
          result.value.success &&
          result.value.balance !== null
        ) {
          balanceMap[result.value.userAddress] = result.value.balance;
        }
      });
    },
  });

  return balanceMap;
};

/**
 * Fallback function to get token balances using individual calls
 * when Multicall3 is not supported or when aggregate3 calls fail.
 *
 * @param tokenAddresses - Array of ERC20 token contract addresses
 * @param userAddresses - Array of user addresses to check balances for
 * @param provider - An ethers rpc provider
 * @param includeNative - Whether to include native token balances (default: true)
 * @param maxCallsParallel - Maximum number of parallel calls (default: 20)
 * @returns Promise resolving to map of token address to map of user address to balance
 */
const getTokenBalancesFallback = async (
  tokenAddresses: string[],
  userAddresses: string[],
  provider: Web3Provider,
  includeNative: boolean,
  maxCallsParallel: number,
): Promise<Record<string, Record<string, BN>>> => {
  const balanceMap: Record<string, Record<string, BN>> = {};

  // Handle ERC20 token balances using the existing fallback function
  if (tokenAddresses.length > 0) {
    const erc20Calls: Call[] = [];
    const callMapping: { tokenAddress: string; userAddress: string }[] = [];

    tokenAddresses.forEach((tokenAddress) => {
      userAddresses.forEach((userAddress) => {
        const contract = new Contract(
          tokenAddress,
          ERC20_BALANCE_OF_ABI,
          provider,
        );
        erc20Calls.push({
          contract,
          functionSignature: BALANCE_OF_FUNCTION,
          arguments: [userAddress],
        });
        callMapping.push({ tokenAddress, userAddress });
      });
    });

    const erc20Results = await fallback(erc20Calls, maxCallsParallel);
    erc20Results.forEach((result, index) => {
      if (result.success) {
        const { tokenAddress, userAddress } = callMapping[index];
        if (!balanceMap[tokenAddress]) {
          balanceMap[tokenAddress] = {};
        }
        balanceMap[tokenAddress][userAddress] = result.value as BN;
      }
    });
  }

  // Handle native token balances using the native fallback function
  if (includeNative) {
    const nativeBalances = await getNativeBalancesFallback(
      userAddresses,
      provider,
      maxCallsParallel,
    );
    if (Object.keys(nativeBalances).length > 0) {
      balanceMap[ZERO_ADDRESS] = nativeBalances;
    }
  }

  return balanceMap;
};

/**
 * Fallback function to get staked balances using individual calls
 * when Multicall3 is not supported or when aggregate3 calls fail.
 *
 * @param userAddresses - Array of user addresses to check staked balances for
 * @param chainId - The hexadecimal chain id
 * @param provider - An ethers rpc provider
 * @param maxCallsParallel - Maximum number of parallel calls (default: 20)
 * @returns Promise resolving to map of user address to staked balance
 */
const getStakedBalancesFallback = async (
  userAddresses: string[],
  chainId: Hex,
  provider: Web3Provider,
  maxCallsParallel: number,
): Promise<Record<string, BN>> => {
  const stakedBalanceMap: Record<string, BN> = {};

  const stakingContractAddress = STAKING_CONTRACT_ADDRESS_BY_CHAINID[chainId];

  if (!stakingContractAddress) {
    // No staking support for this chain
    return stakedBalanceMap;
  }

  const stakingCalls: Call[] = [];
  const callMapping: { userAddress: string }[] = [];

  userAddresses.forEach((userAddress) => {
    const contract = new Contract(
      stakingContractAddress,
      STAKING_CONTRACT_ABI,
      provider,
    );
    stakingCalls.push({
      contract,
      functionSignature: GET_SHARES_FUNCTION,
      arguments: [userAddress],
    });
    callMapping.push({ userAddress });
  });

  const stakingResults = await fallback(stakingCalls, maxCallsParallel);
  stakingResults.forEach((result, index) => {
    if (result.success) {
      const { userAddress } = callMapping[index];
      stakedBalanceMap[userAddress] = result.value as BN;
    }
  });

  return stakedBalanceMap;
};

/**
 * Get staked balances for multiple addresses using two-step process:
 * 1. Get shares for all addresses
 * 2. Convert non-zero shares to assets
 *
 * @param userAddresses - Array of user addresses to check
 * @param chainId - Chain ID as hex string
 * @param provider - Ethers provider
 * @returns Promise resolving to map of user address to staked balance
 */
export const getStakedBalancesForAddresses = async (
  userAddresses: string[],
  chainId: Hex,
  provider: Web3Provider,
): Promise<Record<string, BN>> => {
  const stakingContractAddress = STAKING_CONTRACT_ADDRESS_BY_CHAINID[chainId];

  if (!stakingContractAddress) {
    return {};
  }

  const stakingContract = new Contract(
    stakingContractAddress,
    STAKING_CONTRACT_ABI,
    provider,
  );

  try {
    // Step 1: Get shares for all addresses
    const shareCalls: Aggregate3Call[] = userAddresses.map((userAddress) => ({
      target: stakingContractAddress,
      allowFailure: true,
      callData: stakingContract.interface.encodeFunctionData(
        GET_SHARES_FUNCTION,
        [userAddress],
      ),
    }));

    const shareResults = await aggregate3(shareCalls, chainId, provider);

    // Step 2: For addresses with non-zero shares, convert to assets
    const nonZeroSharesData: { address: string; shares: BN }[] = [];
    shareResults.forEach((result, index) => {
      if (result.success) {
        const sharesRaw = stakingContract.interface.decodeFunctionResult(
          GET_SHARES_FUNCTION,
          result.returnData,
        )[0];
        const shares = new BN(sharesRaw.toString());

        if (shares.gt(new BN(0))) {
          nonZeroSharesData.push({
            address: userAddresses[index],
            shares,
          });
        }
      }
    });

    if (nonZeroSharesData.length === 0) {
      return {};
    }

    // Step 3: Convert shares to assets for addresses with non-zero shares
    const assetCalls: Aggregate3Call[] = nonZeroSharesData.map(
      ({ shares }) => ({
        target: stakingContractAddress,
        allowFailure: true,
        callData: stakingContract.interface.encodeFunctionData(
          CONVERT_TO_ASSETS_FUNCTION,
          [shares.toString()],
        ),
      }),
    );

    const assetResults = await aggregate3(assetCalls, chainId, provider);

    // Step 4: Build final result mapping
    const result: Record<string, BN> = {};
    assetResults.forEach((assetResult, index) => {
      if (assetResult.success) {
        const assetsRaw = stakingContract.interface.decodeFunctionResult(
          CONVERT_TO_ASSETS_FUNCTION,
          assetResult.returnData,
        )[0];
        const assets = new BN(assetsRaw.toString());

        const { address } = nonZeroSharesData[index];
        result[address] = assets;
      }
    });

    return result;
  } catch (error) {
    console.error('Error fetching staked balances:', error);
    return {};
  }
};

/**
 * Get token balances (both ERC20 and native) for multiple addresses using aggregate3.
 * This is more efficient than individual balanceOf calls for multiple addresses and tokens.
 * Native token balances are mapped to the zero address (0x0000000000000000000000000000000000000000).
 *
 * @param accountTokenGroups - Array of objects containing account addresses and their associated token addresses
 * @param chainId - The hexadecimal chain id
 * @param provider - An ethers rpc provider
 * @param includeNative - Whether to include native token balances (default: true)
 * @param includeStaked - Whether to include staked balances from supported staking contracts (default: false)
 * @returns Promise resolving to object containing tokenBalances map and optional stakedBalances map
 */
export const getTokenBalancesForMultipleAddresses = async (
  accountTokenGroups: { accountAddress: Hex; tokenAddresses: Hex[] }[],
  chainId: Hex,
  provider: Web3Provider,
  includeNative: boolean,
  includeStaked: boolean,
): Promise<{
  tokenBalances: Record<string, Record<string, BN>>;
  stakedBalances?: Record<string, BN>;
}> => {
  // Return early if no groups provided
  if (accountTokenGroups.length === 0 && !includeNative && !includeStaked) {
    return { tokenBalances: {} };
  }

  // Extract unique token addresses and user addresses from groups
  const uniqueTokenAddresses = Array.from(
    new Set(accountTokenGroups.flatMap((group) => group.tokenAddresses)),
  ).filter((tokenAddress) => tokenAddress !== ZERO_ADDRESS); // Exclude native token from ERC20 calls

  const uniqueUserAddresses = Array.from(
    new Set(accountTokenGroups.map((group) => group.accountAddress)),
  );

  // Check if Multicall3 is supported on this chain
  if (!MULTICALL_CONTRACT_BY_CHAINID[chainId]) {
    // Fallback to individual balance calls when Multicall3 is not supported
    const tokenBalances = await getTokenBalancesFallback(
      uniqueTokenAddresses,
      uniqueUserAddresses,
      provider,
      includeNative,
      20,
    );

    const result: {
      tokenBalances: Record<string, Record<string, BN>>;
      stakedBalances?: Record<string, BN>;
    } = { tokenBalances };

    // Handle staked balances fallback if requested
    if (includeStaked) {
      const stakedBalances = await getStakedBalancesFallback(
        uniqueUserAddresses,
        chainId,
        provider,
        20,
      );

      if (Object.keys(stakedBalances).length > 0) {
        result.stakedBalances = stakedBalances;
      }
    }

    return result;
  }

  try {
    // Create calls directly from pairs
    const allCalls: Aggregate3Call[] = [];
    const allCallMapping: {
      tokenAddress: string;
      userAddress: string;
      callType: 'erc20' | 'native' | 'staking';
    }[] = [];

    // Create a temporary ERC20 contract for encoding
    const tempERC20Contract = new Contract(
      ZERO_ADDRESS,
      ERC20_BALANCE_OF_ABI,
      provider,
    );

    // Create ERC20 balance calls for all account-token combinations
    accountTokenGroups.forEach((group) => {
      group.tokenAddresses
        .filter((tokenAddress) => tokenAddress !== ZERO_ADDRESS)
        .forEach((tokenAddress) => {
          allCalls.push({
            target: tokenAddress,
            allowFailure: true,
            callData: tempERC20Contract.interface.encodeFunctionData(
              BALANCE_OF_FUNCTION,
              [group.accountAddress],
            ),
          });
          allCallMapping.push({
            tokenAddress,
            userAddress: group.accountAddress,
            callType: 'erc20',
          });
        });
    });

    // Add native token balance calls if requested
    if (includeNative) {
      const multicall3Address = MULTICALL_CONTRACT_BY_CHAINID[chainId];
      const multicall3TempContract = new Contract(
        multicall3Address,
        MULTICALL3_GET_ETH_BALANCE_ABI,
        provider,
      );

      uniqueUserAddresses.forEach((userAddress) => {
        allCalls.push({
          target: multicall3Address,
          allowFailure: true,
          callData: multicall3TempContract.interface.encodeFunctionData(
            GET_ETH_BALANCE_FUNCTION,
            [userAddress],
          ),
        });
        allCallMapping.push({
          tokenAddress: ZERO_ADDRESS,
          userAddress,
          callType: 'native',
        });
      });
    }

    // Note: Staking balances will be handled separately in two steps after token/native calls

    // Execute all calls in batches
    const maxCallsPerBatch = 300; // Limit calls per batch to avoid gas/size limits
    const allResults: Aggregate3Result[] = [];

    await reduceInBatchesSerially<Aggregate3Call, void>({
      values: allCalls,
      batchSize: maxCallsPerBatch,
      initialResult: undefined,
      eachBatch: async (_, batch) => {
        const batchResults = await aggregate3(batch, chainId, provider);
        allResults.push(...batchResults);
      },
    });

    // Handle staking balances in two steps if requested
    let stakedBalances: Record<string, BN> = {};
    if (includeStaked) {
      stakedBalances = await getStakedBalancesForAddresses(
        uniqueUserAddresses,
        chainId,
        provider,
      );
    }

    // Process and return results
    const result = processBalanceResults(
      allResults,
      allCallMapping,
      chainId,
      provider,
      false, // Don't include staked from main processing
    );

    // Add staked balances to result
    if (includeStaked && Object.keys(stakedBalances).length > 0) {
      result.stakedBalances = stakedBalances;
    }

    return result;
  } catch (error) {
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

    // Fallback to individual balance calls when aggregate3 fails
    const tokenBalances = await getTokenBalancesFallback(
      uniqueTokenAddresses,
      uniqueUserAddresses,
      provider,
      includeNative,
      20,
    );

    const result: {
      tokenBalances: Record<string, Record<string, BN>>;
      stakedBalances?: Record<string, BN>;
    } = { tokenBalances };

    // Handle staked balances fallback if requested
    if (includeStaked) {
      const stakedBalances = await getStakedBalancesFallback(
        uniqueUserAddresses,
        chainId,
        provider,
        20,
      );

      if (Object.keys(stakedBalances).length > 0) {
        result.stakedBalances = stakedBalances;
      }
    }

    return result;
  }
};
