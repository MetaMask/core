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
} from '../src/index.js';

describe('@metamask/perps-controller public API', () => {
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
