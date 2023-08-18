import type { Hex } from '@metamask/utils';

import { BuiltInNetworkName, ChainId } from './types';

const SWAPS_TESTNET_CHAIN_ID = '0x539';

// An address that the metaswap-api recognizes as the default token for the current network,
// in place of the token address that ERC-20 tokens have
const DEFAULT_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

interface SwapsTokenObject {
  /**
   * The name for the network
   */
  name: string;
  /**
   * An address that the metaswap-api recognizes as the default token
   */
  address: string;
}

const ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
} as const;

const TEST_ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Test Ether',
  address: DEFAULT_TOKEN_ADDRESS,
} as const;

const GOERLI_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
} as const;

export const SWAPS_CHAINID_DEFAULT_TOKEN_MAP: {
  [key: Hex]: SwapsTokenObject;
} = {
  [SWAPS_TESTNET_CHAIN_ID]: TEST_ETH_SWAPS_TOKEN_OBJECT,
  [ChainId[BuiltInNetworkName.Mainnet]]: ETH_SWAPS_TOKEN_OBJECT,
  [ChainId[BuiltInNetworkName.Goerli]]: GOERLI_SWAPS_TOKEN_OBJECT,
};
