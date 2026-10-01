import {
  LIGHTER_MIN_TRADING_API_KEY_INDEX,
  LIGHTER_MAX_TRADING_API_KEY_INDEX,
  LIGHTER_TRADING_API_KEY_COUNT,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_TIMEOUT_MS,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_POLL_MS,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_MAX_ATTEMPTS,
  LIGHTER_FILL_REPLAY_LIMIT,
} from '../src/constants/index.js';
// Checks the account-signer and agent surface through the package entrypoint,
// the way a client imports it, so a dropped or renamed export fails here.
import {
  HYPERLIQUID_L1_ACTION_DOMAIN_NAME,
  HYPERLIQUID_L1_ACTION_PRIMARY_TYPE,
  PerpsController,
} from '../src/index.js';
import type {
  PerpsAccountSigner,
  PerpsAgentAccount,
  PerpsAgentSigner,
  PerpsControllerClearAgentSignersAction,
  PerpsControllerPrepareTradingWalletAction,
  PerpsControllerSetAgentSignerAction,
  PerpsTypedDataPayload,
  PerpsRecoveredDispatch,
  PerpsControllerGetRecoveredDispatchesAction,
  PerpsControllerAcknowledgeRecoveredDispatchAction,
} from '../src/index.js';

// The SDK ships ES modules only, which Jest cannot load below Node 24.9; the
// entrypoint only needs its error class to be defined.
jest.mock('@nktkas/hyperliquid', () => ({
  HyperliquidError: class MockHyperliquidError extends Error {},
}));

describe('@metamask/perps-controller public API', () => {
  it('exports backward-compatible recovery types and the trading configuration constants', () => {
    const legacy: PerpsRecoveredDispatch = {
      recoveryId: 'opaque-id',
      kind: 13,
      intent: 'withdraw',
      txHash: null,
      outcome: 'unknown',
      evidence: 'rest-advance',
    };
    const pending: PerpsRecoveredDispatch = {
      ...legacy,
      apiKeyIndex: 19,
      acknowledgeable: false,
    };
    const listAction: PerpsControllerGetRecoveredDispatchesAction['type'] =
      'PerpsController:getRecoveredDispatches';
    const ackAction: PerpsControllerAcknowledgeRecoveredDispatchAction['type'] =
      'PerpsController:acknowledgeRecoveredDispatch';
    expect([
      legacy.apiKeyIndex,
      pending.acknowledgeable,
      listAction,
      ackAction,
    ]).toStrictEqual([
      undefined,
      false,
      'PerpsController:getRecoveredDispatches',
      'PerpsController:acknowledgeRecoveredDispatch',
    ]);
    expect([
      LIGHTER_MIN_TRADING_API_KEY_INDEX,
      LIGHTER_MAX_TRADING_API_KEY_INDEX,
      LIGHTER_TRADING_API_KEY_COUNT,
      LIGHTER_KEY_REGISTRATION_VISIBILITY_TIMEOUT_MS,
      LIGHTER_KEY_REGISTRATION_VISIBILITY_POLL_MS,
      LIGHTER_KEY_REGISTRATION_VISIBILITY_MAX_ATTEMPTS,
      LIGHTER_FILL_REPLAY_LIMIT,
    ]).toStrictEqual([2, 254, 253, 10000, 250, 40, 100]);
  });

  it('exports the EIP-712 shape of a HyperLiquid L1 action', () => {
    expect(HYPERLIQUID_L1_ACTION_DOMAIN_NAME).toBe('Exchange');
    expect(HYPERLIQUID_L1_ACTION_PRIMARY_TYPE).toBe('Agent');
  });

  it('exposes the agent and preparation methods on PerpsController', () => {
    expect(typeof PerpsController.prototype.setAgentSigner).toBe('function');
    expect(typeof PerpsController.prototype.clearAgentSigners).toBe('function');
    expect(typeof PerpsController.prototype.prepareTradingWallet).toBe(
      'function',
    );
  });

  it('exports the signer types and action types', () => {
    const payload: PerpsTypedDataPayload = {
      domain: {
        name: HYPERLIQUID_L1_ACTION_DOMAIN_NAME,
        version: '1',
        chainId: 1337,
        verifyingContract: '0x0000000000000000000000000000000000000000',
      },
      types: {},
      primaryType: HYPERLIQUID_L1_ACTION_PRIMARY_TYPE,
      message: {},
    };
    const accountSigner: PerpsAccountSigner = {
      signTypedData: async () => '0x',
      signPersonalMessage: async () => '0x',
    };
    const agentSigner: PerpsAgentSigner = {
      address: '0x0000000000000000000000000000000000000001',
      signTypedData: async () => '0x',
    };
    const account: PerpsAgentAccount = {
      mainAddress: '0x0000000000000000000000000000000000000002',
      isTestnet: true,
    };
    const actionTypes: [
      PerpsControllerSetAgentSignerAction['type'],
      PerpsControllerClearAgentSignersAction['type'],
      PerpsControllerPrepareTradingWalletAction['type'],
    ] = [
      'PerpsController:setAgentSigner',
      'PerpsController:clearAgentSigners',
      'PerpsController:prepareTradingWallet',
    ];

    expect([payload, accountSigner, agentSigner, account]).toHaveLength(4);
    expect(actionTypes).toStrictEqual([
      'PerpsController:setAgentSigner',
      'PerpsController:clearAgentSigners',
      'PerpsController:prepareTradingWallet',
    ]);
  });
});
