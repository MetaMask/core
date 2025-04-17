export const CHAIN_IDS = {
  MAINNET: '0x1',
  GOERLI: '0x5',
  BASE: '0x2105',
  BASE_TESTNET: '0x14a33',
  BSC: '0x38',
  BSC_TESTNET: '0x61',
  OPTIMISM: '0xa',
  OPTIMISM_TESTNET: '0x1a4',
  OPBNB: '0xcc',
  OPBNB_TESTNET: '0x15eb',
  OPTIMISM_SEPOLIA: '0xaa37dc',
  POLYGON: '0x89',
  POLYGON_TESTNET: '0x13881',
  AVALANCHE: '0xa86a',
  AVALANCHE_TESTNET: '0xa869',
  FANTOM: '0xfa',
  FANTOM_TESTNET: '0xfa2',
  SEPOLIA: '0xaa36a7',
  LINEA_GOERLI: '0xe704',
  LINEA_SEPOLIA: '0xe705',
  LINEA_MAINNET: '0xe708',
  MOONBEAM: '0x504',
  MOONBEAM_TESTNET: '0x507',
  MOONRIVER: '0x505',
  GNOSIS: '0x64',
  ARBITRUM: '0xa4b1',
  ZKSYNC_ERA: '0x144',
  ZORA: '0x76adf1',
  SCROLL: '0x82750',
  SCROLL_SEPOLIA: '0x8274f',
  MEGAETH_TESTNET: '0x18c6',
} as const;

/** Extract of the Wrapped ERC-20 ABI required for simulation. */
export const ABI_SIMULATION_ERC20_WRAPPED = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'to', type: 'address' },
      { indexed: false, name: 'wad', type: 'uint256' },
    ],
    name: 'Deposit',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: false, name: 'wad', type: 'uint256' },
    ],
    name: 'Withdrawal',
    type: 'event',
  },
];

/** Extract of the legacy ERC-721 ABI required for simulation. */
export const ABI_SIMULATION_ERC721_LEGACY = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        name: '_from',
        type: 'address',
      },
      {
        indexed: false,
        name: '_to',
        type: 'address',
      },
      {
        indexed: false,
        name: '_tokenId',
        type: 'uint256',
      },
    ],
    name: 'Transfer',
    type: 'event',
  },
];

export const ABI_IERC7821 = [
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'mode', type: 'bytes32', internalType: 'ModeCode' },
      { name: 'executionData', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'supportsExecutionMode',
    inputs: [{ name: 'mode', type: 'bytes32', internalType: 'ModeCode' }],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
];
