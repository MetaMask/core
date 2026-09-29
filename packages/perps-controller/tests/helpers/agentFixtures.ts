import type { PerpsTypedDataPayload } from '../../src/types/index.js';
import { createMockEvmAccount } from './serviceMocks.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/** An agent address that is not the mock main account. */
export const AGENT_ADDRESS =
  '0x00000000000000000000000000000000000a9e17' as const;

/**
 * A user-signed action as the HyperLiquid SDK builds it (the
 * HyperliquidSignTransaction domain), for the mock main account.
 */
export const USER_SIGNED_PAYLOAD: PerpsTypedDataPayload = {
  domain: {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: 1,
    verifyingContract: ZERO_ADDRESS,
  },
  types: {
    'HyperliquidTransaction:UserSetAbstraction': [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'user', type: 'address' },
      { name: 'abstraction', type: 'string' },
      { name: 'nonce', type: 'uint64' },
    ],
  },
  primaryType: 'HyperliquidTransaction:UserSetAbstraction',
  message: {
    hyperliquidChain: 'Mainnet',
    user: createMockEvmAccount().address,
    abstraction: 'unifiedAccount',
    nonce: 1,
  },
};

/** An L1 action as the HyperLiquid SDK builds it (the Exchange domain). */
export const L1_PAYLOAD: PerpsTypedDataPayload = {
  domain: {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: ZERO_ADDRESS,
  },
  types: {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  },
  primaryType: 'Agent',
  message: { source: 'a', connectionId: `0x${'22'.repeat(32)}` },
};
