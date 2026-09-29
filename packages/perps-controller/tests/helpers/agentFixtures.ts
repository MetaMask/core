import type { PerpsTypedDataPayload } from '../../src/types/index.js';
import { createMockEvmAccount } from './serviceMocks.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// The SDK adds the domain type to every payload it signs.
const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

/** An agent address that is not the mock main account. */
export const AGENT_ADDRESS =
  '0x00000000000000000000000000000000000a9e17' as const;

/** A second agent address, for rebinding and rejection cases. */
export const OTHER_AGENT_ADDRESS =
  '0x00000000000000000000000000000000000b0a7d' as const;

/** A signature from the main account. */
export const MAIN_SIGNATURE = `0x${'cd'.repeat(65)}` as const;

/** A signature from an agent. */
export const AGENT_SIGNATURE = `0x${'ef'.repeat(65)}` as const;

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
    EIP712Domain: EIP712_DOMAIN_TYPE,
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
    EIP712Domain: EIP712_DOMAIN_TYPE,
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  },
  primaryType: 'Agent',
  message: { source: 'a', connectionId: `0x${'22'.repeat(32)}` },
};

/**
 * An order as HyperLiquid's `frontendOpenOrders` returns it.
 *
 * @param overrides - Fields that differ from a resting BTC limit buy.
 * @returns The open order.
 */
export function createFrontendOpenOrder(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    coin: 'BTC',
    side: 'B',
    limitPx: '49000',
    sz: '0.1',
    origSz: '0.1',
    oid: 123,
    timestamp: 1,
    orderType: 'Limit',
    tif: 'Gtc',
    isTrigger: false,
    triggerPx: '0',
    triggerCondition: 'N/A',
    reduceOnly: false,
    isPositionTpsl: false,
    cloid: null,
    children: [],
    ...overrides,
  };
}
